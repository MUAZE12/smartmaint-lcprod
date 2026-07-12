// ============================================================
// POST /api/instant-alert — Supabase Database Webhook receiver.
//
// Phase 2 enhancements:
//   • cooldown — dedup same-key alerts within N minutes
//   • quiet hours — suppress non-critical alerts at night
//   • alert_history — log every attempt (success or skipped)
//   • server-side auto-reorder — when stock crosses the threshold,
//       create a purchase requisition row automatically (no admin login)
//
// Webhook payload from Supabase:
//   { type, table, record, old_record }
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import {
    loadAlertSettings, isQuietHour, isOnCooldown, stampCooldown, logHistory,
    buildBilingualWrapper, channelsForSeverity, generateAckToken,
    recipientsForCategory, sendWhatsApp,
} from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    record: Record<string, unknown>;
    old_record?: Record<string, unknown>;
}

const FR = 'fr';
const AR = 'ar';

export async function POST(request: Request) {
    // ── Auth ──
    const cronSecret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') ?? '';
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
        return Response.json({ ok: false, error: 'Unauthorized webhook call' }, { status: 401 });
    }

    let body: WebhookPayload;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const { type, table, record, old_record } = body;
    if (!type || !table || !record) {
        return Response.json({ ok: false, error: 'Malformed webhook payload' }, { status: 400 });
    }

    // ── Connect with service role (bypasses RLS, reads everything) ──
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const settings = await loadAlertSettings(sb);

    // ── Determine what kind of alert (if any) ──
    type AlertCategory = 'panne' | 'stock' | 'haccp';
    type Severity = 'info' | 'warning' | 'critical';
    let category: AlertCategory | null = null;
    let severity: Severity = 'info';
    let cooldownKey = '';
    let titleFr = '';
    let titleAr = '';
    let bodyFr = '';
    let bodyAr = '';

    const today = new Date().toISOString().slice(0, 10);

    if (table === 'machines' && type === 'UPDATE') {
        const newStatus = String(record.status ?? '');
        const oldStatus = String(old_record?.status ?? '');
        if (newStatus === 'en panne' && oldStatus !== 'en panne' && settings.breakdowns) {
            category = 'panne';
            severity = 'critical';
            cooldownKey = `panne:${record.id}`;
            titleFr = `🔴 Panne — ${record.code} (${record.name})`;
            titleAr = `🔴 عطل — ${record.code} (${record.name})`;
            bodyFr = `<p><b>${record.code}</b> — ${record.name}<br>Atelier&nbsp;: ${record.workshop ?? '—'}<br>Statut&nbsp;: passe de <b>${oldStatus}</b> à <b>en panne</b>.<br>Une intervention corrective est requise.</p>`;
            bodyAr = `<p><b>${record.code}</b> — ${record.name}<br>الورشة&nbsp;: ${record.workshop ?? '—'}<br>الحالة&nbsp;: انتقلت من <b>${oldStatus}</b> إلى <b>عطل</b>.<br>التدخل التصحيحي مطلوب.</p>`;
        }
    } else if (table === 'spare_parts' && type === 'UPDATE') {
        const qty = Number(record.quantity ?? 0);
        const min = Number(record.minimumStock ?? 0);
        const oldQty = Number(old_record?.quantity ?? qty + 1);
        // Only fire when CROSSING the threshold downwards
        if (qty <= min && oldQty > min && settings.stock) {
            category = 'stock';
            severity = 'warning';
            cooldownKey = `stock:${record.id}`;
            titleFr = `📦 Stock critique — ${record.name}`;
            titleAr = `📦 مخزون منخفض — ${record.name}`;
            bodyFr = `<p><b>${record.name}</b> (${record.reference})<br>Stock actuel&nbsp;: <b style="color:#dc2626">${qty}</b> / seuil ${min}.</p>`;
            bodyAr = `<p><b>${record.name}</b> (${record.reference})<br>المخزون الحالي&nbsp;: <b style="color:#dc2626">${qty}</b> / الحد الأدنى ${min}.</p>`;

            // ── Server-side AUTO-REORDER (no admin login required) ──
            if (settings.autoreorder) {
                await tryAutoReorder(sb, {
                    sparePartId: String(record.id),
                    sparePartName: String(record.name),
                    currentQty: qty,
                    minimumStock: min,
                    unitCost: Number(record.unitCost ?? 0),
                    machineId: (record.machineId as string | null) ?? null,
                });
            }
        }
    } else if (table === 'haccp_records' && (type === 'INSERT' || type === 'UPDATE')) {
        const nextDue = String(record.nextDueDate ?? '');
        if (nextDue && nextDue < today && settings.haccp) {
            category = 'haccp';
            severity = 'warning';
            cooldownKey = `haccp:${record.id}`;
            titleFr = `🛡️ HACCP en retard — ${record.checkType}`;
            titleAr = `🛡️ HACCP متأخّر — ${record.checkType}`;
            bodyFr = `<p>Type&nbsp;: <b>${record.checkType}</b><br>Machine&nbsp;: ${record.machineId}<br>Échéance dépassée&nbsp;: ${nextDue}</p>`;
            bodyAr = `<p>النوع&nbsp;: <b>${record.checkType}</b><br>الآلة&nbsp;: ${record.machineId}<br>تاريخ الاستحقاق المنقضي&nbsp;: ${nextDue}</p>`;
        }
    }

    // Not alert-worthy → return 200 so Supabase doesn't retry
    if (!category) {
        return Response.json({ ok: true, skipped: 'no alert condition matched' });
    }

    // ── Master enabled ──
    if (!settings.enabled) {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: settings.recipients,
            status: 'skipped', errorMsg: 'alerts disabled in settings',
            entityTable: table, entityId: String(record.id),
        });
        return Response.json({ ok: true, skipped: 'alerts disabled' });
    }

    // ── Recipients ──
    if (settings.recipients.length === 0) {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: [],
            status: 'skipped', errorMsg: 'no recipient configured',
            entityTable: table, entityId: String(record.id),
        });
        return Response.json({ ok: true, skipped: 'no recipient configured' });
    }

    // ── Quiet hours (only suppresses non-critical) ──
    if (isQuietHour(settings) && severity !== 'critical') {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: settings.recipients,
            status: 'skipped', errorMsg: `quiet hours ${settings.quietStartHour}h-${settings.quietEndHour}h UTC`,
            entityTable: table, entityId: String(record.id),
        });
        return Response.json({ ok: true, skipped: 'quiet hours (non-critical suppressed)' });
    }

    // ── Cooldown — same condition fired recently? ──
    if (await isOnCooldown(sb, cooldownKey, settings.cooldownMinutes)) {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: settings.recipients,
            status: 'skipped', errorMsg: `cooldown active (${settings.cooldownMinutes} min)`,
            entityTable: table, entityId: String(record.id),
        });
        return Response.json({ ok: true, skipped: 'cooldown active' });
    }

    // ── Subscriptions (Phase 2): per-recipient routing + channel preferences ──
    const subs = await recipientsForCategory(sb, settings, category);
    if (subs.length === 0) {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: [],
            status: 'skipped', errorMsg: 'no subscriber for this category at this hour',
            entityTable: table, entityId: String(record.id),
        });
        return Response.json({ ok: true, skipped: 'no subscribers' });
    }

    // ── Severity routing (Phase 2): which channels for this severity ──
    const routedChannels = channelsForSeverity(settings, severity);
    const emailRecipients = subs
        .filter(s => routedChannels.includes('email') && (s.channels.includes('email') || s.channels.includes('all')))
        .map(s => s.email);
    const whatsappRecipients = settings.whatsappEnabled
        ? subs.filter(s => routedChannels.includes('whatsapp') && s.phone
            && (s.channels.includes('whatsapp') || s.channels.includes('all')))
        : [];

    // ── Ack token (one per send, attached to history) ──
    const ackToken = generateAckToken();
    const ackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smartmaint-lcprod.vercel.app'}/api/alert-ack/${ackToken}`;

    // ── Send email (only to recipients who opted in) ──
    let provider: string | undefined;
    let emailOk = true;
    let emailError: string | undefined;
    if (emailRecipients.length > 0) {
        const html = buildBilingualWrapper({ titleFr, titleAr, bodyFr, bodyAr, ackUrl, severity });
        const send = await sendEmail({ to: emailRecipients, subject: titleFr, html });
        emailOk = send.ok;
        emailError = send.error;
        provider = send.provider;
    }

    // ── Send WhatsApp (best-effort, doesn't block email path) ──
    let whatsappCount = 0;
    for (const sub of whatsappRecipients) {
        if (!sub.phone) continue;
        const r = await sendWhatsApp({
            to: sub.phone,
            body: `${titleFr}\n\n${bodyFr.replace(/<[^>]+>/g, '')}\n\n→ ${ackUrl}`,
        });
        if (r.ok) whatsappCount++;
    }

    // ── Bail if email failed AND no WhatsApp went out ──
    if (!emailOk && whatsappCount === 0) {
        await logHistory(sb, {
            source: 'instant', category, severity,
            subject: titleFr, recipients: emailRecipients,
            provider, status: 'failed', errorMsg: emailError,
            entityTable: table, entityId: String(record.id),
            ackToken,
        });
        return Response.json({ ok: false, error: emailError, provider }, { status: 502 });
    }

    // Stamp cooldown + log success
    await stampCooldown(sb, cooldownKey);
    await logHistory(sb, {
        source: 'instant', category, severity,
        subject: titleFr, recipients: emailRecipients,
        provider, status: 'sent',
        entityTable: table, entityId: String(record.id),
        ackToken,
    });

    return Response.json({
        ok: true, provider, table, type,
        emailRecipients: emailRecipients.length,
        whatsappSent: whatsappCount,
        ackUrl,
    });
}

