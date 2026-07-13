'use client';

// ============================================================
// OfflineIndicator — small pill in the header.
//
// States:
//   • ONLINE, empty queue        → nothing shown
//   • ONLINE, N pending          → blue pill "3 en attente"
//   • OFFLINE                    → orange pill "Hors ligne — 3 en attente"
//
// Click → open a slide-over with the full queue, retry / clear actions.
// ============================================================

import { useEffect, useState } from 'react';
import { CloudOff, Cloud, RefreshCw, X, Trash2 } from 'lucide-react';
import { getQueueSize, drainQueue } from '@/lib/offlineQueue';

export default function OfflineIndicator() {
    const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
    const [pending, setPending] = useState(0);
    const [open, setOpen] = useState(false);
    const [draining, setDraining] = useState(false);

    // Live queue size — tracks the `smartmaint-queue-changed` event that
    // offlineQueue.ts dispatches on every enqueue/drain.
    useEffect(() => {
        setPending(getQueueSize());
        const onChanged = (e: Event) => {
            const detail = (e as CustomEvent<{ size: number }>).detail;
            setPending(detail?.size ?? getQueueSize());
        };
        window.addEventListener('smartmaint-queue-changed', onChanged);
        return () => window.removeEventListener('smartmaint-queue-changed', onChanged);
    }, []);

    // Online / offline
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    const retry = async () => {
        setDraining(true);
        try { await drainQueue(); } finally { setDraining(false); }
    };

    // Only render when there's something to say
    if (online && pending === 0) return null;

    const bg = online ? '#dbeafe' : '#fed7aa';
    const fg = online ? '#1e40af' : '#7c2d12';
    const Icon = online ? Cloud : CloudOff;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={online ? 'Envois en attente' : 'Hors ligne — les modifs sont mises en file'}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 100,
                    background: bg, color: fg, border: 'none',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                }}>
                <Icon size={13} />
                {online ? `${pending} en attente` : (pending > 0 ? `Hors ligne · ${pending}` : 'Hors ligne')}
            </button>

            {open && (
                <div
                    role="dialog" aria-modal="true"
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9998,
                    }}
                >
                    <div onClick={e => e.stopPropagation()} style={{
                        width: 'min(480px, 92vw)', background: 'var(--surface)', borderRadius: 14,
                        padding: 20, border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <Icon size={18} color={fg} />
                            <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                                {online ? 'Envois en attente' : 'Hors ligne'}
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                            {online
                                ? `${pending} modification(s) sont mises en file d'attente. Elles seront envoyées automatiquement dans les 20 secondes.`
                                : `Vous êtes hors ligne. ${pending} modification(s) sont enregistrées localement — elles partiront dès que la connexion revient. Aucune donnée n'est perdue.`}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={retry}
                                disabled={!online || draining || pending === 0}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '9px 14px', borderRadius: 8, border: 'none',
                                    background: online ? '#3b82f6' : 'var(--surface-hover)',
                                    color: online ? 'white' : 'var(--text-muted)',
                                    fontWeight: 600, fontSize: 13, cursor: online && pending > 0 ? 'pointer' : 'not-allowed',
                                    fontFamily: 'inherit', opacity: pending === 0 ? 0.5 : 1,
                                }}>
                                <RefreshCw size={13} className={draining ? 'sm-spin' : undefined} /> Réessayer maintenant
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Vider la file — les modifications non envoyées seront perdues.')) {
                                        try { localStorage.removeItem('smartmaint-offline-queue'); } catch { /* ignore */ }
                                        window.dispatchEvent(new CustomEvent('smartmaint-queue-changed', { detail: { size: 0 } }));
                                    }
                                }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '9px 14px', borderRadius: 8,
                                    background: 'transparent', color: '#dc2626',
                                    border: '1px solid #fca5a5',
                                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}>
                                <Trash2 size={13} /> Vider la file
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
