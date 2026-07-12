// ============================================================
// Server-side alert utilities — shared between
//   /api/instant-alert      (Supabase webhooks)
//   /api/cron/daily-alerts  (Vercel cron, every day)
//   /api/cron/weekly-report (Vercel cron, every Monday)
//
// Provides:
//   • settings loader (one round-trip to app_settings)
//   • cooldown check + persist (so a flapping panne doesn't spam)
//   • quiet-hours check (admin sleeps; only critical fires through)
//   • Arabic / French template hint (operator gets AR, admin gets FR)
//   • history logger (one row per attempt, success or fail)
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export interface AlertSettings {
    enabled: boolean;
    breakdowns: boolean;
    stock: boolean;
    haccp: boolean;
    autoreorder: boolean;
    recipients: string[];
    quietStartHour: number;   // 0..23
    quietEndHour: number;     // 0..23
    cooldownMinutes: number;  // minimum minutes between same-key alerts
    scheduleHour: number;     // informative; real cron lives in vercel.json
    // ── Phase 2 ──
    routeCritical: string[];  // channels for critical alerts e.g. ['email','whatsapp']
    routeWarning: string[];
    routeInfo: string[];
    escalationMinutes: number;
    whatsappEnabled: boolean;
}

export interface AlertSubscription {
    id: string;
    email: string;
    category: string;
    channels: string[];
    hours_start: number;
    hours_end: number;
    active: boolean;
    phone: string | null;
}

/** Read all alert-related settings in one shot. */
export async function loadAlertSettings(sb: SupabaseClient): Promise<AlertSettings> {
    const { data: rows } = await sb.from('app_settings').select('key, value');
    const cfg: Record<string, string> = {};
    (rows ?? []).forEach((r: { key: string; value: string }) => { cfg[r.key] = r.value; });

    const recipients = (cfg['alert_email'] ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);

    return {
        enabled: cfg['alert_enabled'] !== 'off',
        breakdowns: cfg['alert_breakdowns'] !== 'off',
        stock: cfg['alert_stock'] !== 'off',
        haccp: cfg['alert_haccp'] !== 'off',
        autoreorder: cfg['alert_autoreorder'] === 'on' || cfg['autoreorder_enabled'] === 'on',
        recipients,
        quietStartHour: clampHour(cfg['alert_quiet_start'], 22),
        quietEndHour: clampHour(cfg['alert_quiet_end'], 6),
        cooldownMinutes: Math.max(0, parseInt(cfg['alert_cooldown_min'] ?? '60', 10) || 60),
        scheduleHour: clampHour(cfg['alert_schedule_hour'], 7),
        // Phase 2
        routeCritical: parseChannels(cfg['alert_route_critical'], ['email']),
        routeWarning: parseChannels(cfg['alert_route_warning'], ['email']),
        routeInfo: parseChannels(cfg['alert_route_info'], ['email']),
        escalationMinutes: Math.max(5, parseInt(cfg['alert_escalation_min'] ?? '15', 10) || 15),
        whatsappEnabled: cfg['alert_whatsapp_enabled'] === 'on',
    };
}

function parseChannels(raw: string | undefined, fallback: string[]): string[] {
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* ignore */ }
    return fallback;
}

