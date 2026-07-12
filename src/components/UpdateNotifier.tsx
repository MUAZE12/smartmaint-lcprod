'use client';

// ============================================================
// UpdateNotifier — polls the update channel for a newer version
// and shows a banner inviting the user to restart.
//
// Sources:
//   • Local version  ← GET /api/version  (reads installed version.txt)
//   • Remote version ← <channel>/version.txt with a cache-busting query
//
// The channel URL is read at runtime from the C# launcher's
// update-channel.txt (also published to /api/update-channel below).
// Falls back silently if either side is unreachable — this is a
// nice-to-have notifier, not a hard dependency.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, RefreshCw, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const POLL_INTERVAL_MS = 60_000; // 1 min

export default function UpdateNotifier() {
    const { locale } = useApp();
    const isRTL = locale.language === 'ar';

    const [localVer, setLocalVer] = useState<string>('');
    const [remoteVer, setRemoteVer] = useState<string>('');
    const [dismissed, setDismissed] = useState<string>(''); // remoteVer the user already dismissed
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState<string>('');
    const channelRef = useRef<string>('');

    // Trigger the auto-update. On success the Node process will exit and
    // the Windows launcher will restart it — the browser tab will keep
    // spinning for ~2 s then auto-refresh once the new server answers.
    const applyUpdate = async () => {
        setApplying(true);
        setApplyError('');
        try {
            const res = await fetch('/api/apply-update', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                setApplyError(data.error || 'Échec de la mise à jour');
                setApplying(false);
                return;
            }
            // The server will exit in 800 ms. Start polling /api/version;
            // once we see the new version answer, hard-refresh the page.
            const target = remoteVer;
            const start = Date.now();
            const poll = async () => {
                try {
                    const vRes = await fetch('/api/version?cb=' + Date.now(), { cache: 'no-store' });
                    if (vRes.ok) {
                        const j = await vRes.json();
                        if ((j.version || '').trim() === target) {
                            window.location.reload();
                            return;
                        }
                    }
                } catch { /* server not back yet */ }
                if (Date.now() - start > 90_000) {
                    // Launcher didn't relaunch within 90s — Next.js cold
                    // boot can take that long on slow disks. Instruct the
                    // user manually as a last resort.
                    setApplyError('Mise à jour téléchargée ✓ — fermez puis rouvrez l\'application pour terminer.');
                    setApplying(false);
                    return;
                }
                setTimeout(poll, 1500);
            };
            // Give Node a moment to actually exit before we start polling
            setTimeout(poll, 2000);
        } catch (err) {
            setApplyError(err instanceof Error ? err.message : 'Erreur réseau');
            setApplying(false);
        }
    };

    // ── 1. Load local version + channel URL once ─────────────
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [vRes, cRes] = await Promise.all([
                    fetch('/api/version', { cache: 'no-store' }),
                    fetch('/api/update-channel', { cache: 'no-store' }),
                ]);
                if (!alive) return;
                const v = await vRes.json().catch(() => ({ version: '' }));
                const c = await cRes.json().catch(() => ({ channel: '' }));
                setLocalVer((v.version || '').trim());
                channelRef.current = (c.channel || '').trim();
            } catch {
                /* ignore — notifier is best-effort */
            }
        })();
        return () => { alive = false; };
    }, []);

    // ── 2. Poll the channel for the latest version ───────────
    useEffect(() => {
        if (!channelRef.current) return;
        let alive = true;

        const check = async () => {
            try {
                const url = channelRef.current.replace(/\/+$/, '') + '/version.txt?cb=' + Date.now();
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) return;
                const txt = (await res.text()).trim();
                if (alive && txt) setRemoteVer(txt);
            } catch {
                /* silent */
            }
        };

        check();
        const id = setInterval(check, POLL_INTERVAL_MS);
        return () => { alive = false; clearInterval(id); };
    }, [localVer]); // re-arm once we know what we're on

    // ── 3. Decide whether to render ─────────────────────────
    const hasUpdate = !!localVer && !!remoteVer && remoteVer > localVer && dismissed !== remoteVer;
    if (!hasUpdate) return null;

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                bottom: 20,
                ...(isRTL ? { left: 20 } : { right: 20 }),
                zIndex: 9999,
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                color: 'white',
                padding: '14px 18px',
                borderRadius: 14,
                boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                maxWidth: 380,
                fontSize: 14,
                animation: 'fadeIn 0.3s ease-out',
            }}
        >
            <Sparkles size={22} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, lineHeight: 1.35 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Nouvelle mise à jour disponible</div>
                <div style={{ opacity: 0.9, fontSize: 12.5 }}>
                    {applying
                        ? `Installation de la version ${remoteVer} — l’application va se fermer puis se rouvrir toute seule…`
                        : applyError
                        ? applyError
                        : `Cliquez « Mettre à jour » — l’app se ferme puis se rouvre automatiquement sur la version ${remoteVer}.`}
                </div>
            </div>
            {!applying && !applyError && (
                <button
                    onClick={applyUpdate}
                    style={{
                        background: 'rgba(255,255,255,0.95)',
                        color: '#1e40af',
                        border: 'none',
                        padding: '8px 14px',
                        borderRadius: 9,
                        fontSize: 12.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    <RefreshCw size={13} /> Mettre à jour
                </button>
            )}
            {applying && (
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                    <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Mise à jour…
                </div>
            )}
            <button
                onClick={() => setDismissed(remoteVer)}
                aria-label="Ignorer"
                disabled={applying}
                style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: 'white',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    cursor: applying ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    opacity: applying ? 0.5 : 1,
                }}
            >
                <X size={14} />
            </button>
        </div>
    );
}
