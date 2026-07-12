// SmartMaint — L.C PROD · Green API proxy on Cloudflare Workers
//
// WHY THIS EXISTS
// ---------------
// Green API's nginx WAF (api.green-api.com and every regional variant we
// tested) returns HTTP 403 to Vercel serverless egress. Cloudflare Workers
// egress from CF-owned IP ranges that Green API accepts, so this Worker
// sits between Vercel and Green API and forwards the send-message request.
//
// SECURITY
// --------
// The Worker enforces a shared secret in the "x-proxy-secret" header. The
// value must match PROXY_SHARED_SECRET (a Worker secret you set via the
// Cloudflare dashboard). Without this, anyone who guesses the Worker URL
// could burn through your Green API quota.
//
// USAGE FROM VERCEL
// -----------------
//   fetch(`${GREEN_API_PROXY_URL}/waInstance<id>/sendMessage/<token>`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'x-proxy-secret': process.env.GREEN_API_PROXY_SECRET,
//     },
//     body: JSON.stringify({ chatId: '212xxx@c.us', message: '...' }),
//   })
//
// DEPLOY
// ------
// See DEPLOY.md next to this file.

export default {
    /**
     * @param {Request} request
     * @param {{ PROXY_SHARED_SECRET: string }} env
     */
    async fetch(request, env) {
        // Only POST is meaningful for send-message; block everything else.
        if (request.method !== 'POST') {
            return json({ error: 'Only POST is allowed' }, 405);
        }

        // Shared-secret gate. Rejects anonymous callers before we touch
        // Green API — protects your monthly quota from random scans.
        const submitted = request.headers.get('x-proxy-secret') || '';
        if (!env.PROXY_SHARED_SECRET || submitted !== env.PROXY_SHARED_SECRET) {
            return json({ error: 'Forbidden' }, 403);
        }

        // The Worker's path (everything after the origin) is forwarded to
        // Green API verbatim. Example: /waInstance710701676664/sendMessage/<tok>
        const inUrl = new URL(request.url);
        const forwardPath = inUrl.pathname + inUrl.search;
        const upstream = `https://api.green-api.com${forwardPath}`;

        // Read the body once and re-send. We keep Content-Type but strip
        // headers that don't apply (like x-proxy-secret and cf-*).
        const body = await request.text();
        const upstreamRes = await fetch(upstream, {
            method: 'POST',
            headers: {
                'Content-Type': request.headers.get('content-type') || 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; SmartMaint-CFProxy/1.0)',
                Accept: 'application/json',
            },
            body,
        });

        // Mirror the upstream response 1:1 so the SmartMaint code sees
        // the same shape it would from a direct call.
        const respBody = await upstreamRes.text();
        return new Response(respBody, {
            status: upstreamRes.status,
            headers: {
                'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    },
};

function json(payload, status) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
