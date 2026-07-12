// ============================================================
// POST /api/notify-employee — "Convoquer" button.
//
// Sends a quick email + creates an in-app notification row, so a
// technicien / ouvrier is reached whether they have the app open
// or not.
//
// Body: { email, name, subject?, message, kind? }
//   kind defaults to 'convocation'
// ============================================================

import { sendEmail } from '@/lib/email';
import { buildBilingualWrapper, logHistory } from '@/lib/alerts';
import { isApiCallAuthorized, unauthorizedResponse } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
    email: string;
    name?: string;
    subject?: string;
    message: string;
    kind?: 'convocation' | 'message';
}

export async function POST(request: Request) {
    if (!isApiCallAuthorized(request)) return unauthorizedResponse();
    let body: Body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const email = String(body.email ?? '').trim();
    const message = String(body.message ?? '').trim();
    if (!email || !message) {
        return Response.json({ ok: false, error: 'email + message required' }, { status: 400 });
    }
    const kind = body.kind === 'message' ? 'message' : 'convocation';
    const name = body.name ?? '';
    const subject = body.subject?.trim()
        || (kind === 'convocation' ? `Convocation — venir au bureau` : 'Message du responsable');

    const sbCtx = getSupabaseServerClient();
    if (!sbCtx) {
        return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    }
    const sb = sbCtx.client;

    // ── 1. In-app notification ──
    const notifId = `nf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await sb.from('notifications').insert({
        id: notifId,
        recipient_email: email,
        kind,
        title: subject,
        body: message,
        link: null,
    });

    // ── 2. Email ──
    const titleFr = kind === 'convocation'
        ? `📣 Convocation${name ? ` — ${name}` : ''}`
        : `📩 Message du responsable${name ? ` — ${name}` : ''}`;
    const titleAr = kind === 'convocation' ? '📣 استدعاء' : '📩 رسالة من المسؤول';
    const escapedMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const bodyFr = `
        <p style="font-size:14px;line-height:1.6">${escapedMessage}</p>
        <p style="font-size:12px;color:#64748b;margin-top:14px">Merci de répondre dans les meilleurs délais.</p>
    `;
    const bodyAr = `
        <p style="font-size:14px;line-height:1.6;text-align:right">${escapedMessage}</p>
        <p style="font-size:12px;color:#64748b;margin-top:14px;text-align:right">المرجو الرد في أقرب وقت.</p>
    `;
    const html = buildBilingualWrapper({ titleFr, titleAr, bodyFr, bodyAr, severity: 'warning' });
    const send = await sendEmail({ to: [email], subject, html });

    // ── 3. Log ──
    await logHistory(sb, {
        source: 'in-app',
        category: 'test',
        severity: 'warning',
        subject,
        recipients: [email],
        provider: send.provider,
        status: send.ok ? 'sent' : 'failed',
        errorMsg: send.error,
    });

    return Response.json({
        ok: true,
        emailOk: send.ok,
        provider: send.provider,
        notificationId: notifId,
        error: send.ok ? undefined : send.error,
    });
}