// ─── Server-side auto-reorder ────────────────────────────────
// Use SupabaseClient<any> to dodge the strict generic that infers
// from createClient with no schema arg — fine here because we control
// the queries below and supply explicit field names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryAutoReorder(sb: any, opts: {
    sparePartId: string;
    sparePartName: string;
    currentQty: number;
    minimumStock: number;
    unitCost: number;
    machineId: string | null;
}) {
    // Skip if there's already an open PR covering this part
    const { data: openLines } = await sb
        .from('purchase_requisition_lines')
        .select('id, requisitionId, sparePartId')
        .eq('sparePartId', opts.sparePartId);

    if (openLines && openLines.length > 0) {
        // Look up the parent requisition statuses
        const reqIds = (openLines as Array<{ requisitionId: string }>).map(l => l.requisitionId);
        const { data: reqs } = await sb
            .from('purchase_requisitions')
            .select('id, status')
            .in('id', reqIds);
        const openOnes = ((reqs ?? []) as Array<{ id: string; status: string }>).filter(r =>
            r.status !== 'convertie' && r.status !== 'rejetée');
        if (openOnes.length > 0) {
            return; // already covered by an open PR — don't duplicate
        }
    }

    const reqNumber = 'REQ-AUTO-' + Date.now().toString(36).toUpperCase();
    const qty = Math.max(opts.minimumStock, opts.minimumStock * 2 - opts.currentQty);
    const reqId = `req-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    await sb.from('purchase_requisitions').insert({
        id: reqId,
        reqNumber,
        status: 'soumise',
        machineId: opts.machineId,
        interventionId: null,
        requestedBy: 'Réapprovisionnement automatique (serveur)',
        notes: `Stock critique — ${opts.sparePartName} : ${opts.currentQty} en stock / seuil ${opts.minimumStock}. Créée automatiquement par /api/instant-alert.`,
        createdAt: new Date().toISOString(),
    });

    await sb.from('purchase_requisition_lines').insert({
        id: `rql-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        requisitionId: reqId,
        sparePartId: opts.sparePartId,
        quantity: qty,
        estimatedUnitCost: opts.unitCost,
        createdAt: new Date().toISOString(),
    });
}
