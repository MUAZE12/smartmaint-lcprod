// ============================================================
// GET /api/alert-ack/[token] — one-click acknowledge from an email.
// Updates the matching alert_history row with ack_at + ack_by, then
// redirects the user to the friendly /alert-ack-thanks page.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
    const { token } = await ctx.params;
    if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });

    const sbCtx = getSupabaseServerClient();
    if (!sbCtx) {
        return NextResponse.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 });
    }
    const sb = sbCtx.client;

    // Find the row by ack_token (unique).
    const { data: row } = await sb
        .from('alert_history')
        .select('id, subject, ack_at, recipients')
        .eq('ack_token', token)
        .maybeSingle();

    if (!row) {
        // Token not found → maybe expired or invalid.
        return NextResponse.redirect(new URL('/alert-ack-thanks?status=invalid', _req.url), 302);
    }
    if (row.ack_at) {
        // Already acknowledged earlier.
        return NextResponse.redirect(new URL(`/alert-ack-thanks?status=already&subject=${encodeURIComponent(row.subject)}`, _req.url), 302);
    }

    // Stamp ack — by = first recipient (best-effort, since the email link
    // can't identify exactly which recipient clicked it).
    const ackBy = Array.isArray(row.recipients) && row.recipients.length > 0
        ? row.recipients[0] : 'unknown';
    await sb.from('alert_history').update({
        ack_at: new Date().toISOString(),
        ack_by: ackBy,
    }).eq('id', row.id);

    return NextResponse.redirect(new URL(`/alert-ack-thanks?status=ok&subject=${encodeURIComponent(row.subject)}`, _req.url), 302);
}
