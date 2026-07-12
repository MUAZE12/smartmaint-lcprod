// ============================================================
// GET /api/cron/predictive-alerts — proactive failure prediction.
//
// Runs once per day at 06:30 UTC (just before the daily digest).
// For each machine, computes a simple-but-useful failure risk score
// from its corrective intervention history:
//
//   • days_since_last_corrective
//   • frequency_30d : corrective interventions in the last 30 days
//   • mtbf_180d     : mean time between corrective failures
//
//   risk = high      when frequency_30d ≥ 3  AND days_since_last < mtbf * 0.5
//   risk = medium    when frequency_30d ≥ 2  OR  days_since_last < mtbf * 0.7
//   risk = low/none  otherwise
//
// For each high/medium risk we email a heads-up to the alert recipients.
// Uses cooldown (24 h) to avoid spamming the same machine daily.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import {
    loadAlertSettings, logHistory, recipientsForCategory,
    isOnCooldown, stampCooldown, buildBilingualWrapper,
} from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MachineRow { id: string; code: string; name: string; workshop: string; status: string }
interface IntvRow { id: string; machineId: string; interventionType: string; startDate: string }

interface RiskProfile {
    machine: MachineRow;
    frequency30d: number;
    daysSinceLast: number;
    mtbfDays: number;
    risk: 'high' | 'medium';
    estimatedDays: number;
}

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') ?? '';
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
        return Response.json({ ok: false, error: 'Unauthorized cron call' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const settings = await loadAlertSettings(sb);
    if (!settings.enabled || !settings.breakdowns) {
        return Response.json({ ok: true, skipped: 'breakdown alerts disabled' });
    }

    // ── Pull data ──
    const sinceIso = new Date(Date.now() - 180 * 86400_000).toISOString();
    const [machinesRes, intvRes] = await Promise.all([
        sb.from('machines').select('id, code, name, workshop, status'),
        sb.from('interventions').select('id, machineId, interventionType, startDate').gte('startDate', sinceIso).eq('interventionType', 'corrective'),
    ]);
    const machines = (machinesRes.data ?? []) as MachineRow[];
    const intvs = (intvRes.data ?? []) as IntvRow[];

    // ── Compute risk per machine ──
    const now = Date.now();
    const risky: RiskProfile[] = [];
    for (const m of machines) {
        if (m.status === 'en panne') continue; // already broken — instant-alert handles it
        const mine = intvs.filter(i => i.machineId === m.id).sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));
        if (mine.length < 2) continue; // not enough history

        const frequency30d = mine.filter(i => now - +new Date(i.startDate) < 30 * 86400_000).length;
        const daysSinceLast = (now - +new Date(mine[0].startDate)) / 86400_000;
        // MTBF: average gap between consecutive corrective interventions
        let gapSum = 0;
        for (let i = 1; i < mine.length; i++) {
            gapSum += (+new Date(mine[i - 1].startDate) - +new Date(mine[i].startDate)) / 86400_000;
        }
        const mtbfDays = gapSum / (mine.length - 1);

        let risk: 'high' | 'medium' | null = null;
        if (frequency30d >= 3 && daysSinceLast < mtbfDays * 0.5) risk = 'high';
        else if (frequency30d >= 2 || daysSinceLast < mtbfDays * 0.7) risk = 'medium';
        if (!risk) continue;

        const estimatedDays = Math.max(0, Math.round(mtbfDays - daysSinceLast));
        risky.push({ machine: m, frequency30d, daysSinceLast, mtbfDays, risk, estimatedDays });
    }

    if (risky.length === 0) {
        return Response.json({ ok: true, scanned: machines.length, risky: 0 });
    }

    // ── Fire alerts (with cooldown so we don't email the same machine daily) ──
    const sent: string[] = [];
    const skipped: string[] = [];
    for (const r of risky) {
        const cooldownKey = `predictif:${r.machine.id}`;
        if (await isOnCooldown(sb, cooldownKey, 24 * 60)) { // 24h cooldown
            skipped.push(r.machine.code);
            continue;
        }
        const subs = await recipientsForCategory(sb, settings, 'panne');
        const emailRecipients = subs.filter(s => s.channels.includes('email') || s.channels.includes('all')).map(s => s.email);
        if (emailRecipients.length === 0) {
            skipped.push(r.machine.code);
            continue;
        }

        const severity = r.risk === 'high' ? 'critical' : 'warning';
        const titleFr = `🔮 Panne probable d'ici ${r.estimatedDays} j — ${r.machine.code}`;
        const titleAr = `🔮 عطل محتمل خلال ${r.estimatedDays} يوم — ${r.machine.code}`;
        const bodyFr = `
            <p><b>${r.machine.code}</b> — ${r.machine.name}<br>
            Atelier&nbsp;: ${r.machine.workshop ?? '—'}</p>
            <p>L'IA prédictive estime une panne probable dans <b>~${r.estimatedDays} jour${r.estimatedDays > 1 ? 's' : ''}</b>
            (risque <b>${r.risk === 'high' ? 'élevé' : 'modéré'}</b>).</p>
            <p style="font-size:11px;color:#475569;line-height:1.55">
                Signaux faibles&nbsp;:<br>
                • ${r.frequency30d} intervention${r.frequency30d > 1 ? 's' : ''} corrective${r.frequency30d > 1 ? 's' : ''} sur les 30 derniers jours<br>
                • ${r.daysSinceLast.toFixed(0)} j depuis la dernière panne (MTBF historique : ${r.mtbfDays.toFixed(0)} j)
            </p>
            <p><b>Action conseillée&nbsp;:</b> planifier un contrôle préventif dans les ${Math.max(1, Math.floor(r.estimatedDays / 2))} prochains jours.</p>
        `;
        const bodyAr = `
            <p><b>${r.machine.code}</b> — ${r.machine.name}<br>الورشة&nbsp;: ${r.machine.workshop ?? '—'}</p>
            <p>الذكاء التنبؤي يقدّر احتمال عطل خلال <b>~${r.estimatedDays} يوم</b> (خطر <b>${r.risk === 'high' ? 'مرتفع' : 'متوسط'}</b>).</p>
            <p><b>الإجراء الموصى به&nbsp;:</b> فحص وقائي خلال ${Math.max(1, Math.floor(r.estimatedDays / 2))} يوم.</p>
        `;

        const html = buildBilingualWrapper({ titleFr, titleAr, bodyFr, bodyAr, severity });
        const send = await sendEmail({ to: emailRecipients, subject: titleFr, html });
        if (send.ok) {
            await stampCooldown(sb, cooldownKey);
            sent.push(r.machine.code);
        }
        await logHistory(sb, {
            source: 'cron-daily', category: 'panne', severity,
            subject: titleFr, recipients: emailRecipients,
            provider: send.provider, status: send.ok ? 'sent' : 'failed',
            errorMsg: send.error, entityTable: 'machines', entityId: r.machine.id,
        });
    }

    return Response.json({
        ok: true,
        scanned: machines.length,
        risky: risky.length,
        sent: sent.length,
        skipped: skipped.length,
        sentCodes: sent,
    });
}
