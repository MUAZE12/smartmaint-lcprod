'use client';

// Last-resort error boundary at the root of the App Router tree. Wraps
// every page so a thrown render error shows a styled "Réessayer" panel
// instead of Edge's bare "This page couldn't load. Reload to try again,
// or go back." message.

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // eslint-disable-next-line no-console
        console.error('[smartmaint global-error]', error);
    }, [error]);

    return (
        <html lang="fr">
            <body style={{
                margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                background: '#0f172a', color: '#f1f5f9', minHeight: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
            }}>
                <div style={{
                    maxWidth: 520, textAlign: 'center',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 18, padding: '36px 32px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: 18,
                        background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 18px', fontSize: 36, fontWeight: 800,
                    }}>!</div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Une erreur est survenue</h1>
                    <p style={{ fontSize: 14, color: '#cbd5e1', margin: '0 0 22px', lineHeight: 1.55 }}>
                        SmartMaint a rencontré un problème en chargeant cette page. La plupart du temps
                        une simple actualisation suffit.
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => reset()} style={{
                            padding: '10px 20px', borderRadius: 10,
                            background: 'linear-gradient(135deg,#3b82f6,#1e40af)', color: 'white',
                            border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        }}>Réessayer</button>
                        <a href="/dashboard" style={{
                            padding: '10px 20px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.08)', color: 'white',
                            textDecoration: 'none', fontSize: 14, fontWeight: 600,
                            border: '1px solid rgba(255,255,255,0.15)',
                        }}>Retour au dashboard</a>
                        {/* Nuclear option — clears Supabase auth in localStorage +
                            reloads. Fixes 90 % of the "après un long moment ça
                            plante" cases which are session-expired. */}
                        <button onClick={() => {
                            try {
                                Object.keys(localStorage).forEach(k => {
                                    if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k);
                                });
                            } catch { /* SSR */ }
                            window.location.href = '/';
                        }} style={{
                            padding: '10px 20px', borderRadius: 10,
                            background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                            border: '1px solid rgba(239,68,68,0.35)',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}>Se reconnecter</button>
                    </div>
                    <p style={{ marginTop: 18, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                        Cette erreur arrive souvent après une longue période sans utiliser l&apos;app. Cliquez « Se reconnecter » — vous retrouvez la même session avec votre mot de passe habituel.
                    </p>
                    {error?.digest && (
                        <div style={{ marginTop: 18, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                            Ref : {error.digest}
                        </div>
                    )}
                </div>
            </body>
        </html>
    );
}
