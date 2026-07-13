// ============================================================
// POST /api/sensors  — ingest one or many sensor readings
// GET  /api/sensors  — latest known values (public read for /synoptique)
//
// AUTH:  Bearer SMARTMAINT_API_KEY on POST (protects Resend budgets and
//        prevents spam-writes). GET is open — the anon Supabase key
//        already lets a browser query sensor_latest directly.
//
// SHAPE (POST body):
//   Single:   { machineId, metric, value, unit?, ts?, source? }
//   Batch:    { readings: Reading[] }  — max 500 per request
//
// The route auto-computes 15-minute rollups (best-effort; the cron
// hardens them nightly).
// ============================================================

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit';
import { isApiCallAuthorized, unauthorizedResponse } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Reading {
    machineId: string;
    metric: string;
    value: number;
    unit?: string;
    ts?: string;
    source?: string;
}

const KNOWN_METRICS = new Set(['vibration', 'temperature', 'current', 'pressure', 'rpm', 'kwh', 'flow']);

function validateReading(r: Reading, i: number): string | null {
    if (!r.machineId || typeof r.machineId !== 'string') return `readings[${i}].machineId required`;
    if (!r.metric || !KNOWN_METRICS.has(r.metric)) return `readings[${i}].metric must be one of ${[...KNOWN_METRICS].join(',')}`;
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return `readings[${i}].value must be a finite number`;
    return null;
}

export async function POST(request: Request) {
    if (!isApiCallAuthorized(request)) return unauthorizedResponse();

    // 10 000 writes/hour/caller — plenty for a plant with 20 sensors
    // sampling every 30 s but shuts down a runaway loop fast.
    const rl = await checkRateLimit(request, 'sensors-ingest', 10_000, 3600_000);
    if (!rl.ok) return rateLimitedResponse(rl);

    let body: { readings?: Reading[] } & Partial<Reading>;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    const readings: Reading[] = Array.isArray(body.readings)
        ? body.readings
        : (body.machineId ? [{ machineId: body.machineId!, metric: body.metric!, value: body.value!, unit: body.unit, ts: body.ts, source: body.source }] : []);

    if (readings.length === 0) {
        return Response.json({ ok: false, error: 'No readings provided' }, { status: 400 });
    }
    if (readings.length > 500) {
        return Response.json({ ok: false, error: 'Max 500 readings per request' }, { status: 400 });
    }

    for (let i = 0; i < readings.length; i++) {
        const err = validateReading(readings[i], i);
        if (err) return Response.json({ ok: false, error: err }, { status: 400 });
    }

    const ctx = getSupabaseServerClient();
    if (!ctx?.client) return Response.json({ ok: false, error: 'Supabase unavailable' }, { status: 500 });
    const sb = ctx.client;

    const rows = readings.map(r => ({
        machine_id: r.machineId,
        metric: r.metric,
        value: r.value,
        unit: r.unit ?? null,
        ts: r.ts ?? new Date().toISOString(),
        source: r.source ?? 'api',
    }));

    const { error } = await sb.from('sensor_readings').insert(rows);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    return Response.json({ ok: true, count: rows.length, rateLimit: { remaining: rl.remaining } });
}

export async function GET() {
    const ctx = getSupabaseServerClient();
    if (!ctx?.client) return Response.json({ ok: false, latest: [] }, { status: 500 });
    const { data, error } = await ctx.client.from('sensor_latest').select('*').limit(500);
    if (error) return Response.json({ ok: false, error: error.message, latest: [] }, { status: 500 });
    return Response.json({ ok: true, latest: data ?? [] });
}
