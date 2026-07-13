// GET /api/health — liveness + Supabase + outbound-mail probe.
//
// Contract:
//   200 OK   → all subsystems reachable
//   503      → at least one subsystem is degraded
//   { ok, uptime, version, checks: { supabase, mail, cronSecret } }

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Check { ok: boolean; latencyMs?: number; note?: string; }
type CheckMap = Record<string, Check>;

async function checkSupabase(): Promise<Check> {
    const t0 = Date.now();
    try {
        const ctx = getSupabaseServerClient();
        if (!ctx?.client) return { ok: false, note: 'client unavailable' };
        // Cheap query — count rows on a tiny reference table.
        const { error } = await ctx.client.from('machines').select('id', { head: true, count: 'estimated' });
        if (error) return { ok: false, latencyMs: Date.now() - t0, note: error.message };
        return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
        return { ok: false, latencyMs: Date.now() - t0, note: e instanceof Error ? e.message : String(e) };
    }
}

function checkMail(): Check {
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    if (hasResend || hasGmail) return { ok: true, note: hasResend ? 'resend' : 'gmail-smtp' };
    return { ok: false, note: 'no mail provider configured' };
}

function checkSecrets(): Check {
    const missing: string[] = [];
    if (!process.env.SMARTMAINT_API_KEY) missing.push('SMARTMAINT_API_KEY');
    if (!process.env.CRON_SECRET) missing.push('CRON_SECRET');
    if (missing.length) return { ok: false, note: `missing: ${missing.join(', ')}` };
    return { ok: true };
}

async function readLocalVersion(): Promise<string> {
    try {
        return (await readFile(path.join(process.cwd(), 'version.txt'), 'utf8')).trim();
    } catch { return 'unknown'; }
}

export async function GET() {
    const [supabase, version] = await Promise.all([checkSupabase(), readLocalVersion()]);
    const mail = checkMail();
    const cronSecret = checkSecrets();
    const checks: CheckMap = { supabase, mail, cronSecret };
    const ok = Object.values(checks).every(c => c.ok);
    return Response.json(
        {
            ok,
            uptime: Math.round(process.uptime()),
            version,
            node: process.version,
            checks,
        },
        { status: ok ? 200 : 503 },
    );
}
