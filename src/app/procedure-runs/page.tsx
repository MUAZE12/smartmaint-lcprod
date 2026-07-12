'use client';

// ============================================================
// Archive of every step-by-step procedure execution.
// Admin flagged that runs were saved to `procedure_runs` in Supabase
// but had nowhere to be seen after the fact — you couldn't print a
// completed run for the audit binder. This page fixes that:
//   • list every run, newest first,
//   • click a row → open a printable detail card,
//   • the top-right "Imprimer" button prints only the selected run
//     (the rest of the page is hidden via .no-print).
// ============================================================

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import type { ProcedureRun } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Search, Printer, User, Clock, ListChecks, CheckCircle2, ClipboardList, ArrowLeft } from 'lucide-react';
import { exportElementToPdf } from '@/lib/printToPdf';

function fmtDur(s: number) {
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

function fmtDate(iso: string) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
}

export default function ProcedureRunsPage() {
    const { procedureRuns, machines } = useData();
    const [q, setQ] = useState('');
    const [openRun, setOpenRun] = useState<ProcedureRun | null>(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return procedureRuns;
        return procedureRuns.filter(r =>
            r.articleTitle.toLowerCase().includes(s)
            || r.technicianName.toLowerCase().includes(s)
            || (r.machineId && machines.find(m => m.id === r.machineId)?.code.toLowerCase().includes(s))
        );
    }, [procedureRuns, q, machines]);

    if (openRun) return <PrintableRunDetail run={openRun} onBack={() => setOpenRun(null)} machineCode={machines.find(m => m.id === openRun.machineId)?.code ?? null} />;

    return (
        <>
            <Header title="Procédures exécutées" subtitle="Chaque exécution étape par étape enregistrée pour l'audit" />
            <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

                {/* Search */}
                <div data-tour="proc-runs-search" style={{ position: 'relative', marginBottom: 18, maxWidth: 460 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)}
                        placeholder="Rechercher par procédure, technicien ou machine…"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' }} />
                </div>

                {filtered.length === 0 ? (
                    <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <ClipboardList size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 14, fontSize: 14 }}>
                            {procedureRuns.length === 0
                                ? 'Aucune procédure exécutée. Depuis la fiche machine ou la base de connaissances, cliquez « Démarrer la procédure ».'
                                : 'Aucun résultat pour cette recherche.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filtered.map(r => {
                            const machineCode = machines.find(m => m.id === r.machineId)?.code;
                            const doneCount = r.steps.filter(s => s.done).length;
                            const complete = r.completedAt !== null;
                            return (
                                <button key={r.id} data-tour="proc-runs-row" data-run-title={r.articleTitle} onClick={() => setOpenRun(r)}
                                    className="card"
                                    style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: complete ? '#dcfce7' : '#fffbeb', color: complete ? '#16a34a' : '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {complete ? <CheckCircle2 size={22} /> : <Clock size={22} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-primary)' }}>{r.articleTitle}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                            <span><User size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> {r.technicianName}</span>
                                            {machineCode && <span>· {machineCode}</span>}
                                            <span>· {fmtDate(r.startedAt)}</span>
                                            <span>· {doneCount}/{r.steps.length} étapes · {fmtDur(r.totalDurationSec)}</span>
                                        </div>
                                    </div>
                                    <Printer size={16} color="var(--text-muted)" />
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>
        </>
    );
}

