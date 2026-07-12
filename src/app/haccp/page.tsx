'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { haccpRecordsDb, settingsDb } from '@/lib/db';
import type { HaccpRecord, HaccpCheckType, HaccpResult } from '@/lib/types';
import {
    ShieldCheck, Plus, Edit, Trash2, Printer, CheckCircle, AlertTriangle, XCircle, Droplets,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

// Zones in direct contact with the edible-oil product → must be HACCP-tracked.
// Matches against `machine.workshop` (process zone). Utilités is excluded —
// utilities (compresseur, chaudière) don't touch the product directly.
const FOOD_CONTACT_ZONES = ['Réception MP', 'Traitement', 'Production', 'Remplissage', 'Conditionnement', 'Emballage', 'Expédition'];

const CHECK_TYPES: { key: HaccpCheckType; label: string }[] = [
    { key: 'sanitation', label: 'Sanitation / CIP' },
    { key: 'calibration', label: 'Calibration' },
    { key: 'lubrification', label: 'Lubrifiant NSF H1' },
    { key: 'inspection', label: 'Inspection' },
];

const RESULT_CFG: Record<HaccpResult, { color: string; bg: string; icon: React.ElementType }> = {
    'conforme': { color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle },
    'à corriger': { color: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
    'non conforme': { color: '#dc2626', bg: '#fef2f2', icon: XCircle },
};

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
    machineId: '', checkType: 'sanitation' as HaccpCheckType, result: 'conforme' as HaccpResult,
    checkedBy: '', checkDate: today(), nextDueDate: '', notes: '',
});

