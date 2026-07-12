// ============================================================
// POST /api/meetings   — create a meeting + notify all attendees
// GET  /api/meetings   — list upcoming meetings
// DELETE /api/meetings?id=… — cancel a meeting + notify attendees
//
// Meetings are for techniciens only — the UI enforces that.
// On create: emails every attendee + drops an in-app notification.
// ============================================================

import { sendEmail } from '@/lib/email';
import { buildBilingualWrapper, logHistory } from '@/lib/alerts';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CreateBody {
    title: string;
    location?: string;
    startsAt: string;        // ISO
    durationMin?: number;
    agenda?: string;
    attendees: string[];     // emails
    createdBy?: string;
}

function getSb() {
    const ctx = getSupabaseServerClient();
    return ctx?.client ?? null;
}

export async function GET() {
    const sb = getSb();
    if (!sb) return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    const { data, error } = await sb.from('meetings')
        .select('*').gte('starts_at', new Date(Date.now() - 86400_000).toISOString())
        .order('starts_at', { ascending: true });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, meetings: data ?? [] });
}

export async function POST(request: Request) {
    let body: CreateBody;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const title = String(body.title ?? '').trim();
    const startsAt = String(body.startsAt ?? '').trim();
    const attendees = (body.attendees ?? []).map(s => String(s).trim()).filter(Boolean);
    if (!title || !startsAt || attendees.length === 0) {
        return Response.json({ ok: false, error: 'title + startsAt + attendees required' }, { status: 400 });
    }

    const sb = getSb();
    if (!sb) return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });

    const id = `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const meeting = {
        id,
        title,
        location: body.location ?? null,
        starts_at: startsAt,
        duration_min: body.durationMin ?? 60,
        agenda: body.agenda ?? null,
        attendees,
        created_by: body.createdBy ?? null,
    };
    const { error: insErr } = await sb.from('meetings').insert(meeting);
    if (insErr) return Response.json({ ok: false, error: insErr.message }, { status: 500 });

    // ── In-app notifications ──
    const notifs = attendees.map(email => ({
        id: `nf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        recipient_email: email,
        kind: 'meeting',
        title: `📅 Réunion : ${title}`,
        body: `${new Date(startsAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}${body.location ? ` — ${body.location}` : ''}`,
        link: null,
    }));
    await sb.from('notifications').insert(notifs);

    // ── Email ──
    const when = new Date(startsAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    const whenAr = new Date(startsAt).toLocaleString('ar-MA', { dateStyle: 'full', timeStyle: 'short' });
    const agendaHtml = body.agenda ? `<p style="font-size:13px;line-height:1.55"><b>Ordre du jour :</b><br>${body.agenda.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : '';
    const bodyFr = `
        <p style="font-size:14px"><b>${title}</b></p>
        <p style="font-size:13px;line-height:1.6">
            📅 <b>${when}</b><br>
            ${body.location ? `📍 ${body.location}<br>` : ''}
            ⏱ Durée prévue : ${body.durationMin ?? 60} min
        </p>
        ${agendaHtml}
        <p style="font-size:12px;color:#64748b;margin-top:14px">Un rappel automatique vous sera envoyé le matin de la réunion.</p>
    `;
    const bodyAr = `
        <p style="font-size:14px;text-align:right"><b>${title}</b></p>
        <p style="font-size:13px;line-height:1.6;text-align:right">
            📅 <b>${whenAr}</b><br>
            ${body.location ? `📍 ${body.location}<br>` : ''}
            ⏱ المدة المتوقعة: ${body.durationMin ?? 60} دقيقة
        </p>
    `;
    const html = buildBilingualWrapper({
        titleFr: `📅 Convocation à une réunion`,
        titleAr: `📅 دعوة لاجتماع`,
        bodyFr, bodyAr, severity: 'info',
    });
    const send = await sendEmail({ to: attendees, subject: `📅 Réunion : ${title} — ${when}`, html });

    await logHistory(sb, {
        source: 'in-app',
        category: 'test',
        severity: 'info',
        subject: `Réunion : ${title}`,
        recipients: attendees,
        provider: send.provider,
        status: send.ok ? 'sent' : 'failed',
        errorMsg: send.error,
        entityTable: 'meetings',
        entityId: id,
    });

    return Response.json({ ok: true, id, emailOk: send.ok, provider: send.provider });
}

export async function DELETE(request: Request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });

    const sb = getSb();
    if (!sb) return Response.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });

    const { error } = await sb.from('meetings').delete().eq('id', id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
}
