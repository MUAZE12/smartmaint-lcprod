// ============================================================
// Server-side Supabase client factory.
//
// Prefers SUPABASE_SERVICE_ROLE_KEY when present (Vercel prod) so
// server routes can bypass RLS. Falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY
// when the service key isn't available (Windows launcher release — we
// intentionally omit the service key from the shipped .env.local so the
// installer .zip can't leak god-mode credentials).
//
// This works because the RLS policies are PERMISSIVE
// (see supabase/enable-rls-permissive.sql) — anon can do everything
// service_role can on the tables the launcher touches.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let cachedKind: 'service_role' | 'anon' | null = null;

export function getSupabaseServerClient(): { client: SupabaseClient; kind: 'service_role' | 'anon' } | null {
    if (cached && cachedKind) return { client: cached, kind: cachedKind };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
        cached = createClient(url, serviceKey, { auth: { persistSession: false } });
        cachedKind = 'service_role';
        return { client: cached, kind: 'service_role' };
    }

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
        cached = createClient(url, anonKey, { auth: { persistSession: false } });
        cachedKind = 'anon';
        return { client: cached, kind: 'anon' };
    }

    return null;
}
