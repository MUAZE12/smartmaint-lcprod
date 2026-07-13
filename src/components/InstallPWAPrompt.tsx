'use client';

// Small non-intrusive banner on Android / iPadOS that offers
// "Installer sur l'écran d'accueil". On iOS Safari we can't show a
// native prompt (no beforeinstallprompt), so we show manual steps.
//
// Only shown once per user (localStorage 'smartmaint-pwa-prompt-seen').

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function InstallPWAPrompt() {
    const [deferred, setDeferred] = useState<Prompt | null>(null);
    const [iosHint, setIosHint] = useState(false);
    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        try {
            const seen = localStorage.getItem('smartmaint-pwa-prompt-seen');
            if (seen) return;
        } catch { /* ignore */ }

        // Skip if we're already running as a PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferred(e as Prompt);
            setHidden(false);
        };
        window.addEventListener('beforeinstallprompt', handler);

        // iOS Safari doesn't fire beforeinstallprompt. Detect and show manual hint.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
        if (isIOS) {
            setIosHint(true);
            setHidden(false);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const dismiss = () => {
        setHidden(true);
        try { localStorage.setItem('smartmaint-pwa-prompt-seen', '1'); } catch { /* ignore */ }
    };

    const install = async () => {
        if (!deferred) return;
        try {
            await deferred.prompt();
            await deferred.userChoice;
        } finally { dismiss(); }
    };

    if (hidden || (!deferred && !iosHint)) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 12, left: 12, right: 12,
            maxWidth: 480, margin: '0 auto',
            padding: '12px 14px',
            borderRadius: 14, background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
            color: 'white', zIndex: 9990,
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 12px 30px rgba(30,64,175,0.35)',
        }}>
            <Download size={20} />
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>
                {iosHint
                    ? <>Ajouter à l&apos;écran d&apos;accueil : bouton <b>Partager</b> → <b>Sur l&apos;écran d&apos;accueil</b>.</>
                    : <>Installer SmartMaint sur ce poste — l&apos;app démarre en 2 s et fonctionne hors ligne.</>}
            </div>
            {!iosHint && deferred && (
                <button onClick={install} style={{
                    background: 'white', color: '#1e40af', border: 'none',
                    padding: '8px 12px', borderRadius: 8,
                    fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                }}>Installer</button>
            )}
            <button onClick={dismiss} aria-label="Fermer" style={{
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
            }}><X size={16} /></button>
        </div>
    );
}
