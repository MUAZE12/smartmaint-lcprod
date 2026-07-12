// One-shot test-message endpoint the admin hits from Alertes → « Tester ».
//
// Provider selection is delegated to sendWhatsApp() :
//   • If GREEN_API_INSTANCE_ID + GREEN_API_TOKEN are set on Vercel, Green API
//     is used (fully automatic, no per-recipient key needed).
//   • Else if a CallMeBot key is supplied, CallMeBot is used.
//   • Else Meta Cloud API if configured.
//   • Else clean error message.
// Never trigger from cron / webhooks — this is manual only.

import { NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/alerts';

export const runtime = 'nodejs';

// CORS is critical here — the Windows launcher runs a local Next.js server
// on http://localhost:xxxx but this endpoint lives on smartmaint-lcprod.vercel.app.
// Without these headers the browser blocks the cross-origin POST with the
// generic "Failed to fetch" error the admin saw. `*` is fine because the
// endpoint has no cookies / session — auth is via Vercel env secrets only.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
    let body: { to?: string; apikey?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }
    if (!body.to) {
        return NextResponse.json({ ok: false, error: 'Champ « to » (téléphone au format international) requis.' }, { status: 400, headers: CORS_HEADERS });
    }
    const res = await sendWhatsApp({
        to: body.to,
        callmebotApiKey: body.apikey ?? null,
        body: '✅ Test — SmartMaint L.C PROD\n\nSi vous lisez ce message, votre canal WhatsApp est prêt. Les alertes automatiques (pannes, stock critique, HACCP en retard) arriveront ici.',
    });
    return NextResponse.json(res, { headers: CORS_HEADERS });
}
