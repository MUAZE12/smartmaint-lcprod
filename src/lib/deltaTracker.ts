// ============================================================
// deltaTracker.ts — "what's new since I last opened this?"
//
// A per-user, per-list marker stored in localStorage. Any list-view
// page calls `markVisit(key)` on mount; anywhere else calls
// `newSince(key, items, getCreatedAt)` to count new rows.
//
// Turns every list into a "check obsessively" surface without touching
// the backend.
// ============================================================

const NS = 'smartmaint-delta-';
const MEMORY = new Map<string, number>();

function safeGet(key: string): number {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(NS + key) : null;
        if (!raw) return MEMORY.get(key) ?? 0;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    } catch { return MEMORY.get(key) ?? 0; }
}

function safeSet(key: string, ts: number): void {
    MEMORY.set(key, ts);
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(NS + key, String(ts));
        }
    } catch { /* localStorage full or blocked — memory fallback keeps working */ }
}

/** Record that the user just visited a list. Call from `useEffect(..., [])`. */
export function markVisit(key: string, at: number = Date.now()): void {
    safeSet(key, at);
}

/** Timestamp of the previous visit — 0 if never visited. */
export function lastVisit(key: string): number {
    return safeGet(key);
}

/**
 * Count items created after the last visit.
 * `getCreatedAt(item)` should return an ISO string or epoch ms.
 */
export function newSince<T>(
    key: string,
    items: readonly T[],
    getCreatedAt: (item: T) => string | number | Date,
): number {
    const since = lastVisit(key);
    if (!since) return 0;   // first visit: don't scream "everything new"
    let count = 0;
    for (const it of items) {
        const raw = getCreatedAt(it);
        const t = typeof raw === 'number' ? raw : new Date(raw).getTime();
        if (Number.isFinite(t) && t > since) count += 1;
    }
    return count;
}

/**
 * Grouped counts across multiple lists. Handy for the sidebar badges:
 *   deltas({ interventions: [...], pos: [...] }, key => item[key].created_at)
 */
export function multiNewSince<M extends Record<string, readonly unknown[]>>(
    keyFn: (name: keyof M) => string,
    lists: M,
    getCreatedAt: (name: keyof M, item: unknown) => string | number | Date,
): Record<keyof M, number> {
    const out = {} as Record<keyof M, number>;
    for (const name of Object.keys(lists) as (keyof M)[]) {
        out[name] = newSince(keyFn(name), lists[name], (it) => getCreatedAt(name, it));
    }
    return out;
}
