'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import SplashScreen from './SplashScreen';
import AlertWatcher from './AlertWatcher';
import NotifWatcher from './NotifWatcher';
import { installOfflineQueueListener } from '@/lib/offlineQueue';
import UpdateNotifier from './UpdateNotifier';
import PWAManager from './PWAManager';
import TutorialTour from './TutorialTour';

// Spring-based page transition — futuristic sliding fade
const pageVariants = {
    initial: { opacity: 0, x: 20, scale: 0.995, filter: 'blur(4px)' },
    animate: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, x: -20, scale: 0.995, filter: 'blur(4px)' },
};

const pageTransition = {
    type: 'spring' as const,
    stiffness: 260,
    damping: 28,
    mass: 0.8,
};

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useAuth();
    const { locale, t, setLanguage } = useApp();
    const pathname = usePathname();
    const isLoginPage = pathname === '/';
    const isRTL = locale.language === 'ar';

    // Mobile drawer state — the sidebar is off-canvas on phones/tablets.
    const [navOpen, setNavOpen] = useState(false);

    // Force the UI language to match the signed-in role on every login:
    //   • operator         → Arabic (RTL)
    //   • admin / technician → French (main language)
    // Stops a previous operator session from leaving the next admin in Arabic.
    useEffect(() => {
        if (!user) return;
        const desired = user.role === 'operator' ? 'ar' : 'fr';
        if (locale.language !== desired) setLanguage(desired);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.supabaseId]);

    // ── Keep <html dir> in sync with the active language. Many of the mobile
    //    drawer + form CSS rules use [dir="rtl"] selectors; without this the
    //    operator (Arabic) would never see RTL applied at the document level.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
        document.documentElement.lang = locale.language;
    }, [isRTL, locale.language]);

    // ── Force Recharts to re-measure before the browser prints ──
    // Chromium takes its print snapshot the microsecond after `beforeprint`
    // fires — Recharts' ResizeObserver + rAF never get to redraw at the
    // new viewport. The fix that works: hijack window.print(), fire two
    // resize events + a body-flag flip that we watch in a `key` prop on
    // every chart wrapper (via CSS custom property → data-attribute), wait
    // 700 ms for Recharts to fully rebuild, THEN call the real print().
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const originalPrint = window.print;
        interface WithFlag { __smWrapped?: boolean }
        if ((originalPrint as unknown as WithFlag).__smWrapped) return;
        const wrapped = function () {
            try {
                // Flag the DOM so any hook watching for "print prep" can
                // force-remount its Recharts subtree.
                document.body.setAttribute('data-print-prep', '1');
                window.dispatchEvent(new Event('resize'));
                window.dispatchEvent(new CustomEvent('smartmaint-print-prep'));
            } catch { /* ignore */ }
            // A second resize kick right before the snapshot catches any
            // ResizeObserver that batched the first one.
            setTimeout(() => {
                try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
            }, 350);
            // 700 ms total gives Recharts time to fully remeasure + rAF paint.
            setTimeout(() => {
                originalPrint.call(window);
                document.body.removeAttribute('data-print-prep');
            }, 700);
        };
        (wrapped as unknown as WithFlag).__smWrapped = true;
        window.print = wrapped;
        // Fallback: Ctrl+P bypasses wrapped print(). At least fire a resize.
        const kick = () => {
            try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
        };
        window.addEventListener('beforeprint', kick);
        window.addEventListener('afterprint', kick);
        return () => {
            window.removeEventListener('beforeprint', kick);
            window.removeEventListener('afterprint', kick);
            window.print = originalPrint;
        };
    }, []);

    // Install the offline-queue drain listener once — fires when the
    // browser regains connectivity and flushes any queued mutations.
    useEffect(() => {
        installOfflineQueueListener();
    }, []);

    // Show splash screen on login page
    // PWAManager mounts here too so the SW registers and the install
    // banner can appear even before authentication.
    if (!isAuthenticated || isLoginPage) {
        return (
            <>
                <SplashScreen />
                <PWAManager />
                {children}
            </>
        );
    }

    return (
        <div style={{ display: 'flex' }}>
            {/* Background email-alert + auto-reorder + weekly-digest watcher.
                Admin-only so multiple open sessions can't fire duplicate emails. */}
            {user?.role === 'admin' && <AlertWatcher />}
            {/* In-app pop-ups gated by Paramètres → Notifications. Admin-only for now. */}
            {user?.role === 'admin' && <NotifWatcher />}
            {/* Polls the update channel and shows a banner when a newer build is published */}
            <UpdateNotifier />
            {/* PWA: service-worker registration + install banner + offline chip */}
            <PWAManager />
            {/* One-time guided tour per user — fires on first authenticated session */}
            <TutorialTour />
            <Sidebar mobileOpen={navOpen} onNavigate={() => setNavOpen(false)} />

            {/* Backdrop — only visible on mobile while the drawer is open */}
            {navOpen && <div className="mobile-backdrop" onClick={() => setNavOpen(false)} />}

            <div
                className="app-content"
                style={{
                    flex: 1,
                    marginLeft: isRTL ? undefined : 260,
                    marginRight: isRTL ? 260 : undefined,
                    minHeight: '100vh',
                    transition: 'margin 0.25s ease',
                }}
            >
                {/* Mobile top bar — hidden on desktop via CSS */}
                <div className="mobile-topbar">
                    <button
                        onClick={() => setNavOpen(true)}
                        aria-label="Ouvrir le menu"
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', padding: 4 }}
                    >
                        <Menu size={24} />
                    </button>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t('nav.appName')}</span>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={pathname}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        variants={pageVariants}
                        transition={pageTransition}
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
