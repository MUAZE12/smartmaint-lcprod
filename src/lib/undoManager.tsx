'use client';

// ============================================================
// Undo manager — every destructive action posts a rollback fn.
// A floating toast appears for 8 s with "Rétablir". Click it or press
// Ctrl+Z within the window to rewind.
//
// USAGE:
//   const { queueUndo } = useUndo();
//   await interventionsDb.remove(id);
//   queueUndo({
//     description: `Intervention ${code} supprimée`,
//     rollback: () => interventionsDb.insert(before),
//   });
//
// The queue holds up to 5 concurrent undos, each with its own expiry.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Undo2, X } from 'lucide-react';

interface UndoEntry {
    id: string;
    description: string;
    rollback: () => Promise<void> | void;
    createdAt: number;
    ttlMs: number;
    running: boolean;
    done: boolean;
    error?: string;
}

interface Ctx {
    queueUndo: (opts: { description: string; rollback: () => Promise<void> | void; ttlMs?: number }) => string;
    trigger: (id: string) => Promise<void>;
    dismiss: (id: string) => void;
    entries: UndoEntry[];
}

const UndoCtx = createContext<Ctx | null>(null);

export function UndoProvider({ children, defaultTtlMs = 8000 }: { children: ReactNode; defaultTtlMs?: number }) {
    const [entries, setEntries] = useState<UndoEntry[]>([]);
    const entriesRef = useRef(entries);
    entriesRef.current = entries;

    // Rolling tick for the countdown ring — a fresh ref lets us render every 250ms
    // without recomputing anything expensive.
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => (t + 1) & 0xffff), 250);
        return () => clearInterval(id);
    }, []);

    // Sweep expired entries.
    useEffect(() => {
        const id = setInterval(() => {
            const now = Date.now();
            setEntries(prev => prev.filter(e => !e.done && (e.createdAt + e.ttlMs) > now));
        }, 500);
        return () => clearInterval(id);
    }, []);

    const queueUndo = useCallback((opts: { description: string; rollback: () => Promise<void> | void; ttlMs?: number }) => {
        const id = 'undo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const entry: UndoEntry = {
            id, description: opts.description, rollback: opts.rollback,
            createdAt: Date.now(), ttlMs: opts.ttlMs ?? defaultTtlMs,
            running: false, done: false,
        };
        setEntries(prev => [entry, ...prev].slice(0, 5));
        return id;
    }, [defaultTtlMs]);

    const trigger = useCallback(async (id: string) => {
        const e = entriesRef.current.find(x => x.id === id);
        if (!e || e.running || e.done) return;
        setEntries(prev => prev.map(x => x.id === id ? { ...x, running: true } : x));
        try {
            await e.rollback();
            setEntries(prev => prev.map(x => x.id === id ? { ...x, running: false, done: true } : x));
        } catch (err) {
            setEntries(prev => prev.map(x => x.id === id
                ? { ...x, running: false, error: err instanceof Error ? err.message : 'Erreur' }
                : x));
        }
    }, []);

    const dismiss = useCallback((id: string) => {
        setEntries(prev => prev.filter(x => x.id !== id));
    }, []);

    // Ctrl+Z anywhere (except in inputs) → undo the newest entry.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
            const t = e.target;
            if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            const newest = entriesRef.current.find(x => !x.done);
            if (!newest) return;
            e.preventDefault();
            trigger(newest.id);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [trigger]);

    const ctx: Ctx = useMemo(() => ({ queueUndo, trigger, dismiss, entries }), [queueUndo, trigger, dismiss, entries]);

    return (
        <UndoCtx.Provider value={ctx}>
            {children}
            <UndoStack entries={entries} onUndo={trigger} onDismiss={dismiss} />
        </UndoCtx.Provider>
    );
}

export function useUndo(): Ctx {
    const ctx = useContext(UndoCtx);
    if (!ctx) throw new Error('useUndo() must be inside <UndoProvider>');
    return ctx;
}

// ── UI ────────────────────────────────────────────────────
function UndoStack({ entries, onUndo, onDismiss }: { entries: UndoEntry[]; onUndo: (id: string) => void; onDismiss: (id: string) => void }) {
    if (entries.length === 0) return null;
    return (
        <div style={{
            position: 'fixed', bottom: 20, left: 20, zIndex: 9998,
            display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380,
        }}>
            {entries.filter(e => !e.done).map(e => {
                const elapsed = Date.now() - e.createdAt;
                const remaining = Math.max(0, e.ttlMs - elapsed);
                const pct = Math.round((remaining / e.ttlMs) * 100);
                return (
                    <div key={e.id} style={{
                        background: '#0f172a', color: 'white', borderRadius: 12,
                        boxShadow: '0 16px 32px rgba(0,0,0,0.35)',
                        padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
                        border: e.error ? '1px solid #f87171' : '1px solid #1e293b',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ fontSize: 13.5, flex: 1 }}>{e.description}</div>
                            <button
                                onClick={() => onUndo(e.id)}
                                disabled={e.running}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    background: e.error ? '#dc2626' : '#3b82f6', color: 'white',
                                    border: 'none', padding: '6px 12px', borderRadius: 8,
                                    fontSize: 12.5, fontWeight: 700, cursor: e.running ? 'wait' : 'pointer',
                                    fontFamily: 'inherit',
                                }}>
                                <Undo2 size={13} /> {e.running ? '...' : 'Rétablir'}
                            </button>
                            <button onClick={() => onDismiss(e.id)} aria-label="Fermer" style={{
                                background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer',
                            }}>
                                <X size={14} />
                            </button>
                        </div>
                        {e.error ? (
                            <div style={{ fontSize: 12, color: '#fca5a5' }}>Échec: {e.error}</div>
                        ) : (
                            <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: pct + '%', height: '100%', background: '#3b82f6', transition: 'width 0.25s linear' }} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
