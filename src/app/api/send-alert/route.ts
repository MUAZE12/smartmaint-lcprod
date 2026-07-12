// ============================================================
// POST /api/send-alert — used by the in-app Test button and the
// browser-side AlertWatcher (admin sessions). Now delegates to
// lib/email which picks Gmail SMTP or Resend automatically.
// ============================================================

import { sendEmail } from '@/lib/email';
import { isApiCallAuthorized, unauthorizedResponse } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    if (!isApiCallAuthorized(request)) return unauthorizedResponse();
    try {
        const { to, subject, html } = await request.json();
        if (!to || !subject) {
            return Response.json({ ok: false, error: 'Destinataire et sujet requis.' }, { status: 400 });
        }
        const result = await sendEmail({ to, subject, html: html || subject });
        if (!result.ok) {
            return Response.json(
                { ok: false, error: result.error, provider: result.provider, statusFromResend: result.statusCode },
                { status: 502 },
            );
        }
        return Response.json({ ok: true, id: result.id ?? null, provider: result.provider });
    } catch (e) {
        return Response.json(
            { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue.' },
            { status: 500 },
        );
    }
}
