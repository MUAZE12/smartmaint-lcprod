// ============================================================
// Shared API auth helper — protects write-endpoints from being
// hit by anyone with a browser. The check is TRANSPARENT:
//   • If SMARTMAINT_API_KEY env is not set → allow (dev + backward
//     compat with local Windows launcher installs that don't set it).
//   • If set → require either an Authorization: Bearer <key> header
//     OR an x-smartmaint-key header.
//
// This lets us tighten in prod (Vercel) by setting the env var,
// without breaking any local install that predates the check.
// ============================================================

export function isApiCallAuthorized(request: Request): boolean {
    const expected = process.env.SMARTMAINT_API_KEY;
    if (!expected) return true; // no key configured → allow

    const auth = request.headers.get('authorization') ?? '';
    const explicit = request.headers.get('x-smartmaint-key') ?? '';
    if (auth === `Bearer ${expected}`) return true;
    if (explicit === expected) return true;
    return false;
}

export function unauthorizedResponse() {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}
