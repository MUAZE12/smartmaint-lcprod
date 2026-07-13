// ============================================================
// mediaStorage.ts — attachments → Supabase Storage
//
// The current model stores photos as base64 dataURLs inside JSONB
// columns on interventions / production_batches. That bloats every
// row, doubles Realtime bandwidth, and hits Supabase's row-size cap
// once you have 5+ photos.
//
// This helper migrates any dataURL to a Storage object and returns
// the public URL. Callers stay untouched — they still get a URL to
// stick in JSONB, but now it's a small string instead of a 400 KB blob.
//
// USAGE (client, in a Server Component or client action):
//   const url = await uploadIntervenPhoto(dataURL, { interventionId, phase: 'before' });
//   await interventionsDb.update(id, { attachments: [...existing, { type:'photo', dataUrl: url, ... }] });
// ============================================================

import { supabase } from '@/lib/supabase';

const BUCKETS = {
    intervention: 'intervention-media',
    quality:      'quality-photos',
    batch:        'batch-photos',
    kb:           'kb-media',
} as const;

export type MediaBucket = keyof typeof BUCKETS;

interface UploadOpts {
    bucket: MediaBucket;
    /** Namespace prefix inside the bucket. Optional but recommended. */
    prefix?: string;
    /** Deterministic file name (skips the random slug). */
    fileName?: string;
    /** Content-Type override; default guessed from the dataURL. */
    contentType?: string;
    /** Public bucket? (default true — sets public URL). */
    isPublic?: boolean;
}

interface UploadResult {
    ok: boolean;
    url?: string;
    path?: string;
    error?: string;
    bytes?: number;
}

// ── Utilities ─────────────────────────────────────────────

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/;

/** True if `s` looks like a base64 dataURL (needs migration). */
export function isDataUrl(s: string | null | undefined): boolean {
    return !!s && DATA_URL_RE.test(s);
}

function parseDataUrl(dataUrl: string): { blob: Blob; contentType: string } | null {
    const m = DATA_URL_RE.exec(dataUrl);
    if (!m) return null;
    const [, contentType, b64] = m;
    try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { blob: new Blob([bytes.buffer], { type: contentType }), contentType };
    } catch { return null; }
}

function slug(): string {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function extFor(ct: string): string {
    if (ct.includes('png'))  return 'png';
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('webm')) return 'webm';
    if (ct.includes('mp4'))  return 'mp4';
    return 'bin';
}

// ── Public API ────────────────────────────────────────────

/**
 * Upload a dataURL to Supabase Storage and return its public URL.
 * If the input already looks like a URL (http[s]://), returns it as-is
 * — so callers can pipe through without checking first.
 */
export async function uploadDataUrl(dataUrl: string, opts: UploadOpts): Promise<UploadResult> {
    if (!dataUrl) return { ok: false, error: 'empty input' };
    if (/^https?:\/\//.test(dataUrl)) return { ok: true, url: dataUrl };

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return { ok: false, error: 'not a base64 dataURL' };

    const bucket = BUCKETS[opts.bucket];
    const prefix = opts.prefix ? opts.prefix.replace(/^\/|\/$/g, '') + '/' : '';
    const name = opts.fileName ?? slug() + '.' + extFor(parsed.contentType);
    const path = prefix + name;

    const { error } = await supabase.storage.from(bucket).upload(path, parsed.blob, {
        contentType: opts.contentType ?? parsed.contentType,
        cacheControl: '31536000',    // immutable — content is content-addressed by name
        upsert: false,
    });
    if (error) return { ok: false, error: error.message };

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, path, bytes: parsed.blob.size };
}

/**
 * Convenience wrapper for intervention photos.
 * Path convention: {interventionId}/{phase}-{slug}.{ext}
 */
export async function uploadIntervenPhoto(
    dataUrl: string,
    ctx: { interventionId: string; phase?: 'before' | 'after' },
): Promise<UploadResult> {
    return uploadDataUrl(dataUrl, {
        bucket: 'intervention',
        prefix: ctx.interventionId,
        fileName: (ctx.phase ?? 'after') + '-' + slug() + '.jpg',
    });
}

/** Convenience wrapper for operator quality-defect photos. */
export async function uploadQualityPhoto(
    dataUrl: string,
    ctx: { batchId: string; category?: string },
): Promise<UploadResult> {
    return uploadDataUrl(dataUrl, {
        bucket: 'quality',
        prefix: ctx.batchId,
        fileName: (ctx.category ?? 'defect') + '-' + slug() + '.jpg',
    });
}

/**
 * Migrate an existing JSONB attachment. Preserves shape — if the input
 * is already a URL, returns it unchanged; if it's a dataURL, uploads
 * and returns the URL.
 */
export async function migrateAttachment<T extends { dataUrl: string }>(
    att: T,
    opts: UploadOpts,
): Promise<T> {
    if (!isDataUrl(att.dataUrl)) return att;
    const r = await uploadDataUrl(att.dataUrl, opts);
    if (!r.ok || !r.url) return att;  // fail-safe: keep the base64 rather than lose the photo
    return { ...att, dataUrl: r.url };
}
