// ============================================================
// Rate-limit sensitive API routes.
//
// If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, we
// use Upstash's REST-based Redis for distributed rate limiting
// (survives Vercel serverless cold starts and multi-region).
//
// Otherwise we fall back to an in-memory counter that resets on
// server restart — fine for the Windows-launcher edition where the
// single Node process holds all state.
//
// USAGE
//   const rl = await checkRateLimit(request, 'send-alert', 100, 3600_000);
//   if (!rl.ok) return rateLimitedResponse(rl);
// ============================================================

export interface RateLimitOutcome {
    ok: boolean;
    limit: number;
    remaining: number;
    resetAt: number;  // epoch ms
}

// ── In-memory fallback ─────────────────────────────────────
interface Bucket { count: number; resetAt: number; }
const memoryBuckets = new Map<string, Bucket>();

function memoryCheck(key: string, limit: number, windowMs: number): RateLimitOutcome {
    const now = Date.now();
    const b = memoryBuckets.get(key);
    if (!b || b.resetAt < now) {
        memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, limit, remaining: limit - 1, resetAt: now + windowMs };
    }
    b.count += 1;
    if (b.count > limit) {
        return { ok: false, limit, remaining: 0, resetAt: b.resetAt };
    }
    return { ok: true, limit, remaining: limit - b.count, resetAt: b.resetAt };
}

// ── Upstash REST-based Redis ───────────────────────────────
async function upstashCheck(
    url: string, token: string, key: string, limit: number, windowMs: number
): Promise<RateLimitOutcome | null> {
    const now = Date.now();
    const resetAt = Math.floor((now + windowMs) / 1000);
    // INCR + EXPIRE via Upstash pipeline REST endpoint
    try {
        const res = await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([
                ['INCR', key],
                ['EXPIRE', key, Math.ceil(windowMs / 1000), 'NX'],
                ['PTTL', key],
            ]),
        });
        if (!res.ok) return null;
        const [incrRes, , pttlRes] = await res.json() as Array<{ result: number | string }>;
        const count = Number(incrRes.result);
        const ttlMs = Math.max(0, Number(pttlRes.result));
        if (count > limit) {
            return { ok: false, limit, remaining: 0, resetAt: now + ttlMs };
        }
        return { ok: true, limit, remaining: limit - count, resetAt: now + ttlMs };
    } catch { return null; }
}

// ── Public API ─────────────────────────────────────────────
/**
 * Identify the caller. Prefer an authenticated user id (from a JWT),
 * then the Vercel forwarded IP, then a static bucket.
 */
function callerKey(request: Request, scope: string): string {
    const auth = request.headers.get('authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7, 27) : '';  // 20 chars = enough entropy
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
    return `rl:${scope}:${bearer || ip}`;
}

export async function checkRateLimit(
    request: Request,
    scope: string,
    limit: number,
    windowMs: number,
): Promise<RateLimitOutcome> {
    const key = callerKey(request, scope);
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (upstashUrl && upstashToken) {
        const r = await upstashCheck(upstashUrl, upstashToken, key, limit, windowMs);
        if (r) return r;
    }
    return memoryCheck(key, limit, windowMs);
}

export function rateLimitedResponse(r: RateLimitOutcome): Response {
    return new Response(
        JSON.stringify({ ok: false, error: 'Rate limit exceeded. Try again later.' }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': String(r.limit),
                'X-RateLimit-Remaining': String(r.remaining),
                'X-RateLimit-Reset': String(Math.floor(r.resetAt / 1000)),
                'Retry-After': String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))),
            },
        },
    );
}