function clampHour(raw: string | undefined, fallback: number): number {
    const n = parseInt(raw ?? '', 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(23, Math.max(0, n));
}

/** Is the current moment inside the configured quiet window?
 *  Quiet hours wrap across midnight (22 → 6 means 22..23 + 0..5). */
export function isQuietHour(settings: AlertSettings, now: Date = new Date()): boolean {
    const h = now.getUTCHours();
    const s = settings.quietStartHour;
    const e = settings.quietEndHour;
    if (s === e) return false; // disabled
    if (s < e) return h >= s && h < e;
    // wraps midnight
    return h >= s || h < e;
}

/** Check if this alert was fired recently — returns true to suppress. */
export async function isOnCooldown(sb: SupabaseClient, key: string, cooldownMinutes: number): Promise<boolean> {
    if (cooldownMinutes <= 0) return false;
    const { data } = await sb
        .from('alert_cooldown')
        .select('last_fired_at')
        .eq('cooldown_key', key)
        .maybeSingle();
    if (!data?.last_fired_at) return false;
    const ageMs = Date.now() - new Date(data.last_fired_at as string).getTime();
    return ageMs < cooldownMinutes * 60_000;
}

/** Stamp the cooldown row so subsequent fires within the window are suppressed. */
export async function stampCooldown(sb: SupabaseClient, key: string): Promise<void> {
    await sb.from('alert_cooldown').upsert(
        { cooldown_key: key, last_fired_at: new Date().toISOString() },
        { onConflict: 'cooldown_key' },
    );
}

/** Log every alert attempt for audit + the /alert-history page. */
export async function logHistory(sb: SupabaseClient, entry: {
    source: 'instant' | 'cron-daily' | 'cron-weekly' | 'manual-test' | 'in-app';
    category: 'panne' | 'stock' | 'haccp' | 'digest' | 'weekly' | 'test';
    severity?: 'info' | 'warning' | 'critical';
    subject: string;
    recipients: string[];
    provider?: string;
    status: 'sent' | 'failed' | 'skipped';
    errorMsg?: string;
    entityTable?: string;
    entityId?: string;
    ackToken?: string;
}): Promise<void> {
    const id = `ah-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await sb.from('alert_history').insert({
        id,
        source: entry.source,
        category: entry.category,
        severity: entry.severity ?? 'info',
        subject: entry.subject,
        recipients: entry.recipients,
        provider: entry.provider ?? null,
        status: entry.status,
        error_msg: entry.errorMsg ?? null,
        entity_table: entry.entityTable ?? null,
        entity_id: entry.entityId ?? null,
        ack_token: entry.ackToken ?? null,
    });
}

/** Channels enabled for a given severity. */
export function channelsForSeverity(settings: AlertSettings, severity: 'info' | 'warning' | 'critical'): string[] {
    if (severity === 'critical') return settings.routeCritical;
    if (severity === 'warning')  return settings.routeWarning;
    return settings.routeInfo;
}

/** Generate a fresh ack token (URL-safe). */
export function generateAckToken(): string {
    return crypto.randomBytes(24).toString('base64url');
}

/** Read all active subscriptions matching this category. Falls back to global
 *  recipients if no subscription rows exist (back-compat). */
export async function recipientsForCategory(
    sb: SupabaseClient,
    settings: AlertSettings,
    category: string,
): Promise<{ email: string; channels: string[]; phone: string | null }[]> {
    const { data } = await sb
        .from('alert_subscriptions')
        .select('email, category, channels, hours_start, hours_end, active, phone')
        .eq('active', true);

    const subs = (data ?? []) as AlertSubscription[];
    const subsFor = subs.filter(s => s.category === category || s.category === 'all');

    // Honor per-recipient quiet hours (UTC)
    const hourNow = new Date().getUTCHours();
    const matching = subsFor.filter(s => {
        const start = s.hours_start ?? 0;
        const end = s.hours_end ?? 24;
        if (start <= end) return hourNow >= start && hourNow < end;
        return hourNow >= start || hourNow < end;
    });

    if (matching.length > 0) {
        return matching.map(s => ({
            email: s.email,
            channels: Array.isArray(s.channels) ? s.channels : ['email'],
            phone: s.phone,
        }));
    }

    // Back-compat — no subscription rows means everyone in settings.recipients
    // gets everything by email.
    return settings.recipients.map(email => ({ email, channels: ['email'], phone: null }));
}

/** Pick the email language based on intended audience.
 *  Operator-targeted alerts (panne signaled BY the operator) go in AR;
 *  everything else (audit + admin + tech) stays in FR.
 *  For the daily / weekly cron we send a bilingual block. */
export function buildBilingualWrapper(opts: {
    titleFr: string;
    titleAr: string;
    bodyFr: string;
    bodyAr: string;
    /** Optional ack URL — adds a "Pris en charge" button at the bottom. */
    ackUrl?: string;
    severity?: 'info' | 'warning' | 'critical';
}): string {
    const sev = opts.severity ?? 'info';
    const sevColor = sev === 'critical' ? '#dc2626'
        : sev === 'warning' ? '#d97706'
        : '#3b82f6';
    const sevBg = sev === 'critical' ? '#fef2f2'
        : sev === 'warning' ? '#fffbeb'
        : '#eff6ff';
    const sevIcon = sev === 'critical' ? '🚨'
        : sev === 'warning' ? '⚠️'
        : 'ℹ️';
    const sevLabelFr = sev === 'critical' ? 'CRITIQUE'
        : sev === 'warning' ? 'AVERTISSEMENT'
        : 'INFORMATION';
    const sevLabelAr = sev === 'critical' ? 'حرج'
        : sev === 'warning' ? 'تحذير'
        : 'معلومة';
    const severityBadge = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${sevBg};border-left:4px solid ${sevColor};border-radius:6px;margin-bottom:18px">
            <span style="font-size:20px">${sevIcon}</span>
            <div style="flex:1">
                <div style="font-size:11px;font-weight:800;color:${sevColor};letter-spacing:0.08em">${sevLabelFr} · ${sevLabelAr}</div>
                <div style="font-size:11px;color:#64748b">SmartMaint — L.C PROD</div>
            </div>
        </div>
    `;
    const ackButton = opts.ackUrl ? `
        <div style="text-align:center;margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0">
            <a href="${opts.ackUrl}"
               style="display:inline-block;padding:12px 28px;border-radius:10px;background:${sevColor};color:white;font-weight:700;font-size:14px;text-decoration:none;font-family:inherit;box-shadow:0 4px 14px ${sevColor}55">
                ✓ Pris en charge / تم الاستلام
            </a>
            <div style="font-size:11px;color:#94a3b8;margin-top:8px">Un seul clic confirme votre prise en charge. Lien à usage unique.</div>
        </div>
    ` : '';
    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e293b">
            ${severityBadge}
            <div lang="fr" dir="ltr" style="border-bottom:1px solid #e2e8f0;padding-bottom:18px;margin-bottom:18px">
                <h2 style="margin:0 0 10px;font-size:18px;color:${sevColor}">${opts.titleFr}</h2>
                ${opts.bodyFr}
            </div>
            <div lang="ar" dir="rtl" style="text-align:right">
                <h2 style="margin:0 0 10px;font-size:18px;color:${sevColor}">${opts.titleAr}</h2>
                ${opts.bodyAr}
            </div>
            ${ackButton}
        </div>
    `;
}

// ─── WhatsApp helper — CallMeBot (free) OR Meta Cloud API (fallback) ──
//
// Why two paths ?
//   • CallMeBot is the "just works" option : chaque destinataire envoie
//     un WhatsApp d'opt-in au bot, reçoit une apikey unique (7 chiffres)
//     et la colle dans son abonnement dans SmartMaint. Aucune config
//     serveur, aucune vérification d'entreprise Meta, aucun token qui
//     expire toutes les 24 h.
//   • Meta Cloud API reste la voie « pro » : plus fiable et sans opt-in
//     manuel côté destinataire, mais nécessite compte développeur Meta,
//     numéro business vérifié, template pré-approuvé, etc. On garde le
//     support pour ceux qui veulent aller au bout.
//
// Le champ `apikey` (subscription.channels_meta.callmebot_apikey) est
// lu par sendWhatsApp() et détermine le chemin utilisé.

export async function sendWhatsApp(opts: {
    to: string;
    body: string;
    /** Clé CallMeBot fournie par le destinataire après opt-in.
     *  Si présente, on utilise CallMeBot ; sinon on tente Meta. */
    callmebotApiKey?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string; provider?: 'callmebot' | 'meta' | 'green' }> {
    const phone = (opts.to || '').replace(/\D/g, '');
    if (!phone) return { ok: false, error: 'Numéro de téléphone manquant' };

    // ── Path 0 — Green API (env-var configured, most reliable free option) ──
    // Set GREEN_API_INSTANCE_ID + GREEN_API_TOKEN on Vercel to activate.
    // Recipient scans QR once from green-api.com dashboard, then every send
    // is fully automatic — no per-recipient key like CallMeBot.
    //
    // When the env vars ARE present, we return the actual Green API error
    // instead of silently falling through — otherwise the admin sees the
    // "WhatsApp non configuré" message and can't tell that Green API in
    // fact rejected the send.
    const greenInstance = process.env.GREEN_API_INSTANCE_ID;
    const greenToken = process.env.GREEN_API_TOKEN;
    if (greenInstance && greenToken) {
        try {
            // Send path resolution (priority order):
            //   1. Cloudflare Worker proxy (GREEN_API_PROXY_URL + SECRET) — used
            //      because Green API's WAF returns 403 for Vercel's egress IPs.
            //      The CF Worker sits in the middle, requires a shared secret,
            //      and forwards the exact request to api.green-api.com.
            //   2. Direct call to Green API (works when NOT on Vercel).
            //
            // Defensive strip: some CLIs (Vercel via PowerShell pipe) inject a
            // U+FEFF BOM into env var values, which then poisons any HTTP header
            // we build with them (undici throws "ByteString ... value 65279").
            // We strip all whitespace + BOM as a belt-and-braces guard.
            const clean = (v: string | undefined | null) =>
                (v ?? '').replace(/^﻿/, '').trim();
            const proxyUrl = clean(process.env.GREEN_API_PROXY_URL);
            const proxySecret = clean(process.env.GREEN_API_PROXY_SECRET);
            const useProxy = !!(proxyUrl && proxySecret);
            const path = `/waInstance${clean(greenInstance)}/sendMessage/${clean(greenToken)}`;
            const url = useProxy
                ? `${proxyUrl.replace(/\/$/, '')}${path}`
                : `https://api.green-api.com${path}`;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; SmartMaint/1.0)',
                Accept: 'application/json',
            };
            if (useProxy) headers['x-proxy-secret'] = proxySecret;
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ chatId: `${phone}@c.us`, message: opts.body }),
            });
            const raw = await res.text();
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw); } catch { /* keep raw text */ }
            if (res.ok && (data as { idMessage?: string }).idMessage) {
                return { ok: true, provider: 'green', id: (data as { idMessage: string }).idMessage };
            }
            // Surface the actual Green API response — trimmed so it fits in a toast.
            const detail = raw ? raw.replace(/<[^>]+>/g, '').trim().slice(0, 240) : `HTTP ${res.status}`;
            return { ok: false, provider: 'green', error: `Green API (HTTP ${res.status}) : ${detail}` };
        } catch (e) {
            return { ok: false, provider: 'green', error: 'Green API réseau : ' + (e instanceof Error ? e.message : String(e)) };
        }
    }

    // ── Path A — CallMeBot ────────────────────────────────────
    if (opts.callmebotApiKey) {
        try {
            const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(opts.body)}&apikey=${encodeURIComponent(opts.callmebotApiKey)}`;
            const res = await fetch(url, { method: 'GET' });
            const text = await res.text();
            // CallMeBot renvoie du HTML ; "Message queued" ou "Message sent"
            // dans le corps signifie succès. Sinon on remonte le message.
            const okMarkers = ['Message queued', 'Message sent', 'MessageQueued'];
            const success = res.ok && okMarkers.some(m => text.includes(m));
            if (success) return { ok: true, provider: 'callmebot' };
            return { ok: false, provider: 'callmebot', error: 'CallMeBot: ' + text.replace(/<[^>]+>/g, '').trim().slice(0, 200) };
        } catch (e) {
            return { ok: false, provider: 'callmebot', error: e instanceof Error ? e.message : 'CallMeBot réseau' };
        }
    }

    // ── Path B — Meta Cloud API (fallback avancé) ─────────────
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneId || !token) {
        return { ok: false, error: 'WhatsApp non configuré — collez une clé CallMeBot dans l\'abonnement, ou renseignez WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN sur Vercel pour utiliser Meta Cloud API.' };
    }
    try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp', to: phone,
                type: 'text', text: { body: opts.body },
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, provider: 'meta', error: data?.error?.message ?? 'Meta WhatsApp échec' };
        return { ok: true, provider: 'meta', id: data?.messages?.[0]?.id };
    } catch (e) {
        return { ok: false, provider: 'meta', error: e instanceof Error ? e.message : 'Meta WhatsApp réseau' };
    }
}
