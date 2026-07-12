'use client';

// ============================================================
// Login — refined SaaS aesthetic. Centered card on a subtle
// canvas (light background + one soft accent). Real typography
// hierarchy, generous whitespace, subtle micro-interactions.
// No glassmorphism, no gradient text, no rainbow orbs, and not
// the corporate SAP look either.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import {
    AlertCircle, ArrowRight, Loader2, Eye, EyeOff, Cpu, CircleCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const [focusEmail, setFocusEmail] = useState(false);
    const [focusPwd, setFocusPwd] = useState(false);

    useEffect(() => { emailRef.current?.focus(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        setSubmitting(true);
        setError(null);
        const { error: authError } = await login(email.trim(), password);
        if (authError) {
            setError(authError);
            setSubmitting(false);
        }
    };

    return (
        <div className="sm-login">
            {/* Subtle canvas backdrop — one accent, no orbs */}
            <div className="sm-login__canvas" aria-hidden />

            <div className="sm-login__shell">
                {/* Brand strip — small, restrained */}
                <div className="sm-login__brand">
                    <div className="sm-login__logo" aria-hidden>
                        <Cpu size={16} strokeWidth={2.4} />
                    </div>
                    <div className="sm-login__brand-text">
                        <div className="sm-login__brand-name">SmartMaint</div>
                        <div className="sm-login__brand-tag">L.C PROD · Huiles alimentaires</div>
                    </div>
                </div>

                <div className="sm-login__card">
                    <div className="sm-login__heading">
                        <h1>Bon retour.</h1>
                        <p>Connectez-vous à votre poste de maintenance.</p>
                    </div>

                    {error && (
                        <div className="sm-login__error" role="alert">
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="sm-login__form" noValidate>
                        <div className={`sm-login__field ${focusEmail ? 'is-focused' : ''} ${email ? 'is-filled' : ''}`}>
                            <label htmlFor="email">Adresse e-mail</label>
                            <input
                                ref={emailRef}
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                                onFocus={() => setFocusEmail(true)}
                                onBlur={() => setFocusEmail(false)}
                                placeholder="prenom.nom@lcprod.ma"
                            />
                        </div>

                        <div className={`sm-login__field sm-login__field--pwd ${focusPwd ? 'is-focused' : ''} ${password ? 'is-filled' : ''}`}>
                            <label htmlFor="password">Mot de passe</label>
                            <input
                                id="password"
                                type={showPwd ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                                onFocus={() => setFocusPwd(true)}
                                onBlur={() => setFocusPwd(false)}
                                placeholder="•••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(v => !v)}
                                aria-label={showPwd ? 'Masquer' : 'Afficher'}
                                className="sm-login__eye"
                                tabIndex={-1}
                            >
                                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !email || !password}
                            className="sm-login__submit"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={16} className="sm-login__spin" />
                                    <span>Connexion…</span>
                                </>
                            ) : (
                                <>
                                    <span>Continuer</span>
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="sm-login__meta">
                        <span className="sm-login__meta-item">
                            <CircleCheck size={12} strokeWidth={2.5} /> Chiffrement TLS 1.3
                        </span>
                        <span className="sm-login__meta-dot" aria-hidden>·</span>
                        <span className="sm-login__meta-item">Supabase Postgres</span>
                    </div>
                </div>

                <div className="sm-login__foot">
                    <span>© 2026 L.C PROD · Fès, Maroc</span>
                    <span className="sm-login__foot-sep" aria-hidden>·</span>
                    <span className="sm-login__version">v2026.07</span>
                </div>
            </div>

            <style jsx>{`
                :global(html), :global(body) {
                    background: #fafbfc;
                    min-height: 100%;
                }
                @media (prefers-color-scheme: dark) {
                    :global(html), :global(body) { background: #0a0d12; }
                }
                .sm-login {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 32px 20px;
                    background: #fafbfc;
                    font-family: var(--font-geist-sans), -apple-system, 'Segoe UI', system-ui, sans-serif;
                    color: #0b0e12;
                    -webkit-font-smoothing: antialiased;
                    overflow-y: auto;
                }

                /* Backdrop — one soft radial accent, that's it */
                .sm-login__canvas {
                    position: absolute; inset: 0; pointer-events: none;
                    background:
                        radial-gradient(1000px 500px at 50% -10%, rgba(11, 58, 134, 0.05) 0%, transparent 60%),
                        radial-gradient(600px 400px at 100% 100%, rgba(245, 158, 11, 0.035) 0%, transparent 60%);
                }
                /* faint grid — only visible at higher DPRs, adds material texture */
                .sm-login__canvas::after {
                    content: '';
                    position: absolute; inset: 0;
                    background-image: linear-gradient(rgba(11,14,18,0.025) 1px, transparent 1px),
                                       linear-gradient(90deg, rgba(11,14,18,0.025) 1px, transparent 1px);
                    background-size: 40px 40px;
                    mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
                }

                .sm-login__shell {
                    position: relative;
                    width: 100%;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 24px;
                }

                /* Brand row above the card */
                .sm-login__brand {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                }
                .sm-login__logo {
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    background: #0b0e12;
                    color: #fff;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .sm-login__brand-text {
                    display: flex; flex-direction: column; line-height: 1.15;
                }
                .sm-login__brand-name {
                    font-size: 14px;
                    font-weight: 650;
                    letter-spacing: -0.01em;
                    color: #0b0e12;
                }
                .sm-login__brand-tag {
                    font-size: 11.5px;
                    color: #6b7280;
                    letter-spacing: 0.01em;
                }

                /* The card itself — tight radius, one soft shadow, no glass */
                .sm-login__card {
                    width: 100%;
                    background: #fff;
                    border: 1px solid #e6e8ee;
                    border-radius: 14px;
                    padding: 32px 32px 28px;
                    box-shadow:
                        0 1px 0 rgba(11,14,18,0.02),
                        0 12px 40px -12px rgba(11,14,18,0.10);
                }

                .sm-login__heading { margin-bottom: 24px; }
                .sm-login__heading h1 {
                    font-size: 22px;
                    font-weight: 650;
                    letter-spacing: -0.015em;
                    margin: 0 0 6px;
                    color: #0b0e12;
                }
                .sm-login__heading p {
                    font-size: 14px;
                    color: #5a6472;
                    margin: 0;
                    line-height: 1.5;
                }

                .sm-login__error {
                    display: flex; align-items: center; gap: 8px;
                    padding: 10px 12px;
                    background: #fff5f5;
                    border: 1px solid #fecaca;
                    color: #b91c1c;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 18px;
                    line-height: 1.4;
                }

                .sm-login__form {
                    display: flex; flex-direction: column; gap: 14px;
                }

                /* Floating-label-ish field: label sits above input, shifts weight on focus */
                .sm-login__field {
                    position: relative;
                    background: #fff;
                    border: 1px solid #e0e3ea;
                    border-radius: 10px;
                    padding: 10px 14px 8px;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
                }
                .sm-login__field.is-focused {
                    border-color: #0b3a86;
                    box-shadow: 0 0 0 3px rgba(11, 58, 134, 0.12);
                }
                .sm-login__field label {
                    display: block;
                    font-size: 11.5px;
                    font-weight: 600;
                    color: #6b7280;
                    margin-bottom: 2px;
                    letter-spacing: 0.01em;
                    transition: color 0.15s ease;
                }
                .sm-login__field.is-focused label { color: #0b3a86; }
                .sm-login__field input {
                    width: 100%;
                    border: none;
                    outline: none;
                    padding: 0;
                    background: transparent;
                    font-size: 15px;
                    color: #0b0e12;
                    font-family: inherit;
                    line-height: 1.35;
                }
                .sm-login__field input::placeholder {
                    color: #b8bec9;
                    font-weight: 400;
                }

                .sm-login__field--pwd input { padding-right: 32px; }
                .sm-login__eye {
                    position: absolute;
                    right: 8px; bottom: 6px;
                    width: 30px; height: 30px;
                    display: inline-flex; align-items: center; justify-content: center;
                    background: transparent;
                    border: none;
                    color: #8a94a6;
                    cursor: pointer;
                    border-radius: 6px;
                    transition: color 0.12s ease, background 0.12s ease;
                }
                .sm-login__eye:hover { color: #0b0e12; background: #f2f4f8; }

                .sm-login__submit {
                    margin-top: 6px;
                    width: 100%;
                    padding: 12px 18px;
                    background: #0b0e12;
                    color: #fff;
                    border: none;
                    border-radius: 10px;
                    font-size: 14.5px;
                    font-weight: 600;
                    letter-spacing: 0.005em;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-family: inherit;
                    transition: background 0.15s ease, transform 0.05s ease, opacity 0.15s ease;
                    box-shadow: 0 1px 0 rgba(11,14,18,0.06), inset 0 1px 0 rgba(255,255,255,0.06);
                }
                .sm-login__submit:hover:not(:disabled) { background: #1a1e26; }
                .sm-login__submit:active:not(:disabled) { transform: translateY(1px); }
                .sm-login__submit:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .sm-login__spin { animation: sm-spin 0.8s linear infinite; }
                @keyframes sm-spin { to { transform: rotate(360deg); } }

                .sm-login__meta {
                    margin-top: 22px;
                    padding-top: 20px;
                    border-top: 1px solid #eef0f4;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: 12px;
                    color: #6b7280;
                    line-height: 1;
                }
                .sm-login__meta-item {
                    display: inline-flex; align-items: center; gap: 5px;
                    color: #5a6472;
                }
                .sm-login__meta-item svg { color: #22a05c; }
                .sm-login__meta-dot { color: #cfd4de; }

                .sm-login__foot {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: #94a1b3;
                }
                .sm-login__foot-sep { color: #d0d5dd; }
                .sm-login__version {
                    font-family: 'JetBrains Mono', ui-monospace, 'Courier New', monospace;
                    font-size: 11.5px;
                    color: #a4adbd;
                }

                @media (max-width: 480px) {
                    .sm-login { padding: 20px 14px; align-items: flex-start; padding-top: 40px; }
                    .sm-login__card { padding: 24px 22px 22px; border-radius: 12px; }
                    .sm-login__heading h1 { font-size: 20px; }
                }

                @media (prefers-color-scheme: dark) {
                    .sm-login { background: #0a0d12; color: #e6e9ef; }
                    .sm-login__canvas {
                        background:
                            radial-gradient(1000px 500px at 50% -10%, rgba(63, 109, 193, 0.10) 0%, transparent 60%),
                            radial-gradient(600px 400px at 100% 100%, rgba(245, 158, 11, 0.05) 0%, transparent 60%);
                    }
                    .sm-login__canvas::after {
                        background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                                           linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                    }
                    .sm-login__logo { background: #fff; color: #0a0d12; }
                    .sm-login__brand-name { color: #f4f6fb; }
                    .sm-login__brand-tag { color: #8a94a6; }
                    .sm-login__card {
                        background: #12161e;
                        border-color: #232935;
                        box-shadow: 0 1px 0 rgba(0,0,0,0.15), 0 12px 40px -12px rgba(0,0,0,0.45);
                    }
                    .sm-login__heading h1 { color: #f4f6fb; }
                    .sm-login__heading p { color: #8a94a6; }
                    .sm-login__field {
                        background: #171c26;
                        border-color: #262c38;
                    }
                    .sm-login__field.is-focused {
                        border-color: #5786d6;
                        box-shadow: 0 0 0 3px rgba(87, 134, 214, 0.18);
                    }
                    .sm-login__field label { color: #8a94a6; }
                    .sm-login__field.is-focused label { color: #7ea3e0; }
                    .sm-login__field input { color: #f4f6fb; }
                    .sm-login__field input::placeholder { color: #4b5262; }
                    .sm-login__eye:hover { background: #1e242f; color: #f4f6fb; }
                    .sm-login__submit { background: #f4f6fb; color: #0a0d12; }
                    .sm-login__submit:hover:not(:disabled) { background: #ffffff; }
                    .sm-login__error { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.25); color: #fca5a5; }
                    .sm-login__meta { border-color: #232935; color: #8a94a6; }
                    .sm-login__meta-item { color: #a4adbd; }
                    .sm-login__meta-dot, .sm-login__foot-sep { color: #383e4a; }
                    .sm-login__foot { color: #6b7280; }
                    .sm-login__version { color: #6b7280; }
                }
            `}</style>
        </div>
    );
}
