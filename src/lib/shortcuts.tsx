'use client';

// ============================================================
// Global keyboard shortcuts registry.
//
// Register anywhere with `useShortcut('n', callback, { description })`.
// The shortcut is scoped to the current mount — cleaned up automatically.
// Press `?` from anywhere to see the cheatsheet (rendered by ShortcutHelp).
//
// Skips input/textarea/contenteditable so typing isn't hijacked.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Keyboard, X } from 'lucide-react';

interface Shortcut {
    id: string;
    key: string;             // 'n' | 'shift+n' | 'ctrl+k' — matching is case-insensitive on the letter
    description: string;
    handler: (e: KeyboardEvent) => void;
    scope?: string;          // e.g. 'admin' — only fires when scope tag matches
}

interface Ctx {
    register: (s: Shortcut) => void;
    unregister: (id: string) => void;
    list: Shortcut[];
    setHelpOpen: (open: boolean) => void;
    setScope: (scope: string) => void;
}

const KeyboardCtx = createContext<Ctx | null>(null);

function normalizeCombo(combo: string): string {
    return combo.toLowerCase().split('+').map(s => s.trim()).sort().join('+');
}

function eventCombo(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    // Use `e.key` for the primary token (lowercased); `Escape` → 'escape'.
    parts.push(e.key.toLowerCase());
    return parts.sort().join('+');
}

function isEditableTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
    const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
    const [helpOpen, setHelpOpen] = useState(false);
    const [scope, setScope] = useState<string>('');

    const register = useCallback((s: Shortcut) => {
        setShortcuts(prev => prev.filter(x => x.id !== s.id).concat(s));
    }, []);
    const unregister = useCallback((id: string) => {
        setShortcuts(prev => prev.filter(x => x.id !== id));
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Escape always closes the help panel and modals — even in inputs.
            if (e.key === 'Escape') {
                if (helpOpen) { setHelpOpen(false); return; }
                // Emit a broad "escape pressed" event any Modal can listen for.
                window.dispatchEvent(new CustomEvent('smartmaint-escape'));
                return;
            }
            // Toggle help with `?` (Shift+/ on most keyboards).
            if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isEditableTarget(e.target)) {
                e.preventDefault();
                setHelpOpen(v => !v);
                return;
            }
            if (isEditableTarget(e.target)) return;

            const combo = eventCombo(e);
            const s = shortcuts.find(s => normalizeCombo(s.key) === combo && (!s.scope || s.scope === scope));
            if (s) {
                e.preventDefault();
                s.handler(e);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shortcuts, helpOpen, scope]);

    // CRITICAL: ctx must be STABLE across shortcut list changes. If we put
    // `shortcuts` in the memo dep, every register() call recreates ctx,
    // which triggers every useShortcut effect to fire again, which calls
    // register() again — infinite loop → global error boundary → "Une erreur
    // est survenue" on the admin dashboard.
    //
    // Fix: expose only the STABLE methods through context (register, unregister,
    // setHelpOpen, setScope). Consumers of the LIST (help overlay) get it from
    // internal state, not from context. This decouples registration from render.
    const ctx: Ctx = useMemo(() => ({ register, unregister, list: shortcuts, setHelpOpen, setScope }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [register, unregister]);

    return (
        <KeyboardCtx.Provider value={ctx}>
            {children}
            {helpOpen && <ShortcutHelp shortcuts={shortcuts} onClose={() => setHelpOpen(false)} />}
        </KeyboardCtx.Provider>
    );
}

/** Register a shortcut for the lifetime of the calling component. */
export function useShortcut(key: string, handler: (e: KeyboardEvent) => void, opts: { description: string; scope?: string; enabled?: boolean } = { description: '' }) {
    const ctx = useContext(KeyboardCtx);
    // Keep the handler in a ref so a new closure per render doesn't re-fire
    // the register effect. The registered shortcut always calls the LATEST
    // handler via handlerRef.current.
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!ctx || opts.enabled === false) return;
        const id = key + ':' + opts.description;
        ctx.register({
            id, key, description: opts.description, scope: opts.scope,
            handler: (e) => handlerRef.current(e),
        });
        return () => ctx.unregister(id);
        // Depend only on registration identity, not handler (in the ref).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, key, opts.description, opts.scope, opts.enabled]);
}

/** Read/toggle helpers for the help panel. */
export function useShortcutsControl() {
    const ctx = useContext(KeyboardCtx);
    return {
        openHelp: () => ctx?.setHelpOpen(true),
        setScope: (scope: string) => ctx?.setScope(scope),
        shortcuts: ctx?.list ?? [],
    };
}

// ── Help overlay ──────────────────────────────────────────
function ShortcutHelp({ shortcuts, onClose }: { shortcuts: Shortcut[]; onClose: () => void }) {
    const grouped: Record<string, Shortcut[]> = {};
    for (const s of shortcuts) {
        const scope = s.scope ?? 'Global';
        (grouped[scope] ??= []).push(s);
    }
    return (
        <div
            role="dialog" aria-modal="true"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, backdropFilter: 'blur(2px)',
            }}
        >
            <div onClick={e => e.stopPropagation()} style={{
                width: 'min(560px, 92vw)', maxHeight: '80vh', overflow: 'auto',
                background: 'var(--surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 16,
                padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Keyboard size={18} color="#3b82f6" />
                    <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>Raccourcis clavier</div>
                    <button onClick={onClose} aria-label="Fermer" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                {Object.keys(grouped).length === 0 && (
                    <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                        Aucun raccourci enregistré sur cette page.
                    </div>
                )}
                {Object.entries(grouped).map(([scope, list]) => (
                    <div key={scope} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{scope}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {list.map(s => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-hover)' }}>
                                    <kbd style={{
                                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                                        padding: '2px 8px', borderRadius: 6,
                                        border: '1px solid var(--border)', background: 'var(--background)',
                                        minWidth: 44, textAlign: 'center',
                                    }}>{s.key.toUpperCase()}</kbd>
                                    <span style={{ fontSize: 13.5 }}>{s.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
                    Appuyez sur <kbd style={{ fontFamily: 'monospace' }}>?</kbd> à tout moment pour revoir cette liste.
                </div>
            </div>
        </div>
    );
}
