// ============================================================
// GET /api/cron/meeting-reminders — morning-of reminder.
//
// Vercel Hobby tier only allows daily crons, so we send a single
// digest each morning at 06:00 UTC listing every meeting happening
// in the next 24 h. reminder_sent_at is stamped per meeting so we
// never send a second reminder for the same meeting.
//
// To upgrade to a true 1-hour-before reminder, move to Vercel Pro
// and change the schedule in vercel.json to "0 * * * *".
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { buildBilingualWrapper, logHistory } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MeetingRow {
    id: string;
    title: string;
    location: string | null;
    starts_at: string;
    duration_min: number;
    agenda: string | null;
    attendees: string[];
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

    // Window: meetings starting in the next 24 h (Hobby cron = daily fire)
    const now = Date.now();
    const winStart = new Date(now).toISOString();
    const winEnd = new Date(now + 24 * 60 * 60_000).toISOString();

    const { data, error } = await sb.from('meetings')
        .select('id, title, location, starts_at, duration_min, agenda, attendees, reminder_sent_at')
        .gte('starts_at', winStart).lte('starts_at', winEnd)
        .is('reminder_sent_at', null);
    if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    const meetings = (data ?? []) as (MeetingRow & { reminder_sent_at: string | null })[];
    if (meetings.length === 0) {
        return Response.json({ ok: true, scanned: 0 });
    }

    const sent: string[] = [];
    for (const m of meetings) {
        const attendees = Array.isArray(m.attendees) ? m.attendees.filter(Boolean) : [];
        if (attendees.length === 0) {
            await sb.from('meetings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', m.id);
            continue;
        }

        const start = new Date(m.starts_at);
        const when = start.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
        const whenAr = start.toLocaleString('ar-MA', { dateStyle: 'full', timeStyle: 'short' });
        const hoursLeft = Math.max(0, Math.round((start.getTime() - now) / 3600_000));
        const timeStr = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const bodyFr = `
            <p style="font-size:14px"><b>${m.title}</b></p>
            <p style="font-size:13px;line-height:1.6">
                📅 <b>Aujourd'hui à ${timeStr}</b> (dans ~${hoursLeft} h)<br>
                ${m.location ? `📍 ${m.location}<br>` : ''}
                ⏱ Durée : ${m.duration_min} min
            </p>
            ${m.agenda ? `<p style="font-size:13px;line-height:1.55"><b>Ordre du jour :</b><br>${m.agenda.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : ''}
        `;
        const bodyAr = `
            <p style="font-size:14px;text-align:right"><b>${m.title}</b></p>
            <p style="font-size:13px;line-height:1.6;text-align:right">
                📅 <b>اليوم على الساعة ${timeStr}</b> (خلال ~${hoursLeft} ساعة)<br>
                ${m.location ? `📍 ${m.location}<br>` : ''}
            </p>
            <p style="font-size:11px;color:#94a3b8;text-align:right">${whenAr}</p>
        `;
        const html = buildBilingualWrapper({
            titleFr: `📅 Rappel — réunion aujourd'hui à ${timeStr}`,
            titleAr: `📅 تذكير — اجتماع اليوم على الساعة ${timeStr}`,
            bodyFr, bodyAr, severity: 'warning',
        });

        const send = await sendEmail({ to: attendees, subject: `📅 Rappel réunion ce jour : ${m.title}`, html });

        // In-app notifications
        const notifs = attendees.map(email => ({
            id: `nf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            recipient_email: email,
            kind: 'meeting-reminder',
            title: `📅 Réunion aujourd'hui à ${timeStr} : ${m.title}`,
            body: `${when}${m.location ? ` — ${m.location}` : ''}`,
            link: null,
        }));
        await sb.from('notifications').insert(notifs);

        await sb.from('meetings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', m.id);

        await logHistory(sb, {
            source: 'cron-daily',
            category: 'test',
            severity: 'warning',
            subject: `Rappel réunion : ${m.title}`,
            recipients: attendees,
            provider: send.provider,
            status: send.ok ? 'sent' : 'failed',
            errorMsg: send.error,
            entityTable: 'meetings',
            entityId: m.id,
        });
        if (send.ok) sent.push(m.id);
    }

    return Response.json({ ok: true, scanned: meetings.length, sent: sent.length });
}
