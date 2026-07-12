// ============================================================
// GET /api/cron/daily-alerts — server-side daily digest.
//
// Vercel Cron fires this once a day. The route reads the current
// state of the parc directly from Supabase (no browser needed),
// composes a single digest email, and sends it via Resend to every
// recipient listed in app_settings.alert_email.
//
// Schedule lives in vercel.json. The default is 07:00 UTC (≈ 08:00
// Morocco in winter, 09:00 in summer).
//
// Auth: Vercel attaches an Authorization: Bearer <CRON_SECRET>
// header automatically if CRON_SECRET is set in the project env.
// Without that header we refuse to run, so this URL can't be hit by
// the public to spam emails.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { logHistory, loadAlertSettings } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UnackedRow { id: string; subject: string; severity: string; createdAt: string; recipients: string[] }

interface SparePartRow {
    id: string; name: string; reference: string; quantity: number; minimumStock: number;
    machineId?: string | null;
}
interface MachineRow {
    id: string; code: string; name: string; workshop: string; status: string;
}
interface HaccpRow {
    id: string; machineId: string; checkType: string; nextDueDate: string | null;
}

export async function GET(request: Request) {
    // ── Auth — Vercel cron attaches a bearer if CRON_SECRET is set ──
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ ok: false, error: 'Unauthorized cron call' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Service-role bypasses RLS so the cron can read everything regardless of
    // policies. The key MUST stay server-only — never expose it to the client.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return Response.json(
            { ok: false, error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
            { status: 500 },
        );
    }
    // Email provider auto-detected by sendEmail() (Gmail SMTP or Resend).

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── Pull settings ──
    const { data: settingsRows } = await sb.from('app_settings').select('key, value');
    const cfg: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });

    if (cfg['alert_enabled'] === 'off') {
        return Response.json({ ok: true, skipped: 'alerts disabled' });
    }
    const recipients = (cfg['alert_email'] ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
        return Response.json({ ok: true, skipped: 'no recipient configured' });
    }

    const wantBreakdowns = cfg['alert_breakdowns'] !== 'off';
    const wantHaccp = cfg['alert_haccp'] !== 'off';
    const wantStock = cfg['alert_stock'] !== 'off';

    // ── Query current state ──
    const today = new Date().toISOString().slice(0, 10);
    const [machinesRes, partsRes, haccpRes] = await Promise.all([
        wantBreakdowns
            ? sb.from('machines').select('id, code, name, workshop, status').in('status', ['en panne', 'en maintenance'])
            : Promise.resolve({ data: [] as MachineRow[] }),
        wantStock ? sb.from('spare_parts').select('id, name, reference, quantity, "minimumStock", "machineId"') : Promise.resolve({ data: [] as SparePartRow[] }),
        wantHaccp ? sb.from('haccp_records').select('id, "machineId", "checkType", "nextDueDate"').lt('nextDueDate', today) : Promise.resolve({ data: [] as HaccpRow[] }),
    ]);
    const brokenMachines = (machinesRes.data ?? []) as MachineRow[];
    const lowStock = ((partsRes.data ?? []) as SparePartRow[]).filter(p => p.quantity <= p.minimumStock);
    const overdueHaccp = (haccpRes.data ?? []) as HaccpRow[];

    const totalIssues = brokenMachines.length + lowStock.length + overdueHaccp.length;

    // ── Compose digest HTML ──
    const fmtDate = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const section = (title: string, color: string, rows: string[]) => rows.length === 0 ? '' : `
        <h3 style="font-size:15px;font-weight:700;color:${color};margin:18px 0 8px;border-bottom:2px solid ${color};padding-bottom:6px">${title} (${rows.length})</h3>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;line-height:1.55">${rows.map(r => `<li style="margin-bottom:4px">${r}</li>`).join('')}</ul>
    `;

    let body: string;
    if (totalIssues === 0) {
        body = `<p style="font-size:14px;color:#16a34a;background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:8px;margin:14px 0"><b>✅ Aucun incident à signaler aujourd'hui.</b><br>Le parc est nominal — bon travail !</p>`;
    } else {
        body = `<p style="font-size:14px;color:#991b1b;background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:8px;margin:14px 0"><b>${totalIssues} point${totalIssues > 1 ? 's' : ''} d'attention à traiter aujourd'hui.</b></p>` +
            section('🔴 Machines en panne ou en maintenance', '#dc2626', brokenMachines.map(m => `<b>${m.code}</b> — ${m.name} <span style="color:#94a3b8">(${m.workshop}, ${m.status})</span>`)) +
            section('📦 Stock critique', '#f59e0b', lowStock.map(p => `<b>${p.reference}</b> — ${p.name} : <span style="color:#dc2626;font-weight:700">${p.quantity}</span> en stock / seuil ${p.minimumStock}`)) +
            section('🛡️ Contrôles HACCP en retard', '#0891b2', overdueHaccp.map(r => `Machine <b>${r.machineId}</b> · ${r.checkType} (échéance ${r.nextDueDate})`));
    }

    const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e293b">
            <div style="text-align:center;margin-bottom:22px">
                <div style="display:inline-block;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:8px 18px;border-radius:100px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">SmartMaint &mdash; L.C PROD</div>
                <h1 style="font-size:22px;font-weight:800;margin:14px 0 4px;letter-spacing:-0.02em">📋 Rapport quotidien</h1>
                <div style="font-size:13px;color:#64748b;text-transform:capitalize">${fmtDate}</div>
            </div>
            ${body}
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="font-size:11.5px;color:#94a3b8;text-align:center;line-height:1.6">
                E-mail automatique généré par SmartMaint &mdash; L.C PROD<br>
                Configuration : <a href="https://smartmaint-lcprod.vercel.app/alertes" style="color:#3b82f6">page Alertes &amp; rapports</a>
            </p>
        </div>
    `;

    // ── Send (Gmail SMTP or Resend) ──
    const subject = totalIssues === 0
        ? `✅ Rapport quotidien — parc nominal`
        : `📋 Rapport quotidien — ${totalIssues} point${totalIssues > 1 ? 's' : ''} d'attention`;

    const send = await sendEmail({ to: recipients, subject, html });
    if (!send.ok) {
        console.warn('[cron/daily-alerts] send failed:', send.error);
        await logHistory(sb, {
            source: 'cron-daily', category: 'digest', severity: 'info',
            subject, recipients, provider: send.provider, status: 'failed', errorMsg: send.error,
        });
        return Response.json({ ok: false, error: send.error, provider: send.provider }, { status: 502 });
    }
    await logHistory(sb, {
        source: 'cron-daily', category: 'digest', severity: 'info',
        subject, recipients, provider: send.provider, status: 'sent',
    });

    // ── Phase 2: Escalation — re-ping any critical alert unacked for >escalationMinutes ──
    const settings = await loadAlertSettings(sb);
    const sinceIso = new Date(Date.now() - settings.escalationMinutes * 60_000).toISOString();
    const { data: unacked } = await sb
        .from('alert_history')
        .select('id, subject, severity, createdAt, recipients')
        .eq('severity', 'critical')
        .eq('status', 'sent')
        .is('ack_at', null)
        .lt('createdAt', sinceIso)
        .order('createdAt', { ascending: false })
        .limit(20);
    const escalated: string[] = [];
    for (const row of (unacked ?? []) as UnackedRow[]) {
        const escSubject = `⏫ ESCALADE — ${row.subject}`;
        const escHtml = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e293b">
                <h2 style="color:#dc2626;margin:0 0 12px">⏫ Escalade — alerte critique non acquittée</h2>
                <p>L'alerte ci-dessous a été envoyée il y a plus de ${settings.escalationMinutes} min et personne ne l'a marquée « Pris en charge ».</p>
                <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:8px;margin:14px 0">
                    <b>${row.subject}</b><br>
                    Envoyée à : ${(row.recipients ?? []).join(', ')}<br>
                    Le : ${new Date(row.createdAt).toLocaleString('fr-FR')}
                </div>
                <p style="font-size:13px;color:#475569">Ouvrez SmartMaint pour traiter cette alerte ou cliquez le lien d'acquittement de l'e-mail d'origine.</p>
            </div>
        `;
        const escSend = await sendEmail({ to: recipients, subject: escSubject, html: escHtml });
        await logHistory(sb, {
            source: 'cron-daily', category: 'digest', severity: 'critical',
            subject: escSubject, recipients, provider: escSend.provider,
            status: escSend.ok ? 'sent' : 'failed', errorMsg: escSend.error,
        });
        if (escSend.ok) escalated.push(row.id);
    }

    return Response.json({
        ok: true,
        provider: send.provider,
        sentTo: recipients.length,
        brokenMachines: brokenMachines.length,
        lowStock: lowStock.length,
        overdueHaccp: overdueHaccp.length,
        escalated: escalated.length,
        emailId: send.id ?? null,
    });
}
