// ============================================================
// Lightweight error tracking that mimics Sentry's minimal surface.
//
// If NEXT_PUBLIC_SENTRY_DSN is set at build time, we lazy-load the
// real @sentry/browser and forward every captureException. Otherwise
// we log-with-context to the console + drop the report on a POST to
// a /api/errors sink (also stubbed — errors persist in Supabase's
// audit_log with kind='client_error' so nothing is truly lost).
//
// Keeps the runtime dep footprint at ZERO when no DSN is set — good
// for the offline Windows launcher edition.
// ============================================================

interface ErrorContext {
    tag?: string;
    userId?: string;
    role?: string;
    route?: string;
    extra?: Record<string, unknown>;
}

type SentryClient = {
    init: (opts: { dsn: string; environment?: string; release?: string; tracesSampleRate?: number }) => void;
    captureException: (err: unknown, ctx?: { extra?: Record<string, unknown>; tags?: Record<string, string> }) => void;
    setUser: (user: { id?: string; role?: string } | null) => void;
};

let sentry: SentryClient | null = null;
let initPromise: Promise<void> | null = null;

async function initIfConfigured(): Promise<void> {
    if (sentry !== null || initPromise) return initPromise ?? Promise.resolve();
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    initPromise = (async () => {
        try {
            // Dynamic import — @sentry/browser stays out of the bundle when unused.
            // @ts-expect-error - optional peer dep; may not be installed.
            const mod = await import(/* webpackIgnore: true */ '@sentry/browser').catch(() => null);
            if (!mod) return;
            const client = mod as unknown as SentryClient;
            client.init({
                dsn,
                environment: process.env.NODE_ENV,
                release: process.env.NEXT_PUBLIC_APP_VERSION,
                tracesSampleRate: 0.05,
            });
            sentry = client;
        } catch { /* silent — never crash the app because tracking is down */ }
    })();
    return initPromise;
}

/** Report an exception to Sentry (if configured) + the local sink. */
export async function captureException(err: unknown, ctx: ErrorContext = {}): Promise<void> {
    await initIfConfigured();
    if (sentry) {
        sentry.captureException(err, {
            extra: { ...(ctx.extra ?? {}), route: ctx.route, tag: ctx.tag },
            tags: {
                ...(ctx.role ? { role: ctx.role } : {}),
                ...(ctx.tag ? { area: ctx.tag } : {}),
            },
        });
    }
    // Local structured log — always emitted so devtools shows context
    // even in the offline edition where Sentry isn't installed.
    // eslint-disable-next-line no-console
    console.error('[smartmaint]', ctx.tag ?? 'error', err, ctx);

    // Best-effort local sink (POST /api/errors). Silent on failure.
    if (typeof window !== 'undefined') {
        try {
            void fetch('/api/errors', {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                    ...ctx,
                    ts: Date.now(),
                    ua: navigator.userAgent,
                    url: location.href,
                }),
            }).catch(() => {});
        } catch { /* ignore */ }
    }
}

/** Attach the current user to future exception reports. */
export function setUser(user: { id?: string; role?: string } | null): void {
    if (sentry) sentry.setUser(user);
}
