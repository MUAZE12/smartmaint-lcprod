// ============================================================
// Server-side email helper — chooses Resend or Gmail SMTP based
// on which env vars are set.
//
// Priority:
//   1. Gmail SMTP if GMAIL_USER + GMAIL_APP_PASSWORD are set
//      → unlimited recipients, no domain verification needed
//   2. Resend if RESEND_API_KEY is set
//      → fast / reliable but free tier requires a verified domain
//        to send to addresses other than the Resend account email
//
// Used by /api/send-alert, /api/cron/daily-alerts, /api/instant-alert.
// ============================================================

import nodemailer from 'nodemailer';

export interface SendEmailResult {
    ok: boolean;
    provider: 'gmail' | 'resend' | 'none';
    id?: string;
    error?: string;
    statusCode?: number;
}

export interface EmailAttachment {
    filename: string;
    content: Buffer;
    contentType?: string;
}

export async function sendEmail(opts: {
    to: string | string[];
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
    const recipients = (Array.isArray(opts.to) ? opts.to : String(opts.to).split(','))
        .map(s => String(s).trim())
        .filter(Boolean);
    if (recipients.length === 0) {
        return { ok: false, provider: 'none', error: 'Aucun destinataire valide.' };
    }

    // ── Path A — Gmail SMTP (preferred when configured: works to anyone) ──
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailUser && gmailPass) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailPass },
            });
            const fromName = process.env.ALERT_FROM_NAME || 'SmartMaint — L.C PROD';
            const info = await transporter.sendMail({
                from: `"${fromName}" <${gmailUser}>`,
                to: recipients.join(', '),
                subject: opts.subject,
                html: opts.html,
                attachments: opts.attachments?.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType ?? 'application/octet-stream',
                })),
            });
            return { ok: true, provider: 'gmail', id: info.messageId };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[email] Gmail SMTP error:', msg);
            // If Gmail explicitly fails, fall through to Resend (if configured)
            // so an outage on one provider doesn't kill alerts entirely.
        }
    }

    // ── Path B — Resend ──
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
        try {
            const from = process.env.ALERT_FROM || 'SmartMaint L.C PROD <onboarding@resend.dev>';
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from, to: recipients, subject: opts.subject, html: opts.html,
                    attachments: opts.attachments?.map(a => ({
                        filename: a.filename,
                        content: a.content.toString('base64'),
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const detail = data?.message || data?.name || JSON.stringify(data);
                console.warn('[email] Resend rejected:', res.status, detail);
                const hint = (detail || '').toString().toLowerCase().includes('domain')
                    || (detail || '').toString().toLowerCase().includes('verify')
                    ? ' — Sur le plan gratuit Resend, le destinataire doit être l\'email du compte Resend. Configurez plutôt GMAIL_USER + GMAIL_APP_PASSWORD (variables Vercel) pour envoyer vers n\'importe quel destinataire.'
                    : '';
                return { ok: false, provider: 'resend', error: detail + hint, statusCode: res.status };
            }
            return { ok: true, provider: 'resend', id: data?.id ?? undefined };
        } catch (e) {
            return { ok: false, provider: 'resend', error: e instanceof Error ? e.message : 'Resend network error' };
        }
    }

    return {
        ok: false,
        provider: 'none',
        error: 'Aucun fournisseur d\'email configuré. Ajoutez GMAIL_USER + GMAIL_APP_PASSWORD (recommandé) ou RESEND_API_KEY dans les variables d\'environnement.',
    };
}
