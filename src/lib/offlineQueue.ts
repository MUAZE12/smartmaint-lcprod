// ============================================================
// Offline write queue.
// When the launcher is offline, Supabase inserts/updates/deletes
// fail with a network error. This helper wraps every mutation:
//   • Try the network call.
//   • If it fails AND we're offline, push the intent onto a
//     localStorage-backed FIFO queue.
//   • When the browser fires the "online" event, drain the queue
//     in order.
//
// The queue is intentionally simple — one entry = one Supabase
// call. It handles the 95% case (single-table inserts/updates) and
// gracefully surrenders on anything more complex (multi-row bulk
// writes with dependencies) by just re-throwing.
// ============================================================

import { supabase } from './supabase';

type Op = 'insert' | 'update' | 'delete';
interface QueuedItem {
    id: string;
    op: Op;
    table: string;
    payload?: Record<string, unknown>;   // insert / update body
    matchColumn?: string;                // update / delete key column
    matchValue?: string | number;        // update / delete key value
    queuedAt: string;
}

const KEY = 'smartmaint-offline-queue';

const readQueue = (): QueuedItem[] => {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
    } catch { return []; }
};

const writeQueue = (q: QueuedItem[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* SSR */ }
};

/** Add an item to the queue and notify listeners. Also fires an
 *  optimistic-mutation event so DataContext can update its local state
 *  immediately — otherwise the user creates a machine offline, closes
 *  the dialog, and the row vanishes because it was never inserted
 *  anywhere but the queue. */
export function enqueue(item: Omit<QueuedItem, 'id' | 'queuedAt'>): QueuedItem {
    const full: QueuedItem = {
        ...item,
        id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        queuedAt: new Date().toISOString(),
    };
    const q = readQueue();
    q.push(full);
    writeQueue(q);
    try {
        window.dispatchEvent(new CustomEvent('smartmaint-queue-changed', { detail: { size: q.length } }));
        // Fire a mutation event carrying the intent so DataContext can
        // apply an optimistic patch to its in-memory state.
        window.dispatchEvent(new CustomEvent('smartmaint-optimistic-mutation', {
            detail: { op: item.op, table: item.table, payload: item.payload, matchColumn: item.matchColumn, matchValue: item.matchValue },
        }));
    } catch { /* SSR */ }
    return full;
}

/** Get all queued inserts for a table so DataContext can splice them into
 *  its initial fetch. Used at boot: even if the user reloaded the page
 *  while offline, the queued rows still show up in the UI. */
export function getQueuedInserts(table: string): Record<string, unknown>[] {
    return readQueue()
        .filter(item => item.op === 'insert' && item.table === table && item.payload)
        .map(item => item.payload as Record<string, unknown>);
}

export function getQueueSize(): number {
    return readQueue().length;
}

/** Drain the queue one item at a time. Successful items are removed;
 *  failed items are left at the head so we can retry next time online. */
export async function drainQueue(): Promise<{ processed: number; failed: number }> {
    let q = readQueue();
    if (q.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    // Snapshot the queue length up-front so we don't loop forever if a
    // network call re-enqueues.
    const initial = q.length;

    for (let i = 0; i < initial; i++) {
        q = readQueue();
        if (q.length === 0) break;
        const head = q[0];
        try {
            await runOne(head);
            // Success — pop head + persist
            q.shift();
            writeQueue(q);
            processed++;
        } catch {
            // Leave item at head; stop draining (likely still offline)
            failed++;
            break;
        }
    }

    try {
        window.dispatchEvent(new CustomEvent('smartmaint-queue-changed', { detail: { size: readQueue().length } }));
        // Ask DataContext to refetch so the just-inserted rows show up
        // with their real Supabase state (id, defaults, etc.).
        if (processed > 0) {
            window.dispatchEvent(new CustomEvent('smartmaint-queue-drained', { detail: { processed } }));
        }
    } catch { /* SSR */ }
    return { processed, failed };
}

async function runOne(item: QueuedItem) {
    const table = supabase.from(item.table);
    if (item.op === 'insert' && item.payload) {
        const { error } = await table.insert(item.payload as never);
        if (error) throw new Error(error.message);
        return;
    }
    if (item.op === 'update' && item.payload && item.matchColumn && item.matchValue !== undefined) {
        const { error } = await table.update(item.payload as never).eq(item.matchColumn, item.matchValue);
        if (error) throw new Error(error.message);
        return;
    }
    if (item.op === 'delete' && item.matchColumn && item.matchValue !== undefined) {
        const { error } = await table.delete().eq(item.matchColumn, item.matchValue);
        if (error) throw new Error(error.message);
        return;
    }
    throw new Error('malformed queue item');
}

/** Wire the queue to fire drain on online events. Call once per app boot.
 *  Also runs a periodic 20 s poll so Windows launcher installations where
 *  navigator.online doesn't fire reliably (dual-NIC, VPN, etc.) still
 *  sync within a reasonable window. */
export function installOfflineQueueListener() {
    if (typeof window === 'undefined') return;
    const tryDrain = (delayMs = 0) => {
        if (!navigator.onLine) return;
        if (readQueue().length === 0) return;
        setTimeout(() => { drainQueue(); }, delayMs);
    };
    const onOnline = () => tryDrain(800);
    const onVisibility = () => {
        // User came back to the tab — good moment to try again.
        if (document.visibilityState === 'visible') tryDrain(200);
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    // Periodic safety net — every 20 s, if we're online and have queued
    // items, drain. Catches the case where `online` never fires on
    // Windows (common with unreliable WiFi drivers).
    const timer = setInterval(() => tryDrain(0), 20_000);
    // Kick immediately at boot too.
    tryDrain(1500);
    // Return a disposer so the AppShell useEffect can clean up if it wants,
    // though for a single-tab app this leaks are fine.
    return () => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
        clearInterval(timer);
    };
}
