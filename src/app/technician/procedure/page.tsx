'use client';

// ============================================================
// T6 — Procedure runner
// Reads a knowledge-base article, parses it into checklist steps,
// then guides the technician one step at a time with per-step
// timers. The completed run is persisted in `procedure_runs`.
// ============================================================

import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { procedureRunsDb } from '@/lib/db';
import { useToast } from '@/components/ui/Toast';
import type { ProcedureStep } from '@/lib/types';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Save, ListChecks, Clock } from 'lucide-react';

/** Convert an article body into a flat list of executable steps.
 *  Heuristic: split on newlines, drop blank lines and pure headers
 *  (e.g. "**Étape 1**"), keep bullet items and numbered steps. */
function parseSteps(content: string): string[] {
    return content
        .split(/\n+/)
        .map(l => l.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(l => l.length > 0 && !(l.startsWith('**') && l.endsWith('**')));
}

function fmt(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const r = (s % 60).toString().padStart(2, '0');
    return `${m}:${r}`;
}

function RunnerInner() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const sp = useSearchParams();
    const articleId = sp.get('id');
    const interventionId = sp.get('intervention');
    const machineIdParam = sp.get('machine');

    const { knowledgeArticles, loading } = useData();
    const article = articleId ? knowledgeArticles.find(a => a.id === articleId) : null;

    const parsedSteps = useMemo(
        () => (article ? parseSteps(article.content) : []),
        [article]);

    const [steps, setSteps] = useState<ProcedureStep[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [currentStartedAt, setCurrentStartedAt] = useState<number | null>(null);
    const [tick, setTick] = useState(0);
    const [startedAt] = useState(() => new Date().toISOString());
    const [submitting, setSubmitting] = useState(false);

    // Initialize step list once the article resolves.
    useEffect(() => {
        if (parsedSteps.length && steps.length === 0) {
            setSteps(parsedSteps.map(label => ({ label, done: false, durationSec: 0, note: '' })));
            setCurrentStartedAt(Date.now());
        }
    }, [parsedSteps, steps.length]);

    // Per-second re-render while a step is running.
    useEffect(() => {
        if (currentStartedAt === null) return;
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [currentStartedAt]);
    void tick;

    // Race guard: a brand-new article just created in /knowledge can take a
    // moment to land via Supabase realtime. Without this the runner showed
    // "Article introuvable" the instant you clicked « Démarrer la procédure ».
    if (loading || (!article && knowledgeArticles.length === 0)) {
        return (
            <>
                <Header title="Procédure" subtitle="Chargement…" />
                <main style={{ padding: 40, color: 'var(--text-muted)' }}>
                    <p>Chargement de la procédure…</p>
                </main>
            </>
        );
    }
    if (!article) {
        return (
            <>
                <Header title="Procédure" subtitle="Article introuvable" />
                <main style={{ padding: 40 }}>
                    <button onClick={() => router.back()} className="btn btn-secondary"><ArrowLeft size={14} /> Retour</button>
                </main>
            </>
        );
    }

    const currentElapsed = currentStartedAt ? Math.floor((Date.now() - currentStartedAt) / 1000) : 0;
    const totalDoneSec = steps.reduce((s, x) => s + x.durationSec, 0) + currentElapsed;
    const doneCount = steps.filter(s => s.done).length;
    const allDone = steps.length > 0 && doneCount === steps.length;

    const advance = () => {
        const elapsed = currentStartedAt ? Math.floor((Date.now() - currentStartedAt) / 1000) : 0;
        setSteps(prev => prev.map((s, i) =>
            i === currentIdx ? { ...s, done: true, durationSec: s.durationSec + elapsed } : s));
        if (currentIdx < steps.length - 1) {
            setCurrentIdx(i => i + 1);
            setCurrentStartedAt(Date.now());
        } else {
            setCurrentStartedAt(null);
        }
    };

    const noteCurrent = (txt: string) =>
        setSteps(prev => prev.map((s, i) => i === currentIdx ? { ...s, note: txt } : s));

    const finish = async () => {
        setSubmitting(true);
        try {
            await procedureRunsDb.create({
                articleId: article.id,
                articleTitle: article.title,
                machineId: machineIdParam ?? null,
                interventionId: interventionId ?? null,
                technicianName: user?.name ?? 'Technicien',
                steps,
                startedAt,
                completedAt: new Date().toISOString(),
                totalDurationSec: totalDoneSec,
            });
            showToast('✅ Procédure enregistrée');
            router.push('/knowledge');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setSubmitting(false); }
    };

    return (
        <>
            <Header title={article.title} subtitle="Exécution guidée de la procédure" />
            <main style={{ padding: '24px 32px', maxWidth: 760, margin: '0 auto' }} className="animate-fade-in">
                <button onClick={() => router.back()} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--primary)',
                    background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit',
                }}><ArrowLeft size={14} /> Retour</button>

                {/* Progress + global timer */}
                <div className="card" style={{ padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progression</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <ListChecks size={20} color="#f97316" />
                            <span style={{ fontSize: 18, fontWeight: 800 }}>{doneCount} / {steps.length}</span>
                            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>étapes</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 100, background: 'var(--surface-hover)', marginTop: 8, overflow: 'hidden' }}>
                            <div style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%`, height: '100%', background: '#b45309', transition: 'width 0.3s' }} />
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Durée totale</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800 }}>{fmt(totalDoneSec)}</div>
                    </div>
                </div>

                {/* Steps list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {steps.map((s, i) => {
                        const isCurrent = i === currentIdx && !s.done && !allDone;
                        // Done + current cards use hard-coded light backgrounds
                        // (#f0fdf4 / #fff7ed) — so we must also hard-code the
                        // text color, otherwise dark mode paints text in near-
                        // white on near-white = invisible. Bug flagged by admin
                        // on procedure runner screenshot.
                        const forcedFg = s.done || isCurrent ? '#0f172a' : 'var(--text-primary)';
                        const forcedMuted = s.done || isCurrent ? '#475569' : 'var(--text-muted)';
                        return (
                            <div key={i} className="card" style={{
                                padding: 14,
                                border: '1px solid ' + (isCurrent ? '#f97316' : 'var(--border)'),
                                background: s.done ? '#f0fdf4' : isCurrent ? '#fff7ed' : 'var(--surface)',
                                opacity: !isCurrent && !s.done ? 0.6 : 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                        background: s.done ? '#16a34a' : isCurrent ? '#f97316' : 'var(--surface-hover)',
                                        color: s.done || isCurrent ? 'white' : 'var(--text-muted)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: 13,
                                    }}>{s.done ? <CheckCircle2 size={16} /> : i + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, color: forcedFg }}>{s.label}</div>
                                        {(s.done || isCurrent) && (
                                            <div style={{ fontSize: 11.5, color: forcedMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Clock size={11} />
                                                {s.done ? fmt(s.durationSec) : fmt(currentElapsed)}
                                            </div>
                                        )}
                                        {isCurrent && (
                                            <>
                                                <input
                                                    style={{
                                                        marginTop: 8, fontSize: 13,
                                                        // Fixed light background above forces us to hard-code
                                                        // the input surface too, otherwise dark-mode --surface
                                                        // paints a dark box inside the light card.
                                                        width: '100%', padding: '9px 12px', borderRadius: 9,
                                                        border: '1px solid #cbd5e1', background: 'white',
                                                        color: '#0f172a', fontFamily: 'inherit', outline: 'none',
                                                    }}
                                                    placeholder="Note (optionnel)"
                                                    value={s.note} onChange={e => noteCurrent(e.target.value)} />
                                                <button data-tour="procedure-step-done" onClick={advance} style={{
                                                    marginTop: 10, padding: '9px 16px', borderRadius: 10, border: 'none',
                                                    background: '#0e7c3f', color: 'white',
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                }}><CheckCircle2 size={15} /> Étape terminée</button>
                                            </>
                                        )}
                                        {s.done && s.note && (
                                            <div style={{ fontSize: 12, color: '#334155', marginTop: 6, fontStyle: 'italic' }}>« {s.note} »</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Finish */}
                {allDone && (
                    <button onClick={finish} disabled={submitting} style={{
                        marginTop: 22, width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                        background: '#b45309', color: 'white',
                        fontWeight: 700, fontSize: 15, cursor: submitting ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
                        opacity: submitting ? 0.7 : 1,
                    }}>
                        <Save size={18} /> {submitting ? 'Enregistrement…' : 'Enregistrer la procédure'}
                    </button>
                )}
            </main>
        </>
    );
}

export default function ProcedureRunner() {
    return (
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Chargement...</div>}>
            <RunnerInner />
        </Suspense>
    );
}
