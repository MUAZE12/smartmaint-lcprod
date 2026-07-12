'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ============================================
// Types (kept identical so all consumers work)
// ============================================
export type UserRole = 'admin' | 'technician' | 'operator';

export interface User {
    role: UserRole;
    name: string;
    avatar: string;   // 2-letter initials (used when no photo set)
    /** Base64 dataURL or remote URL of the user's profile photo.
     *  Set via UserProfile → saves to user_metadata.avatar_url. */
    avatarUrl?: string;
    phone?: string;
    email: string;
    supabaseId: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<{ error: string | null }>;
    logout: () => void;
    isAuthenticated: boolean;
    loading: boolean;
}

// ============================================
// Helpers
// ============================================

/** Build our User shape from a Supabase session.
 *  Expects user_metadata: { role, full_name } set when the account was created.
 */
function sessionToUser(session: Session): User {
    const meta = session.user.user_metadata ?? {};
    // Default to 'admin' when no role is set, so a fresh Supabase user
    // can log in straight away without editing user_metadata in the dashboard.
    const role: UserRole = (['admin', 'technician', 'operator'].includes(meta.role))
        ? (meta.role as UserRole)
        : 'admin';
    const fallbackName = (session.user.email ?? 'Utilisateur').split('@')[0];
    const name: string = meta.full_name || fallbackName;
    const avatar = name
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map((word: string) => word[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';

    const avatarUrl: string | undefined = typeof meta.avatar_url === 'string' && meta.avatar_url.length > 0
        ? meta.avatar_url
        : undefined;
    const phone: string | undefined = typeof meta.phone === 'string' && meta.phone.length > 0
        ? meta.phone
        : undefined;

    return {
        role,
        name,
        avatar,
        avatarUrl,
        phone,
        email: session.user.email ?? '',
        supabaseId: session.user.id,
    };
}

function redirectForRole(role: UserRole, router: ReturnType<typeof useRouter>) {
    if (role === 'technician') {
        router.push('/technician/dashboard');
    } else if (role === 'operator') {
        // Operator uses Arabic locale
        try {
            sessionStorage.setItem('smartmaint-locale', 'ar');
            window.dispatchEvent(new Event('smartmaint-locale-change'));
        } catch { /* SSR guard */ }
        router.push('/operator/dashboard');
    } else {
        router.push('/dashboard');
    }
}

// ============================================
// Context
// ============================================
const AuthContext = createContext<AuthContextType>({
    user: null,
    login: async () => ({ error: null }),
    logout: () => { },
    isAuthenticated: false,
    loading: true,
});

export function useAuth() {
    return useContext(AuthContext);
}

// ============================================
// Provider
// ============================================
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // ── Bootstrap: restore session & subscribe to auth changes ──
    useEffect(() => {
        // Hydrate from an existing session (persists across page reloads).
        // If the stored refresh token is stale/invalid, Supabase throws
        // "Invalid Refresh Token" — purge it and fall back to logged-out.
        supabase.auth.getSession()
            .then(({ data: { session }, error }) => {
                if (error) {
                    supabase.auth.signOut().catch(() => { /* ignore */ });
                    setUser(null);
                } else {
                    const u = session ? sessionToUser(session) : null;
                    setUser(u);
                    try {
                        if (u) localStorage.setItem('smartmaint-last-role', u.role);
                        else localStorage.removeItem('smartmaint-last-role');
                    } catch { /* localStorage unavailable */ }
                }
                setLoading(false);
            })
            .catch(() => {
                // Network failure or bad token — treat as logged out
                supabase.auth.signOut().catch(() => { /* ignore */ });
                setUser(null);
                setLoading(false);
            });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            // A failed token refresh fires SIGNED_OUT with a null session — handled here.
            const u = session ? sessionToUser(session) : null;
            setUser(u);
            try {
                if (u) localStorage.setItem('smartmaint-last-role', u.role);
                else localStorage.removeItem('smartmaint-last-role');
            } catch { /* ignore */ }
        });

        return () => subscription.unsubscribe();
    }, []);

    // ── Guard: redirect unauthenticated users TO login,
    //          authenticated users AWAY from login,
    //          AND wrong-role users back to their own area. ──
    useEffect(() => {
        if (loading) return;
        const isLoginPage = pathname === '/';
        if (!user && !isLoginPage) {
            router.push('/');
            return;
        }
        if (user && isLoginPage) {
            redirectForRole(user.role, router);
            return;
        }
        if (!user) return;

        // Section gates — keep each role inside its own UI bucket. Without
        // this any logged-in operator could navigate to /dashboard and see
        // admin data (the Supabase RLS policies are permissive — the UI
        // routing is the active guard).
        // Use path-segment matching (not naive startsWith) — otherwise the
        // admin-only /operator-requests would match /operator and get the
        // admin bounced back to /dashboard.
        const inTechSection = pathname === '/technician' || pathname.startsWith('/technician/');
        const inOperatorSection = pathname === '/operator' || pathname.startsWith('/operator/');
        // Operator may also reach /operator-rtl (Arabic landing).
        const inOperatorRtl = pathname === '/operator-rtl' || pathname.startsWith('/operator-rtl/');
        // Cross-role screens the technician sidebar links to but that don't
        // live under /technician/*. Without this the tech gets bounced to
        // their dashboard every time they click Outillage / Base de
        // connaissances / Check-lists / LOTO / Handover. Bug flagged by
        // the admin: « le technicien ne peut pas accéder à outillage et
        // documentation ».
        const techSharedPaths = ['/knowledge', '/handover', '/checklists', '/loto', '/machines', '/projets'];
        const techAllowedShared = techSharedPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
        // Cross-role screens the operator dashboard links to but that don't
        // live under /operator/*. Without this the operator gets bounced
        // back to /operator/dashboard the moment they click the "Dfa
        // production" link — the page itself renders OperatorBatchesView
        // for operators, but the AuthContext redirect was fighting it.
        // Bug reported by the admin: "je dois spam-cliquer pour entrer".
        const operatorSharedPaths = ['/production-batches'];
        const operatorAllowedShared = operatorSharedPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
        // Note : previously we whitelisted /technician/procedure so admins
        // could open the runner from Base de connaissances. Reverted — the
        // admin should VIEW procedures (Procédures exécutées) and PRINT the
        // KB article, but NOT execute steps. Execution is a technician role.
        if (user.role === 'operator' && !inOperatorSection && !inOperatorRtl && !operatorAllowedShared) {
            redirectForRole('operator', router);
        } else if (user.role === 'technician' && !inTechSection && !techAllowedShared) {
            redirectForRole('technician', router);
        } else if (user.role === 'admin' && (inTechSection || inOperatorSection || inOperatorRtl)) {
            redirectForRole('admin', router);
        }
    }, [user, pathname, loading, router]);

    // ── Session freshness ──
    // Silently refresh the Supabase JWT every 30 min. Without this, the
    // stored access token can expire while the user is away for a few
    // hours; the next Supabase call throws → global-error boundary → the
    // "Une erreur est survenue" panel the user reported.
    useEffect(() => {
        if (!user) return;
        const interval = setInterval(() => {
            supabase.auth.refreshSession().catch(() => { /* silent */ });
        }, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [user]);

    // ── Idle auto-logout ──
    // Reads the "session_expiry" preference the admin sets in Paramètres →
    // Sécurité. After that many minutes without keyboard / mouse activity,
    // the user is signed out. Same password on return — this setting is a
    // KIOSK TIMEOUT, not a password rotation.
    useEffect(() => {
        if (!user) return;
        const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('smartmaint-idle-min')) || '';
        const minutes = parseInt(raw, 10);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        const idleMs = minutes * 60 * 1000;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const bump = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                supabase.auth.signOut().catch(() => { /* ignore */ });
                setUser(null);
                router.push('/');
            }, idleMs);
        };
        const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
        events.forEach(e => window.addEventListener(e, bump, { passive: true }));
        bump();
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            events.forEach(e => window.removeEventListener(e, bump));
        };
    }, [user, router]);

    // ── Actions ──
    const login = async (email: string, password: string): Promise<{ error: string | null }> => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            // Surface a clean French-friendly message
            const msg = error.message.toLowerCase().includes('invalid')
                ? 'Email ou mot de passe incorrect.'
                : error.message;
            return { error: msg };
        }
        // onAuthStateChange will update user state; redirect immediately
        redirectForRole(sessionToUser(data.session).role, router);
        return { error: null };
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        try { sessionStorage.removeItem('smartmaint-locale'); } catch { /* SSR guard */ }
        router.push('/');
    };

    // ── Loading splash ──
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0f1e',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ margin: '0 auto 16px', display: 'block' }}>
                        <circle cx="28" cy="28" r="26" stroke="url(#splashGrad)" strokeWidth="1.5" fill="none" opacity="0.4" />
                        <circle cx="28" cy="28" r="10" fill="url(#splashGrad)" opacity="0.25" />
                        <path d="M28 8C17 8 8 17 8 28s9 20 20 20 20-9 20-20S39 8 28 8zm2 28l-6-8h4l-2-8 6 8h-4l2 8z"
                            fill="url(#splashGrad)" opacity="0.9" />
                        <defs>
                            <linearGradient id="splashGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#06b6d4" />
                                <stop offset="1" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <p style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, letterSpacing: '0.1em' }}>
                        SMARTMAINT — L.C PROD
                    </p>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
