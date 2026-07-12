'use client';

// ============================================================
// PWAManager — registers the service worker, captures the install
// prompt, and exposes a small UI:
//   • Install banner — shown when beforeinstallprompt is available
//   • Offline indicator — small chip when navigator.onLine is false
// On iOS Safari, beforeinstallprompt never fires; we detect iOS
// and render a one-time hint guiding users to "Add to Home Screen".
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Download, WifiOff, Wifi, X, Share, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getQueueSize } from '@/lib/offlineQueue';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'smartmaint-pwa-install-dismissed';
const IOS_HINT_KEY = 'smartmaint-pwa-ios-hint-dismissed';

export default function PWAManager() {
    const { locale } = useApp();
    const isAr = locale?.language === 'ar';

    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [offline, setOffline] = useState(false);
    const [queueSize, setQueueSize] = useState(0);
    const [justCameOnline, setJustCameOnline] = useState(false);
    const [iosHint, setIosHint] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const registered = useRef(false);

    // ── Detect "already installed" mode ─────────────────────
    // True when running as installed PWA / Android TWA APK / iOS home-screen.
    // Use a media-query listener so we react if the user installs while the
    // tab stays open.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(display-mode: standalone)');
        const recompute = () => setIsStandalone(
            mq.matches || (navigator as { standalone?: boolean }).standalone === true
        );
        recompute();
        mq.addEventListener?.('change', recompute);
        return () => mq.removeEventListener?.('change', recompute);
    }, []);

    // ── Register service worker once ───────────────────────
    useEffect(() => {
        if (registered.current) return;
        registered.current = true;
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;
        // Don't register in dev — only on https (or localhost)
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isSecure) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then(reg => console.log('[PWA] SW registered:', reg.scope))
                .catch(err => console.warn('[PWA] SW registration failed:', err));
        });
    }, []);

    // ── beforeinstallprompt capture ────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setInstallEvent(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setInstallEvent(null);
            try { localStorage.setItem(DISMISS_KEY, 'installed'); } catch { /* ignore */ }
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);

        // Honor previously dismissed banner
        try { if (localStorage.getItem(DISMISS_KEY)) setDismissed(true); } catch { /* ignore */ }

        // iOS detection — Safari never fires beforeinstallprompt
        const ua = navigator.userAgent;
        const isIos = /iPhone|iPad|iPod/i.test(ua) && !(/CriOS|FxiOS/i.test(ua));
        const standaloneNow = window.matchMedia('(display-mode: standalone)').matches
            || (navigator as { standalone?: boolean }).standalone === true;
        if (isIos && !standaloneNow) {
            try { if (!localStorage.getItem(IOS_HINT_KEY)) setIosHint(true); } catch { /* ignore */ }
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    // ── Online/offline indicator + queue watcher ───────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const setStatus = () => setOffline(!navigator.onLine);
        setStatus();
        const onOnline = () => {
            setOffline(false);
            setJustCameOnline(true);
            // Show the "back online" chip for 4 s while the queue drains.
            setTimeout(() => setJustCameOnline(false), 4000);
        };
        const onQueue = (e: Event) => {
            const detail = (e as CustomEvent<{ size?: number }>).detail;
            if (detail && typeof detail.size === 'number') setQueueSize(detail.size);
        };
        setQueueSize(getQueueSize());
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', setStatus);
        window.addEventListener('smartmaint-queue-changed', onQueue);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', setStatus);
            window.removeEventListener('smartmaint-queue-changed', onQueue);
        };
    }, []);

    const handleInstall = async () => {
        if (!installEvent) return;
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') console.log('[PWA] Install accepted');
        setInstallEvent(null);
    };

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    };

    const dismissIos = () => {
        setIosHint(false);
        try { localStorage.setItem(IOS_HINT_KEY, String(Date.now())); } catch { /* ignore */ }
    };

    return (
        <>
            {/* ── Offline chip — with a queue counter so the user sees ── */}
            {/*    that their edits are being saved locally. ── */}
            {offline && (
                <div style={{
                    position: 'fixed',
                    top: 12, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 9995,
                    background: 'rgba(220, 38, 38, 0.95)',
                    color: 'white',
                    padding: '8px 18px',
                    borderRadius: 100,
                    fontSize: 12.5, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 8px 24px rgba(220, 38, 38, 0.4)',
                    backdropFilter: 'blur(8px)',
                    fontFamily: 'inherit',
                    maxWidth: '90vw',
                }}>
                    <WifiOff size={14} />
                    {isAr ? 'بدون اتصال' : 'Hors ligne'}
                    {queueSize > 0 && (
                        <span style={{ padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.22)', fontSize: 11, fontWeight: 800 }}>
                            {queueSize} {isAr ? 'في الانتظار' : 'en attente'}
                        </span>
                    )}
                    <span style={{ fontWeight: 500, opacity: 0.9, fontSize: 11.5 }}>
                        · {isAr ? 'ستُرسل تلقائيًا عند العودة' : 'sync auto au retour'}
                    </span>
                </div>
            )}

            {/* ── Back online chip — shown for 4 s while the queue drains ── */}
            {!offline && justCameOnline && (
                <div style={{
                    position: 'fixed',
                    top: 12, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 9995,
                    background: 'rgba(22, 163, 74, 0.95)',
                    color: 'white',
                    padding: '8px 18px',
                    borderRadius: 100,
                    fontSize: 12.5, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 8px 24px rgba(22,163,74,0.4)',
                    backdropFilter: 'blur(8px)',
                    fontFamily: 'inherit',
                }}>
                    <Wifi size={14} />
                    {isAr ? 'العودة إلى الإنترنت' : 'De retour en ligne'}
                    {queueSize > 0 && <span style={{ opacity: 0.9, fontWeight: 500 }}>· {isAr ? 'يجري المزامنة…' : 'sync…'}</span>}
                </div>
            )}

            {/* ── Android/Chrome install banner ── */}
            {installEvent && !dismissed && !offline && !isStandalone && (
                <div style={{
                    position: 'fixed',
                    bottom: 20, ...(isAr ? { right: 20 } : { left: 20 }),
                    zIndex: 9994,
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    padding: '14px 18px',
                    borderRadius: 14,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    maxWidth: 380,
                    fontSize: 14,
                    animation: 'fadeIn 0.3s ease-out',
                    fontFamily: 'inherit',
                }}>
                    <Download size={22} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, lineHeight: 1.35 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                            {isAr ? 'تثبيت التطبيق على هذا الجهاز' : 'Installer l\'application'}
                        </div>
                        <div style={{ opacity: 0.9, fontSize: 12.5 }}>
                            {isAr ? 'احصل على وصول أسرع من شاشتك الرئيسية' : 'Accès rapide depuis l\'écran d\'accueil'}
                        </div>
                    </div>
                    <button onClick={handleInstall} style={installBtnStyle}>
                        {isAr ? 'تثبيت' : 'Installer'}
                    </button>
                    <button onClick={dismiss} aria-label="Ignorer" style={dismissBtnStyle}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── iOS Safari hint (Add to Home Screen) ── */}
            {iosHint && !offline && !isStandalone && (
                <div style={{
                    position: 'fixed',
                    bottom: 20, ...(isAr ? { right: 20 } : { left: 20 }),
                    zIndex: 9994,
                    background: 'linear-gradient(135deg, #0891b2, #155e75)',
                    color: 'white',
                    padding: '14px 18px',
                    borderRadius: 14,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    maxWidth: 380,
                    fontSize: 13.5,
                    fontFamily: 'inherit',
                }}>
                    <Share size={22} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, lineHeight: 1.35 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                            {isAr ? 'تثبيت على iOS' : 'Installer sur iOS'}
                        </div>
                        <div style={{ opacity: 0.9, fontSize: 12 }}>
                            {isAr
                                ? 'اضغط على زر المشاركة ثم « إضافة إلى الشاشة الرئيسية »'
                                : <>Touchez <Share size={11} style={{ verticalAlign: -1 }} /> puis « Sur l&apos;écran d&apos;accueil » <Plus size={11} style={{ verticalAlign: -1 }} /></>}
                        </div>
                    </div>
                    <button onClick={dismissIos} aria-label="Fermer" style={dismissBtnStyle}>
                        <X size={14} />
                    </button>
                </div>
            )}
        </>
    );
}

const installBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.95)',
    color: '#1e40af',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
};

const dismissBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: 'white',
    width: 28,
    height: 28,
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
};