// ────────────────────────────────────────────────────────────
// Printable detail view — the same layout is what lands on the PDF
// when the admin clicks « Imprimer ». Every field is a real fact
// from the run row so the archive doubles as an audit-ready sheet.
// ────────────────────────────────────────────────────────────
function PrintableRunDetail({ run, onBack, machineCode }: { run: ProcedureRun; onBack: () => void; machineCode: string | null }) {
    return (
        <>
            <Header title={run.articleTitle} subtitle="Rapport d'exécution" />
            <main style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>

                {/* Toolbar — hidden in print via .no-print */}
                <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
                    <button data-tour="proc-run-back" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                        <ArrowLeft size={14} /> Retour à la liste
                    </button>
                    <button data-tour="proc-run-print" onClick={async () => {
                        const el = document.getElementById('procedure-run-print-root');
                        await exportElementToPdf(el, {
                            filename: `smartmaint-procedure-${run.articleTitle.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.pdf`,
                        });
                    }} style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#1e40af)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>
                        <Printer size={15} /> Imprimer / Exporter en PDF
                    </button>
                </div>

                <div id="procedure-run-print-root">
                {/* Print header — appears on paper only */}
                <div className="print-only" style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '2px solid #1e293b' }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>SmartMaint — L.C PROD · Exécution de procédure</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>GMAO Agroalimentaire · Édité le {new Date().toLocaleDateString('fr-FR')}</div>
                </div>

                {/* Summary card */}
                <div className="card" style={{ padding: 18, marginBottom: 14 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>{run.articleTitle}</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Technicien</div><div style={{ marginTop: 3, fontWeight: 600 }}>{run.technicianName}</div></div>
                        {machineCode && <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Machine</div><div style={{ marginTop: 3, fontWeight: 600, fontFamily: 'monospace' }}>{machineCode}</div></div>}
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Démarré</div><div style={{ marginTop: 3, fontWeight: 600 }}>{fmtDate(run.startedAt)}</div></div>
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Terminé</div><div style={{ marginTop: 3, fontWeight: 600 }}>{run.completedAt ? fmtDate(run.completedAt) : 'En cours'}</div></div>
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Durée totale</div><div style={{ marginTop: 3, fontWeight: 800, fontSize: 15, fontFamily: 'monospace' }}>{fmtDur(run.totalDurationSec)}</div></div>
                        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Progression</div><div style={{ marginTop: 3, fontWeight: 600 }}>{run.steps.filter(s => s.done).length} / {run.steps.length} étapes</div></div>
                    </div>
                </div>

                {/* Steps */}
                <div className="card" style={{ padding: 0 }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ListChecks size={17} color="#f97316" />
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Détail des étapes</h3>
                    </div>
                    <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {run.steps.map((s, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 12, padding: 12, borderRadius: 10,
                                background: s.done ? '#f0fdf4' : 'var(--surface-hover)',
                                border: '1px solid ' + (s.done ? '#bbf7d0' : 'var(--border-light)'),
                            }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: s.done ? '#16a34a' : '#94a3b8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                                    {s.done ? <CheckCircle2 size={14} /> : i + 1}
                                </div>
                                <div style={{ flex: 1 }}>
                                    {/* Force dark text on the hardcoded light background — same
                                        contrast fix as the procedure runner (invisible-text bug). */}
                                    <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, color: s.done ? '#0f172a' : 'var(--text-primary)' }}>{s.label}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11.5, color: s.done ? '#475569' : 'var(--text-muted)' }}>
                                        <Clock size={11} /> Durée : <b>{fmtDur(s.durationSec)}</b>
                                        {s.note && <span style={{ marginInlineStart: 8, fontStyle: 'italic' }}>« {s.note} »</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Signature block — for the paper archive */}
                <div className="print-only" style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, paddingTop: 14, borderTop: '1px solid #cbd5e1' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Technicien</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>{run.technicianName}</div>
                        <div style={{ marginTop: 30, borderTop: '1px solid #64748b', paddingTop: 6, fontSize: 11, color: '#64748b' }}>Signature / Date</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Responsable maintenance</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>____________________________</div>
                        <div style={{ marginTop: 30, borderTop: '1px solid #64748b', paddingTop: 6, fontSize: 11, color: '#64748b' }}>Signature / Date</div>
                    </div>
                </div>
                </div>{/* /procedure-run-print-root */}
            </main>
        </>
    );
}