export default function HaccpPage() {
    const { showToast } = useToast();
    const { machines, haccpRecords } = useData();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<HaccpRecord | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<HaccpRecord | null>(null);
    const [form, setForm] = useState(emptyForm());
    const [busy, setBusy] = useState(false);

    // Company info pulled from Settings → drives the print header.
    const [companyName, setCompanyName] = useState('L.C PROD');
    const [companySector, setCompanySector] = useState('Sécurité alimentaire');
    useEffect(() => {
        settingsDb.get('company_info').then(v => {
            if (!v) return;
            try {
                const p = JSON.parse(v);
                if (p.name) setCompanyName(p.name);
                if (p.sector) setCompanySector(p.sector);
            } catch { /* keep defaults */ }
        }).catch(() => { /* keep defaults */ });
    }, []);

    // Match by workshop (process zone). The old filter targeted m.type which
    // historically held the process phase but after the L.C PROD seed it now
    // holds the equipment type ("Pompe", "Filtration"…) — none of which were
    // in FOOD_CONTACT, so the HACCP dropdown went empty.
    const foodMachines = useMemo(
        () => machines.filter(m => FOOD_CONTACT_ZONES.includes(m.workshop)),
        [machines]);

    // Latest record for a given machine + check type.
    const latest = (machineId: string, type: HaccpCheckType): HaccpRecord | undefined =>
        haccpRecords
            .filter(r => r.machineId === machineId && r.checkType === type)
            .sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || ''))[0];

    const isOverdue = (r?: HaccpRecord) => !!r?.nextDueDate && r.nextDueDate < today();

    // Compliance KPIs
    const allLatest = useMemo(() => {
        const out: { r?: HaccpRecord }[] = [];
        foodMachines.forEach(m => CHECK_TYPES.forEach(ct => out.push({ r: latest(m.id, ct.key) })));
        return out;
    }, [foodMachines, haccpRecords]); // eslint-disable-line react-hooks/exhaustive-deps

    const checksDone = allLatest.filter(x => x.r).length;
    const nonConforme = allLatest.filter(x => x.r && x.r.result !== 'conforme').length;
    const overdue = allLatest.filter(x => isOverdue(x.r)).length;
    const missing = allLatest.filter(x => !x.r).length;
    const conformityRate = allLatest.length
        ? Math.round((allLatest.filter(x => x.r && x.r.result === 'conforme' && !isOverdue(x.r)).length / allLatest.length) * 100)
        : 0;

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
    const openCreateFor = (machineId: string, checkType: HaccpCheckType) => {
        setEditing(null); setForm({ ...emptyForm(), machineId, checkType }); setModalOpen(true);
    };
    const openEdit = (r: HaccpRecord) => {
        setEditing(r);
        setForm({
            machineId: r.machineId, checkType: r.checkType, result: r.result,
            checkedBy: r.checkedBy || '', checkDate: r.checkDate || today(),
            nextDueDate: r.nextDueDate || '', notes: r.notes || '',
        });
        setModalOpen(true);
    };

    const save = async () => {
        if (!form.machineId || !form.checkedBy.trim()) { showToast('Machine et contrôleur sont obligatoires', 'error'); return; }
        setBusy(true);
        try {
            const payload = { ...form, nextDueDate: form.nextDueDate || null };
            if (editing) { await haccpRecordsDb.update(editing.id, payload); showToast('Contrôle HACCP mis à jour'); }
            else { await haccpRecordsDb.create(payload); showToast('Contrôle HACCP enregistré'); }
            setModalOpen(false);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try { await haccpRecordsDb.remove(deleteTarget.id); showToast('Contrôle supprimé', 'error'); setDeleteTarget(null); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const kpi = (label: string, value: string | number, color: string) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
            <div className="section-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    const history = useMemo(
        () => [...haccpRecords].sort((a, b) => (b.checkDate || '').localeCompare(a.checkDate || '')),
        [haccpRecords]);

    return (
        <>
            <Header title="Conformité HACCP" subtitle="Suivi de la sécurité alimentaire des équipements en contact produit" />
            <main style={{ padding: '24px 32px' }}>
                {/* Print header */}
                <div className="print-only" style={{ marginBottom: 16, borderBottom: '2px solid #1e293b', paddingBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{companyName} · Dossier de conformité HACCP</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {companySector} · Édité le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                {/* KPIs */}
                <div data-tour="haccp-kpis" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    {kpi('Taux de conformité', `${conformityRate}%`, conformityRate >= 90 ? '#16a34a' : conformityRate >= 70 ? '#d97706' : '#dc2626')}
                    {kpi('Machines suivies', foodMachines.length, 'var(--text-primary)')}
                    {kpi('Contrôles effectués', checksDone, '#3b82f6')}
                    {kpi('Non conformes', nonConforme, nonConforme ? '#dc2626' : '#16a34a')}
                    {kpi('En retard', overdue, overdue ? '#d97706' : '#16a34a')}
                </div>

                {/* Toolbar */}
                <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }} />
                    <button data-tour="haccp-print" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                        <Printer size={17} /> Dossier d&apos;audit
                    </button>
                    <button onClick={openCreate} data-tour="page-add" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, background: '#0e7c3f', color: 'white', border: 'none', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', transition: 'background 0.15s ease' }}>
                        <Plus size={18} /> Nouveau contrôle
                    </button>
                </div>

                {/* Compliance matrix */}
                <div data-tour="haccp-matrix" data-tour-section="haccp-matrix" className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={18} color="#16a34a" />
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Matrice de conformité — équipements en contact produit</h3>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead><tr>
                                <th>Machine</th>
                                {CHECK_TYPES.map(ct => <th key={ct.key}>{ct.label}</th>)}
                            </tr></thead>
                            <tbody>
                                {foodMachines.map(m => (
                                    <tr key={m.id}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{m.code}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.type}</div>
                                        </td>
                                        {CHECK_TYPES.map(ct => {
                                            const r = latest(m.id, ct.key);
                                            const od = isOverdue(r);
                                            if (!r) {
                                                return (
                                                    <td key={ct.key}>
                                                        <button onClick={() => openCreateFor(m.id, ct.key)} className="no-print" style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                                                            + à contrôler
                                                        </button>
                                                        <span className="print-only" style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
                                                    </td>
                                                );
                                            }
                                            const cfg = RESULT_CFG[r.result];
                                            const Icon = cfg.icon;
                                            return (
                                                <td key={ct.key}>
                                                    <button onClick={() => openEdit(r)} title="Modifier ce contrôle" style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, padding: '5px 10px', borderRadius: 8, background: od ? '#fffbeb' : cfg.bg, border: od ? '1px solid #fde68a' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: cfg.color }}>
                                                            <Icon size={12} /> {r.result}
                                                        </span>
                                                        <span style={{ fontSize: 10, color: od ? '#d97706' : 'var(--text-muted)' }}>
                                                            {od ? `⚠ échéance dépassée` : r.checkDate}
                                                        </span>
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* History */}
                <div data-tour="haccp-history" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Journal des contrôles ({history.length})</h3></div>
                    {history.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Aucun contrôle enregistré.</div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Date</th><th>Machine</th><th>Type</th><th>Résultat</th><th>Contrôleur</th><th>Prochaine échéance</th><th>Notes</th><th className="no-print">Actions</th>
                                </tr></thead>
                                <tbody>
                                    {history.map(r => {
                                        const m = machines.find(x => x.id === r.machineId);
                                        const cfg = RESULT_CFG[r.result];
                                        const Icon = cfg.icon;
                                        const od = isOverdue(r);
                                        return (
                                            <tr key={r.id} data-tour="haccp-row" data-haccp-controller={r.checkedBy}>
                                                <td style={{ fontSize: 13 }}>{r.checkDate}</td>
                                                <td><span style={{ fontWeight: 600 }}>{m?.code || '—'}</span></td>
                                                <td style={{ fontSize: 13 }}>{CHECK_TYPES.find(c => c.key === r.checkType)?.label}</td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                                                        <Icon size={12} /> {r.result}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 13 }}>{r.checkedBy}</td>
                                                <td style={{ fontSize: 13, color: od ? '#d97706' : 'var(--text-muted)', fontWeight: od ? 700 : 400 }}>{r.nextDueDate || '—'}{od ? ' ⚠' : ''}</td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>{r.notes}</td>
                                                <td className="no-print">
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button onClick={() => openEdit(r)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}><Edit size={14} /></button>
                                                        <button data-tour="haccp-row-delete" onClick={() => setDeleteTarget(r)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
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

                {/* Create / edit modal */}
                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le contrôle HACCP' : 'Nouveau contrôle HACCP'} size="md"
                    footer={<>
                        <button onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button data-tour="haccp-form-save" onClick={save} disabled={busy} className="btn btn-sm" style={{ background: '#0e7c3f', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>Enregistrer</button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div><label style={lS}>Machine *</label>
                            <select data-tour="haccp-form-machine" style={iS} value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                                <option value="">— Sélectionner —</option>
                                {foodMachines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Type de contrôle</label>
                                <select style={iS} value={form.checkType} onChange={e => setForm(f => ({ ...f, checkType: e.target.value as HaccpCheckType }))}>
                                    {CHECK_TYPES.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                                </select>
                            </div>
                            <div><label style={lS}>Résultat</label>
                                <select style={iS} value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value as HaccpResult }))}>
                                    <option value="conforme">Conforme</option>
                                    <option value="à corriger">À corriger</option>
                                    <option value="non conforme">Non conforme</option>
                                </select>
                            </div>
                        </div>
                        <div><label style={lS}>Contrôleur *</label>
                            <input data-tour="haccp-form-controller" style={iS} placeholder="Ex: Sara Idrissi" value={form.checkedBy} onChange={e => setForm(f => ({ ...f, checkedBy: e.target.value }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Date du contrôle</label>
                                <input type="date" style={iS} value={form.checkDate} onChange={e => setForm(f => ({ ...f, checkDate: e.target.value }))} />
                            </div>
                            <div><label style={lS}>Prochaine échéance</label>
                                <input type="date" style={iS} value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                            </div>
                        </div>
                        <div><label style={lS}>Notes / observations</label>
                            <textarea style={{ ...iS, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                </Modal>

                {/* Delete confirmation */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le contrôle" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="haccp-delete-confirm" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Droplets size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer ce contrôle HACCP ?</p>
                    </div>
                </Modal>
            </main>
        </>
    );
}
