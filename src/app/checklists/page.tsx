'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { checklistTemplatesDb, checklistRunsDb } from '@/lib/db';
import type { ChecklistTemplate, ChecklistRun, ChecklistRunResult } from '@/lib/types';
import {
    ListChecks, Plus, Edit, Trash2, Play, X, CheckCircle2, FileText, ClipboardCheck,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

const emptyTemplate = () => ({ machineId: '', title: '', items: [''] });

export default function ChecklistsPage() {
    const { showToast } = useToast();
    const { machines, checklistTemplates, checklistRuns } = useData();

    // Template create/edit
    const [tplModal, setTplModal] = useState(false);
    const [editingTpl, setEditingTpl] = useState<ChecklistTemplate | null>(null);
    const [tplForm, setTplForm] = useState(emptyTemplate());

    // Runner
    const [runner, setRunner] = useState<ChecklistTemplate | null>(null);
    const [runResults, setRunResults] = useState<ChecklistRunResult[]>([]);
    const [runMachineId, setRunMachineId] = useState('');
    const [runBy, setRunBy] = useState('');

    // View a completed run
    const [viewRun, setViewRun] = useState<ChecklistRun | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<{ kind: 'template' | 'run'; id: string; name: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const machineName = (id: string | null) => machines.find(m => m.id === id)?.code ?? null;
    const runPct = (r: ChecklistRun) =>
        r.results.length ? Math.round((r.results.filter(x => x.done).length / r.results.length) * 100) : 0;

    const avgCompletion = useMemo(() => {
        if (!checklistRuns.length) return 0;
        return Math.round(checklistRuns.reduce((s, r) => s + runPct(r), 0) / checklistRuns.length);
    }, [checklistRuns]);

    // ── Template CRUD ──
    const openCreateTpl = () => { setEditingTpl(null); setTplForm(emptyTemplate()); setTplModal(true); };

    // Demo escape hatch: the tutorial dispatches a CustomEvent so it can
    // populate the title + items array directly without going through the
    // multi-input typing path (which has subtle React-controlled-input
    // sync issues with dynamic lists like the steps array).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ title?: string; items?: string[]; machineId?: string }>).detail;
            if (!detail) return;
            setTplForm(f => ({
                ...f,
                ...(typeof detail.title === 'string' ? { title: detail.title } : {}),
                ...(typeof detail.machineId === 'string' ? { machineId: detail.machineId } : {}),
                ...(Array.isArray(detail.items) ? { items: detail.items } : {}),
            }));
        };
        window.addEventListener('smartmaint-demo-set-checklist-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-checklist-form', handler);
    }, []);
    const openEditTpl = (t: ChecklistTemplate) => {
        setEditingTpl(t);
        setTplForm({ machineId: t.machineId || '', title: t.title, items: t.items.length ? [...t.items] : [''] });
        setTplModal(true);
    };
    const saveTpl = async () => {
        const items = tplForm.items.map(i => i.trim()).filter(Boolean);
        if (!tplForm.title.trim() || items.length === 0) { showToast('Titre et au moins une étape sont obligatoires', 'error'); return; }
        setBusy(true);
        try {
            const payload = { machineId: tplForm.machineId || null, title: tplForm.title.trim(), items };
            if (editingTpl) { await checklistTemplatesDb.update(editingTpl.id, payload); showToast('Modèle mis à jour'); }
            else { await checklistTemplatesDb.create(payload); showToast('Modèle de check-list créé'); }
            setTplModal(false);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    // ── Runner ──
    const openRunner = (t: ChecklistTemplate) => {
        setRunner(t);
        setRunResults(t.items.map(label => ({ label, done: false, note: '' })));
        setRunMachineId(t.machineId || '');
        setRunBy('');
    };
    const toggleStep = (i: number) => setRunResults(prev => prev.map((r, idx) => idx === i ? { ...r, done: !r.done } : r));
    const setStepNote = (i: number, note: string) => setRunResults(prev => prev.map((r, idx) => idx === i ? { ...r, note } : r));
    const runnerPct = runResults.length ? Math.round((runResults.filter(r => r.done).length / runResults.length) * 100) : 0;

    const finishRun = async () => {
        if (!runner) return;
        if (!runMachineId) { showToast('Sélectionnez la machine concernée', 'error'); return; }
        if (!runBy.trim()) { showToast('Indiquez qui a réalisé la check-list', 'error'); return; }
        setBusy(true);
        try {
            await checklistRunsDb.create({
                templateId: runner.id,
                machineId: runMachineId,
                title: runner.title,
                results: runResults,
                completedBy: runBy.trim(),
                completedAt: new Date().toISOString(),
            });
            showToast(`✅ Check-list terminée (${runnerPct}%)`);
            setRunner(null);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            if (deleteTarget.kind === 'template') await checklistTemplatesDb.remove(deleteTarget.id);
            else await checklistRunsDb.remove(deleteTarget.id);
            showToast('Supprimé', 'error');
            setDeleteTarget(null);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const kpi = (label: string, value: string | number, color: string) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
            <div className="section-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    const recentRuns = useMemo(
        () => [...checklistRuns].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
        [checklistRuns]);

    return (
        <>
            <Header title="Check-lists d'OT" subtitle="Modèles de check-list et exécution des ordres de travail" />
            <main style={{ padding: '24px 32px' }}>
                {/* KPIs */}
                <div data-tour="cl-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {kpi('Modèles', checklistTemplates.length, 'var(--text-primary)')}
                    {kpi('Check-lists réalisées', checklistRuns.length, '#3b82f6')}
                    {kpi('Complétion moyenne', `${avgCompletion}%`, avgCompletion >= 90 ? '#16a34a' : '#d97706')}
                </div>

                {/* ── Templates ── */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>Modèles de check-list</h3>
                    <div style={{ flex: 1 }} />
                    <button onClick={openCreateTpl} data-tour="page-add" className="btn btn-primary btn-sm">
                        <Plus size={16} /> Nouveau modèle
                    </button>
                </div>

                {checklistTemplates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 28 }}>
                        <ListChecks size={38} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 10, fontSize: 14 }}>Aucun modèle. Créez une check-list réutilisable pour vos ordres de travail.</p>
                    </div>
                ) : (
                    <div data-tour="cl-templates" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16, marginBottom: 28 }}>
                        {checklistTemplates.map(t => (
                            <div key={t.id} data-tour="cl-tpl" data-cl-title={t.title} className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <FileText size={17} color="#3b82f6" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                {t.items.length} étape(s){machineName(t.machineId) ? ` · ${machineName(t.machineId)}` : ' · toutes machines'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ padding: '10px 16px', flex: 1 }}>
                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {t.items.slice(0, 4).map((it, i) => <li key={i}>{it}</li>)}
                                        {t.items.length > 4 && <li style={{ color: 'var(--text-muted)' }}>+ {t.items.length - 4} autre(s)…</li>}
                                    </ul>
                                </div>
                                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 6 }}>
                                    <button data-tour="cl-tpl-run" onClick={() => openRunner(t)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, background: '#0e7c3f', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', transition: 'background 0.15s ease' }}>
                                        <Play size={14} /> Exécuter
                                    </button>
                                    <button onClick={() => openEditTpl(t)} style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}><Edit size={15} /></button>
                                    <button data-tour="cl-tpl-delete" onClick={() => setDeleteTarget({ kind: 'template', id: t.id, name: t.title })} style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={15} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Completed runs ── */}
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Check-lists réalisées</h3>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {recentRuns.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Aucune check-list réalisée. Cliquez « Exécuter » sur un modèle.</div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Date</th><th>Check-list</th><th>Machine</th><th>Réalisée par</th><th>Complétion</th><th>Actions</th>
                                </tr></thead>
                                <tbody>
                                    {recentRuns.map(r => {
                                        const pct = runPct(r);
                                        const color = pct === 100 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
                                        return (
                                            <tr key={r.id}>
                                                <td style={{ fontSize: 13 }}>{(r.completedAt || '').slice(0, 10)}</td>
                                                <td style={{ fontWeight: 600 }}>{r.title}</td>
                                                <td>{machineName(r.machineId) || '—'}</td>
                                                <td style={{ fontSize: 13 }}>{r.completedBy}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ width: 70, height: 7, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                                            <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button onClick={() => setViewRun(r)} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer' }}>Voir</button>
                                                        <button onClick={() => setDeleteTarget({ kind: 'run', id: r.id, name: r.title })} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Template create/edit modal ── */}
                <Modal isOpen={tplModal} onClose={() => setTplModal(false)} title={editingTpl ? 'Modifier le modèle' : 'Nouveau modèle de check-list'} size="md"
                    footer={<>
                        <button onClick={() => setTplModal(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button data-tour="cl-form-save" onClick={saveTpl} disabled={busy} className="btn btn-primary btn-sm" style={{ opacity: busy ? 0.7 : 1 }}>Enregistrer</button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div><label style={lS}>Titre de la check-list *</label>
                            <input data-tour="cl-form-title" style={iS} placeholder="Ex: Démarrage remplisseuse — contrôle pré-production" value={tplForm.title} onChange={e => setTplForm(f => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div><label style={lS}>Machine concernée</label>
                            <select style={iS} value={tplForm.machineId} onChange={e => setTplForm(f => ({ ...f, machineId: e.target.value }))}>
                                <option value="">Toutes machines</option>
                                {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={lS}>Étapes</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {tplForm.items.map((it, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 20 }}>{i + 1}.</span>
                                        <input data-tour="cl-form-step" data-step-index={i} style={iS} placeholder="Décrire l'étape de contrôle" value={it}
                                            onChange={e => setTplForm(f => ({ ...f, items: f.items.map((x, idx) => idx === i ? e.target.value : x) }))} />
                                        <button onClick={() => setTplForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }))}
                                            style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><X size={15} /></button>
                                    </div>
                                ))}
                                <button data-tour="cl-form-add-step" onClick={() => setTplForm(f => ({ ...f, items: [...f.items, ''] }))}
                                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px dashed var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    <Plus size={14} /> Ajouter une étape
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* ── Runner modal ── */}
                <Modal isOpen={!!runner} onClose={() => setRunner(null)} title={runner ? `Exécuter — ${runner.title}` : ''} size="md"
                    footer={<>
                        <button data-tour="cl-runner-cancel" onClick={() => setRunner(null)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button onClick={finishRun} disabled={busy} className="btn btn-sm" style={{ background: '#0e7c3f', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>Terminer la check-list</button>
                    </>}>
                    {runner && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={lS}>Machine *</label>
                                    <select style={iS} value={runMachineId} onChange={e => setRunMachineId(e.target.value)}>
                                        <option value="">— Sélectionner —</option>
                                        {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                                    </select>
                                </div>
                                <div><label style={lS}>Réalisée par *</label>
                                    <input style={iS} placeholder="Ex: Ahmed El Amrani" value={runBy} onChange={e => setRunBy(e.target.value)} />
                                </div>
                            </div>

                            {/* Progress */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, height: 9, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                    <div style={{ width: `${runnerPct}%`, height: '100%', background: runnerPct === 100 ? '#16a34a' : '#3b82f6', transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 800, color: runnerPct === 100 ? '#16a34a' : '#3b82f6' }}>{runnerPct}%</span>
                            </div>

                            {/* Steps */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {runResults.map((r, i) => (
                                    <div key={i} data-tour="cl-runner-step-row" data-step-index={i} style={{ borderRadius: 10, border: '1px solid var(--border)', background: r.done ? '#f0fdf4' : 'var(--surface)', padding: '10px 12px' }}>
                                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                                            <input data-tour="cl-runner-step" data-step-index={i} type="checkbox" checked={r.done} onChange={() => toggleStep(i)} style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: '#16a34a' }} />
                                            <span style={{ fontSize: 13.5, fontWeight: 500, textDecoration: r.done ? 'line-through' : 'none', color: r.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{r.label}</span>
                                        </label>
                                        <input style={{ ...iS, marginTop: 8, fontSize: 12.5, padding: '7px 10px' }} placeholder="Observation (facultatif)" value={r.note} onChange={e => setStepNote(i, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Modal>

                {/* ── View completed run ── */}
                <Modal isOpen={!!viewRun} onClose={() => setViewRun(null)} title={viewRun ? viewRun.title : ''} size="md"
                    footer={<button onClick={() => setViewRun(null)} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>Fermer</button>}>
                    {viewRun && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                {machineName(viewRun.machineId) || '—'} · réalisée par <b>{viewRun.completedBy}</b> le {(viewRun.completedAt || '').slice(0, 10)}
                            </div>
                            {viewRun.results.map((r, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                                    {r.done
                                        ? <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />
                                        : <X size={16} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13.5 }}>{r.label}</div>
                                        {r.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>↳ {r.note}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>

                {/* ── Delete confirmation ── */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmer la suppression" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="cl-delete-confirm" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <ClipboardCheck size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>
                            Supprimer {deleteTarget?.kind === 'template' ? 'le modèle' : 'la check-list'} <b>{deleteTarget?.name}</b> ?
                        </p>
                    </div>
                </Modal>
            </main>
        </>
    );
}
