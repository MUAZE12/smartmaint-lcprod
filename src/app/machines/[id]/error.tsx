'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

export default function MachineDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // Log so the error appears in browser devtools / Vercel logs.
        // eslint-disable-next-line no-console
        console.error('[machine detail] render error', error);
    }, [error]);

    return (
        <main style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', padding: 32, textAlign: 'center',
        }}>
            <div style={{ maxWidth: 480 }}>
                <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    background: '#fef2f2', color: '#ef4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 18px',
                }}>
                    <AlertTriangle size={28} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Fiche machine indisponible</h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.55 }}>
                    Une erreur s&apos;est produite en chargeant cette fiche. Souvent c&apos;est un fichier mis à
                    jour côté serveur que votre navigateur n&apos;a pas encore. Réessayez ou retournez à la liste.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={() => reset()} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 18px', borderRadius: 10,
                        background: 'linear-gradient(135deg,#3b82f6,#1e40af)', color: 'white',
                        border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}><RefreshCw size={15} /> Réessayer</button>
                    <Link href="/machines" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 18px', borderRadius: 10,
                        background: 'var(--surface-hover)', color: 'var(--text-primary)',
                        textDecoration: 'none', fontSize: 14, fontWeight: 600,
                        border: '1px solid var(--border)',
                    }}><ArrowLeft size={15} /> Retour aux machines</Link>
                </div>
                {error?.digest && (
                    <div style={{ marginTop: 18, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        Référence : {error.digest}
                    </div>
                )}
            </div>
        </main>
    );
}
