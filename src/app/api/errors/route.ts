// POST /api/errors — client-side error sink.
//
// Every uncaught exception on the client fires this endpoint (see
// src/lib/errorTracking.ts). We persist to audit_log with kind='client_error'
// so nothing is lost, then optionally forward to Sentry server-side.

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClientErrorBody {
    message?: string;
    stack?: string;
    tag?: string;
    userId?: string;
    role?: string;
    route?: string;
    extra?: Record<string, unknown>;
    ts?: number;
    ua?: string;
    url?: string;
}

export async function POST(request: Request) {
    // 100 client errors per hour per IP is enough for real issues,
    // shuts down runaway error loops that would flood the DB.
    const rl = await checkRateLimit(request, 'client-errors', 100, 3600_000);
    if (!rl.ok) return rateLimitedResponse(rl);

    let body: ClientErrorBody;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    try {
        const ctx = getSupabaseServerClient();
        if (ctx?.client) {
            await ctx.client.from('audit_log').insert({
                id: `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                author: body.userId ?? body.role ?? 'anonymous',
                entity: 'client_error',
                entity_id: body.tag ?? 'unknown',
                action: 'client_error',
                metadata: {
                    message: body.message,
                    stack: body.stack?.slice(0, 4000),  // cap for DB row size
                    route: body.route,
                    url: body.url,
                    ua: body.ua,
                    ip,
                    extra: body.extra,
                    reportedAt: body.ts,
                },
                created_at: new Date().toISOString(),
            });
        }
    } catch { /* swallow — sink is best-effort */ }

    return Response.json({ ok: true });
}
