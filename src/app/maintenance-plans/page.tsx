'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { maintenancePlansDb, interventionsDb } from '@/lib/db';
import type { MaintenancePlan, InterventionType } from '@/lib/types';
import { CalendarClock, Plus, Edit, Trash2, Zap, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';

const FREQ_PRESETS = [
    { days: 7, label: 'Hebdomadaire' },
    { days: 30, label: 'Mensuel' },
    { days: 90, label: 'Trimestriel' },
    { days: 180, label: 'Semestriel' },
    { days: 365, label: 'Annuel' },
];

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

const todayMidnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return toISODate(d); };

/** overdue | soon (≤7j) | ok */
function planStatus(p: MaintenancePlan): 'overdue' | 'soon' | 'ok' {
    if (!p.nextDueDate) return 'ok';
    const due = new Date(p.nextDueDate); due.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - todayMidnight().getTime()) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff <= 7) return 'soon';
    return 'ok';
}
const statusCfg = {
    overdue: { label: 'En retard', color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle },
    soon: { label: 'Échéance proche', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
    ok: { label: 'À jour', color: '#22c55e', bg: '#f0fdf4', icon: CheckCircle2 },
};

const emptyForm = () => ({
    machineId: '', title: '', interventionType: 'préventive' as InterventionType,
    frequencyDays: 30, nextDueDate: addDays(toISODate(new Date()), 30), notes: '', active: true,
});

export default function MaintenancePlansPage() {
    const { showToast } = useToast();
    const { maintenancePlans, machines } = useData();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<MaintenancePlan | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<MaintenancePlan | null>(null);
    const [form, setForm] = useState(emptyForm());
    const [busy, setBusy] = useState(false);

    const sorted = useMemo(() => [...maintenancePlans].sort((a, b) =>
        (a.nextDueDate || '9999').localeCompare(b.nextDueDate || '9999')), [maintenancePlans]);
    const dueCount = maintenancePlans.filter(p => p.active && planStatus(p) !== 'ok').length;
    const overdueCount = maintenancePlans.filter(p => p.active && planStatus(p) === 'overdue').length;

    const openCreate = (presetMachineId?: string) => {
        setEditing(null);
        setForm({ ...emptyForm(), machineId: presetMachineId ?? '' });
        setModalOpen(true);
    };

    // Deep-link from /predictif (?machineId=…&autoopen=1) opens the create
    // form pre-selected with the machine flagged by the predictive engine.
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get('autoopen') !== '1') return;
        const mid = searchParams.get('machineId');
        if (mid) openCreate(mid);
    }, [searchParams]);
    const openEdit = (p: MaintenancePlan) => {
        setEditing(p);
        setForm({
            machineId: p.machineId, title: p.title, interventionType: p.interventionType,
            frequencyDays: p.frequencyDays, nextDueDate: p.nextDueDate || toISODate(new Date()),
            notes: p.notes || '', active: p.active,
        });
        setModalOpen(true);
    };

    const save = async () => {
        if (!form.machineId || !form.title.trim()) { showToast('Machine et intitulé sont obligatoires', 'error'); return; }
        setBusy(true);
        try {
            if (editing) { await maintenancePlansDb.update(editing.id, form); showToast('Plan mis à jour'); }
            else { await maintenancePlansDb.create({ ...form, lastDoneDate: null }); showToast('Plan préventif créé'); }
            setModalOpen(false);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try { await maintenancePlansDb.remove(deleteTarget.id); showToast('Plan supprimé', 'error'); setDeleteTarget(null); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    // Generate the planned intervention from a due plan, then roll the plan forward.
    const generate = async (p: MaintenancePlan) => {
        setBusy(true);
        try {
            const startDate = p.nextDueDate ? `${p.nextDueDate}T08:00:00Z` : new Date().toISOString();
            await interventionsDb.create({
                machineId: p.machineId,
                technicianId: null,
                interventionType: p.interventionType,
                description: `[Préventif] ${p.title}`,
                probableCause: 'Plan de maintenance préventive',
                actionDone: '',
                startDate, endDate: null,
                downtimeHours: 0, laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0,
                status: 'planifiée',
            });
            const today = toISODate(new Date());
            await maintenancePlansDb.update(p.id, {
                lastDoneDate: today,
                nextDueDate: addDays(today, p.frequencyDays),
            });
            showToast('✅ Intervention préventive générée et planifiée');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const generateAllDue = async () => {
        const due = maintenancePlans.filter(p => p.active && planStatus(p) !== 'ok');
        for (const p of due) await generate(p);
        if (due.length) showToast(`✅ ${due.length} intervention(s) préventive(s) générée(s)`);
    };

    const kpi = (label: string, value: number | string, color: string) => (
        <div className="kpi-card" style={{ flex: 1 }}>
            <div className="section-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    return (
        <>
            <Header title="Plans de maintenance préventive" subtitle="Planification récurrente des entretiens machines" />
            <main style={{ padding: '24px 32px' }}>
                {/* KPIs */}
                <div data-tour="plans-kpis" style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                    {kpi('Plans actifs', maintenancePlans.filter(p => p.active).length, 'var(--text-primary)')}
                    {kpi('À générer', dueCount, dueCount ? '#f59e0b' : '#22c55e')}
                    {kpi('En retard', overdueCount, overdueCount ? '#ef4444' : '#22c55e')}
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }} />
                    {dueCount > 0 && (
                        <button onClick={generateAllDue} disabled={busy} className="btn btn-sm" style={{ background: '#b45309', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>
                            <Zap size={17} /> Générer les {dueCount} échéances
                        </button>
                    )}
                    <button onClick={() => openCreate()} data-tour="page-add" className="btn btn-primary btn-sm">
                        <Plus size={18} /> Nouveau plan
                    </button>
                </div>

                {/* Plans table */}
                <div data-tour="plans-table">
                {maintenancePlans.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <CalendarClock size={40} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucun plan préventif. Créez-en un pour automatiser les entretiens récurrents.</p>
                    </div>
                ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Machine</th><th>Intitulé</th><th>Fréquence</th><th>Dernier</th><th>Prochaine échéance</th><th>Statut</th><th>Actions</th>
                                </tr></thead>
                                <tbody>
                                    {sorted.map(p => {
                                        const machine = machines.find(m => m.id === p.machineId);
                                        const s = p.active ? planStatus(p) : 'ok';
                                        const cfg = statusCfg[s];
                                        const StatusIcon = cfg.icon;
                                        const presetLabel = FREQ_PRESETS.find(f => f.days === p.frequencyDays)?.label;
                                        return (
                                            <tr key={p.id} data-tour="plan-row" data-plan-title={p.title} style={{ opacity: p.active ? 1 : 0.5 }}>
                                                <td><span style={{ fontWeight: 600 }}>{machine?.code || '—'}</span></td>
                                                <td style={{ maxWidth: 260 }}>{p.title}</td>
                                                <td style={{ fontSize: 13 }}>{presetLabel || `Tous les ${p.frequencyDays} j`}</td>
                                                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.lastDoneDate || '—'}</td>
                                                <td style={{ fontSize: 13, fontWeight: 600 }}>{p.nextDueDate || '—'}</td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                                                        <StatusIcon size={12} /> {p.active ? cfg.label : 'Inactif'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                        {p.active && s !== 'ok' && (
                                                            <button data-tour="plan-generate" onClick={() => generate(p)} disabled={busy} title="Générer l'intervention" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--accent-green-light)', color: 'var(--accent-green)', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
                                                                <Zap size={12} /> Générer
                                                            </button>
                                                        )}
                                                        <button data-tour="plan-edit" onClick={() => openEdit(p)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}><Edit size={14} /></button>
                                                        <button data-tour="plan-delete" onClick={() => setDeleteTarget(p)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                </div>

                {/* Create / edit modal */}
                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le plan préventif' : 'Nouveau plan préventif'} size="md"
                    footer={<>
                        <button onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button data-tour="plan-form-save" onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ opacity: busy ? 0.7 : 1 }}>Enregistrer</button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div><label style={lS}>Machine *</label>
                            <select data-tour="plan-form-machine" style={iS} value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                                <option value="">— Sélectionner —</option>
                                {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                            </select>
                        </div>
                        <div><label style={lS}>Intitulé de l&apos;entretien *</label>
                            <input data-tour="plan-form-title" style={iS} placeholder="Ex: Graissage roulements & contrôle tension courroie" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Type</label>
                                <select style={iS} value={form.interventionType} onChange={e => setForm(f => ({ ...f, interventionType: e.target.value as InterventionType }))}>
                                    <option value="préventive">Préventive</option>
                                    <option value="conditionnelle">Conditionnelle</option>
                                    <option value="améliorative">Améliorative</option>
                                </select>
                            </div>
                            <div><label style={lS}>Prochaine échéance</label>
                                <input data-tour="plan-form-due" type="date" style={iS} value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                            </div>
                        </div>
                        <div><label style={lS}>Fréquence</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {FREQ_PRESETS.map(fp => (
                                    <button key={fp.days} onClick={() => setForm(f => ({ ...f, frequencyDays: fp.days }))} style={{
                                        padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        border: form.frequencyDays === fp.days ? '2px solid #3b82f6' : '2px solid var(--border)',
                                        background: form.frequencyDays === fp.days ? '#eff6ff' : 'var(--surface)',
                                        color: form.frequencyDays === fp.days ? '#3b82f6' : 'var(--text-muted)',
                                    }}>{fp.label}</button>
                                ))}
                                <input type="number" min={1} style={{ ...iS, width: 130 }} title="Jours personnalisés"
                                    value={form.frequencyDays} onChange={e => setForm(f => ({ ...f, frequencyDays: Math.max(1, +e.target.value) }))} />
                            </div>
                        </div>
                        <div><label style={lS}>Notes</label>
                            <textarea style={{ ...iS, minHeight: 56, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 18, height: 18 }} />
                            Plan actif
                        </label>
                    </div>
                </Modal>

                {/* Delete confirmation */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le plan" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="plan-delete-confirm" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <AlertTriangle size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer le plan <b>{deleteTarget?.title}</b> ?</p>
                    </div>
                </Modal>
            </main>
        </>
    );
}
