// ============================================================
// GET /api/cron/weekly-report — server-side weekly digest.
//
// Vercel cron fires every Monday at 07:00 UTC. Reads the last 7
// days of activity from Supabase, composes a richer digest than
// the daily, and emails it to every recipient in app_settings.
//
// No admin session required.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { logHistory } from '@/lib/alerts';
import { buildWeeklyReportPDF, type WeeklyReportData } from '@/lib/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface InterventionRow {
    id: string; machineId: string; status: string;
    interventionType: string; downtimeHours: number; totalCost: number;
    createdAt: string;
}

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ ok: false, error: 'Unauthorized cron call' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: settingsRows } = await sb.from('app_settings').select('key, value');
    const cfg: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });

    // The weekly report has its own enable toggle; falls back to global if unset.
    const weeklyEnabled = (cfg['report_enabled'] ?? cfg['alert_enabled']) !== 'off';
    if (!weeklyEnabled) {
        return Response.json({ ok: true, skipped: 'weekly report disabled' });
    }
    const recipients = (cfg['alert_email'] ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
        return Response.json({ ok: true, skipped: 'no recipient configured' });
    }

    // ── Pull 7-day window ──
    const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [intvRes, plansRes, haccpRes, batchRes] = await Promise.all([
        sb.from('interventions').select('id, machineId, status, interventionType, downtimeHours, totalCost, createdAt').gte('createdAt', sinceIso),
        sb.from('maintenance_plans').select('id, machineId, title, lastDoneDate').gte('lastDoneDate', sinceIso),
        sb.from('haccp_records').select('id, machineId, result, checkDate').gte('checkDate', sinceIso),
        sb.from('production_batches').select('id, batchNumber, productName, actualQty, plannedQty, startedAt').gte('startedAt', sinceIso),
    ]);

    const interventions = (intvRes.data ?? []) as InterventionRow[];
    const closed = interventions.filter(i => i.status === 'terminée' || i.status === 'clôturée');
    const corrective = interventions.filter(i => i.interventionType === 'corrective').length;
    const preventive = interventions.filter(i => i.interventionType === 'préventive').length;
    const totalDowntime = interventions.reduce((s, i) => s + (i.downtimeHours || 0), 0);
    const totalCost = interventions.reduce((s, i) => s + (i.totalCost || 0), 0);
    const avgMTTR = closed.length ? totalDowntime / closed.length : 0;

    const planRunsDone = (plansRes.data ?? []).length;
    const haccpDone = (haccpRes.data ?? []).length;
    const haccpNonConforme = (haccpRes.data ?? []).filter(h => h.result === 'non conforme').length;
    const batches = (batchRes.data ?? []);
    const totalProduced = batches.reduce((s, b) => s + Number(b.actualQty ?? 0), 0);
    const totalPlanned = batches.reduce((s, b) => s + Number(b.plannedQty ?? 0), 0);
    const yieldPct = totalPlanned ? Math.round((totalProduced / totalPlanned) * 100) : null;

    // ── HTML body ──
    const row = (label: string, value: string, color = '#1e293b') => `
        <tr>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">${label}</td>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:${color};text-align:right">${value}</td>
        </tr>
    `;
    const fmtDate = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const fmtSince = new Date(sinceIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

    const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1e293b">
            <div style="text-align:center;margin-bottom:24px">
                <div style="display:inline-block;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:8px 18px;border-radius:100px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">SmartMaint &mdash; L.C PROD</div>
                <h1 style="font-size:24px;font-weight:800;margin:14px 0 4px;letter-spacing:-0.02em">📊 Rapport hebdomadaire</h1>
                <div style="font-size:13px;color:#64748b">Période : ${fmtSince} → ${fmtDate}</div>
            </div>

            <h3 style="font-size:15px;font-weight:700;color:#1e40af;margin:18px 0 8px;border-bottom:2px solid #3b82f6;padding-bottom:6px">🔧 Maintenance</h3>
            <table style="width:100%;border-collapse:collapse">
                ${row('Interventions totales', `${interventions.length}`)}
                ${row('Interventions clôturées', `${closed.length}`)}
                ${row('Correctives / Préventives', `${corrective} / ${preventive}`)}
                ${row('MTTR moyen', `${avgMTTR.toFixed(2)} h`)}
                ${row('Temps d\'arrêt total', `${totalDowntime.toFixed(1)} h`)}
                ${row('Coût total maintenance', `${totalCost.toLocaleString()} MAD`)}
                ${row('Plans préventifs réalisés', `${planRunsDone}`)}
            </table>

            <h3 style="font-size:15px;font-weight:700;color:#10b981;margin:18px 0 8px;border-bottom:2px solid #10b981;padding-bottom:6px">🛡️ Conformité HACCP</h3>
            <table style="width:100%;border-collapse:collapse">
                ${row('Contrôles effectués', `${haccpDone}`)}
                ${row('Non conformes', `${haccpNonConforme}`, haccpNonConforme > 0 ? '#dc2626' : '#1e293b')}
            </table>

            <h3 style="font-size:15px;font-weight:700;color:#f59e0b;margin:18px 0 8px;border-bottom:2px solid #f59e0b;padding-bottom:6px">🏭 Production</h3>
            <table style="width:100%;border-collapse:collapse">
                ${row('Lots produits', `${batches.length}`)}
                ${row('Quantité produite', `${totalProduced.toLocaleString()}`)}
                ${row('Quantité planifiée', `${totalPlanned.toLocaleString()}`)}
                ${row('Rendement', yieldPct === null ? '—' : `${yieldPct} %`, yieldPct !== null && yieldPct < 90 ? '#dc2626' : '#1e293b')}
            </table>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 14px">
            <p style="font-size:11.5px;color:#94a3b8;text-align:center;line-height:1.6">
                Rapport généré automatiquement chaque lundi à 07:00 UTC<br>
                Configuration des destinataires : <a href="https://smartmaint-lcprod.vercel.app/alertes" style="color:#3b82f6">page Alertes &amp; rapports</a>
            </p>
        </div>
    `;

    // ── Build the PDF attachment (server-side, ~50 KB) ──
    const pdfData: WeeklyReportData = {
        fromDate: fmtSince,
        toDate: fmtDate,
        interventions: interventions.length,
        closedInterventions: closed.length,
        corrective, preventive,
        avgMTTR, totalDowntime, totalCost,
        planRunsDone,
        haccpDone, haccpNonConforme,
        batches: batches.length,
        totalProduced, totalPlanned, yieldPct,
    };
    let pdfBuffer: Buffer | undefined;
    try { pdfBuffer = await buildWeeklyReportPDF(pdfData); }
    catch (e) { console.warn('[cron/weekly-report] PDF generation failed:', e); }

    const subject = `📊 Rapport hebdo SmartMaint — sem. du ${fmtSince}`;
    const send = await sendEmail({
        to: recipients, subject, html,
        attachments: pdfBuffer ? [{
            filename: `rapport-hebdo-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
        }] : undefined,
    });
    if (!send.ok) {
        await logHistory(sb, {
            source: 'cron-weekly', category: 'weekly', severity: 'info',
            subject, recipients, provider: send.provider, status: 'failed', errorMsg: send.error,
        });
        return Response.json({ ok: false, error: send.error, provider: send.provider }, { status: 502 });
    }
    await logHistory(sb, {
        source: 'cron-weekly', category: 'weekly', severity: 'info',
        subject, recipients, provider: send.provider, status: 'sent',
    });

    return Response.json({
        ok: true, provider: send.provider, sentTo: recipients.length,
        interventions: interventions.length, plansDone: planRunsDone,
        haccpDone, haccpNonConforme, batches: batches.length,
    });
}
