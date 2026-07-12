// Report which WhatsApp provider(s) are wired up so the admin UI can show
// the correct green / amber status without exposing any secret token.
//
// Providers, in priority order (matches sendWhatsApp in lib/alerts):
//   1. Green API   — GREEN_API_INSTANCE_ID + GREEN_API_TOKEN
//   2. CallMeBot   — per-recipient key on the subscription row (not env)
//   3. Meta Cloud  — WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
    const greenReady = !!process.env.GREEN_API_INSTANCE_ID && !!process.env.GREEN_API_TOKEN;
    const proxyReady = !!process.env.GREEN_API_PROXY_URL && !!process.env.GREEN_API_PROXY_SECRET;
    const metaReady = !!process.env.WHATSAPP_PHONE_NUMBER_ID && !!process.env.WHATSAPP_ACCESS_TOKEN;
    return NextResponse.json({
        // "configured" = at least ONE server-side path is active
        configured: greenReady || metaReady,
        provider: greenReady ? 'green' : metaReady ? 'meta' : 'none',
        // route = actual outbound path Green API will use
        route: greenReady && proxyReady ? 'proxy' : greenReady ? 'direct' : 'none',
        greenReady,
        proxyReady,
        metaReady,
        // legacy fields kept for older clients still on the field
        phoneNumberIdSet: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessTokenSet: !!process.env.WHATSAPP_ACCESS_TOKEN,
    });
}
