'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { calibrationRecordsDb, settingsDb } from '@/lib/db';
import type { CalibrationRecord, CalibrationType, CalibrationStatus } from '@/lib/types';
import {
    Ruler, Plus, Edit, Trash2, Printer, CheckCircle, AlertTriangle, XCircle,
    Thermometer, Gauge, Scale, Waves, FlaskConical, Droplet, FileBadge,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

const CAL_TYPES: { key: CalibrationType; label: string; icon: React.ElementType }[] = [
    { key: 'température', label: 'Température', icon: Thermometer },
    { key: 'pression', label: 'Pression', icon: Gauge },
    { key: 'pesage', label: 'Pesage', icon: Scale },
    { key: 'débit', label: 'Débit', icon: Waves },
    { key: 'pH', label: 'pH', icon: FlaskConical },
    { key: 'humidité', label: 'Humidité', icon: Droplet },
    { key: 'autre', label: 'Autre', icon: Ruler },
];

const STATUS_CFG: Record<CalibrationStatus, { color: string; bg: string; icon: React.ElementType; label: string }> = {
    'valide': { color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle, label: 'Valide' },
    'à étalonner': { color: '#d97706', bg: '#fffbeb', icon: AlertTriangle, label: 'À étalonner' },
    'expiré': { color: '#dc2626', bg: '#fef2f2', icon: XCircle, label: 'Expiré' },
};

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
const today = () => new Date().toISOString().slice(0, 10);
const SOON_DAYS = 30;

/** Effective status from the next-due date — always current, even as dates pass. */
function effectiveStatus(nextDueDate: string | null): CalibrationStatus {
    if (!nextDueDate) return 'valide';
    const days = Math.round((new Date(nextDueDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'expiré';
    if (days <= SOON_DAYS) return 'à étalonner';
    return 'valide';
}

const emptyForm = () => ({
    instrumentName: '', instrumentTag: '', machineId: '',
    calibrationType: 'température' as CalibrationType,
    lastCalibration: today(), nextDueDate: '', certificateNumber: '', calibratedBy: '', notes: '',
});

export default function CalibrationPage() {
    const { showToast } = useToast();
    const { machines, calibrationRecords } = useData();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<CalibrationRecord | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<CalibrationRecord | null>(null);
    const [form, setForm] = useState(emptyForm());
    const [busy, setBusy] = useState(false);
    const [statusFilter, setStatusFilter] = useState<CalibrationStatus | 'all'>('all');

    // Company info pulled from Settings → drives the print header.
    const [companyName, setCompanyName] = useState('L.C PROD');
    const [companySector, setCompanySector] = useState('Métrologie');
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

    // Records with their live status, sorted by urgency (soonest due first).
    const rows = useMemo(() =>
        calibrationRecords
            .map(r => ({ r, status: effectiveStatus(r.nextDueDate) }))
            .sort((a, b) => (a.r.nextDueDate || '9999').localeCompare(b.r.nextDueDate || '9999')),
        [calibrationRecords]);

    const visible = statusFilter === 'all' ? rows : rows.filter(x => x.status === statusFilter);

    const total = rows.length;
    const valides = rows.filter(x => x.status === 'valide').length;
    const soon = rows.filter(x => x.status === 'à étalonner').length;
    const expired = rows.filter(x => x.status === 'expiré').length;
    const conformity = total ? Math.round((valides / total) * 100) : 0;

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
    const openEdit = (r: CalibrationRecord) => {
        setEditing(r);
        setForm({
            instrumentName: r.instrumentName, instrumentTag: r.instrumentTag || '',
            machineId: r.machineId || '', calibrationType: r.calibrationType,
            lastCalibration: r.lastCalibration || today(), nextDueDate: r.nextDueDate || '',
            certificateNumber: r.certificateNumber || '', calibratedBy: r.calibratedBy || '', notes: r.notes || '',
        });
        setModalOpen(true);
    };

    const save = async () => {
        if (!form.instrumentName.trim()) { showToast("Le nom de l'instrument est obligatoire", 'error'); return; }
        setBusy(true);
        try {
            const payload = {
                instrumentName: form.instrumentName.trim(),
                instrumentTag: form.instrumentTag.trim(),
                machineId: form.machineId || null,
                calibrationType: form.calibrationType,
                lastCalibration: form.lastCalibration || null,
                nextDueDate: form.nextDueDate || null,
                certificateNumber: form.certificateNumber.trim(),
                calibratedBy: form.calibratedBy.trim(),
                status: effectiveStatus(form.nextDueDate || null),
                notes: form.notes.trim(),
            };
            if (editing) { await calibrationRecordsDb.update(editing.id, payload); showToast('Étalonnage mis à jour'); }
            else { await calibrationRecordsDb.create(payload); showToast('Instrument enregistré'); }
            setModalOpen(false);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try { await calibrationRecordsDb.remove(deleteTarget.id); showToast('Instrument supprimé', 'error'); setDeleteTarget(null); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const kpi = (label: string, value: string | number, color: string) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
            <div className="section-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    return (
        <>
            <Header title="Étalonnage des instruments" subtitle="Certificats de calibration des appareils de mesure du site" />
            <main style={{ padding: '24px 32px' }}>
                {/* Print header */}
                <div className="print-only" style={{ marginBottom: 16, borderBottom: '2px solid #1e293b', paddingBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{companyName} · Registre d&apos;étalonnage</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {companySector} · Édité le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                {/* KPIs */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    {kpi('Taux de conformité', `${conformity}%`, conformity >= 90 ? '#16a34a' : conformity >= 70 ? '#d97706' : '#dc2626')}
                    {kpi('Instruments suivis', total, 'var(--text-primary)')}
                    {kpi('Étalonnages valides', valides, '#16a34a')}
                    {kpi('À étalonner (≤ 30 j)', soon, soon ? '#d97706' : '#16a34a')}
                    {kpi('Certificats expirés', expired, expired ? '#dc2626' : '#16a34a')}
                </div>

                {/* Expiry banner */}
                {(expired > 0 || soon > 0) && (
                    <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 12, background: expired ? '#fef2f2' : '#fffbeb', border: `1px solid ${expired ? '#fecaca' : '#fde68a'}`, marginBottom: 20 }}>
                        <AlertTriangle size={16} color={expired ? '#dc2626' : '#d97706'} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: expired ? '#dc2626' : '#d97706', fontWeight: 500, lineHeight: 1.5 }}>
                            {expired > 0 && `${expired} certificat${expired > 1 ? 's' : ''} expiré${expired > 1 ? 's' : ''} — étalonnage à refaire avant toute mesure HACCP. `}
                            {soon > 0 && `${soon} instrument${soon > 1 ? 's' : ''} arrive${soon > 1 ? 'nt' : ''} à échéance sous 30 jours.`}
                        </span>
                    </div>
                )}

                {/* Toolbar */}
                <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div data-tour="cal-filters" style={{ display: 'flex', gap: 6 }}>
                        {(['all', 'valide', 'à étalonner', 'expiré'] as (CalibrationStatus | 'all')[]).map(s => {
                            const on = statusFilter === s;
                            const c = s === 'all' ? '#3b82f6' : STATUS_CFG[s].color;
                            return (
                                <button key={s} data-tour="cal-filter" data-status={s} onClick={() => setStatusFilter(s)} style={{
                                    padding: '6px 13px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    border: `1px solid ${on ? c : 'var(--border)'}`, background: on ? c : 'var(--surface)', color: on ? 'white' : 'var(--text-secondary)',
                                }}>{s === 'all' ? 'Tous' : STATUS_CFG[s].label}</button>
                            );
                        })}
                    </div>
                    <div style={{ flex: 1 }} />
                    <button data-tour="cal-print" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                        <Printer size={17} /> Registre d&apos;étalonnage
                    </button>
                    <button onClick={openCreate} data-tour="page-add" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: '#0e7490', color: 'white', border: 'none', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', transition: 'background 0.15s ease' }}>
                        <Plus size={18} /> Nouvel instrument
                    </button>
                </div>

                {/* Table */}
                <div data-tour="cal-table" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Ruler size={18} color="#0891b2" />
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Parc d&apos;instruments de mesure ({visible.length})</h3>
                    </div>
                    {visible.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 13 }}>
                            {total === 0 ? 'Aucun instrument enregistré.' : 'Aucun instrument pour ce filtre.'}
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Instrument</th><th>Type</th><th>Machine</th><th>Dernier étalonnage</th>
                                    <th>Prochaine échéance</th><th>Certificat</th><th>État</th><th className="no-print">Actions</th>
                                </tr></thead>
                                <tbody>
                                    {visible.map(({ r, status }) => {
                                        const m = machines.find(x => x.id === r.machineId);
                                        const cfg = STATUS_CFG[status];
                                        const SIcon = cfg.icon;
                                        const TIcon = (CAL_TYPES.find(c => c.key === r.calibrationType)?.icon) ?? Ruler;
                                        return (
                                            <tr key={r.id} data-tour="cal-row" data-instrument={r.instrumentName}>
                                                <td>
                                                    <div style={{ fontWeight: 700 }}>{r.instrumentName}</div>
                                                    {r.instrumentTag && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Repère {r.instrumentTag}</div>}
                                                </td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                                                        <TIcon size={14} color="#0891b2" /> {r.calibrationType}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 13 }}>{m ? m.code : <span style={{ color: 'var(--text-muted)' }}>Laboratoire</span>}</td>
                                                <td style={{ fontSize: 13 }}>{r.lastCalibration || '—'}</td>
                                                <td style={{ fontSize: 13, fontWeight: status === 'valide' ? 400 : 700, color: cfg.color }}>
                                                    {r.nextDueDate || '—'}
                                                </td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                                    {r.certificateNumber
                                                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileBadge size={13} color="#64748b" />{r.certificateNumber}</span>
                                                        : '—'}
                                                </td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                                                        <SIcon size={12} /> {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="no-print">
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button onClick={() => openEdit(r)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}><Edit size={14} /></button>
                                                        <button data-tour="cal-row-delete" onClick={() => setDeleteTarget(r)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
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
                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Modifier l'instrument" : 'Nouvel instrument de mesure'} size="md"
                    footer={<>
                        <button onClick={() => setModalOpen(false)} className="btn btn-secondary btn-sm">Annuler</button>
                        <button data-tour="cal-form-save" onClick={save} disabled={busy} className="btn btn-sm" style={{ background: '#0e7490', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>Enregistrer</button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Nom de l&apos;instrument *</label>
                                <input data-tour="cal-form-name" style={iS} placeholder="Ex: Sonde de température cuve" value={form.instrumentName} onChange={e => setForm(f => ({ ...f, instrumentName: e.target.value }))} />
                            </div>
                            <div><label style={lS}>Repère / Tag</label>
                                <input style={iS} placeholder="Ex: TT-301" value={form.instrumentTag} onChange={e => setForm(f => ({ ...f, instrumentTag: e.target.value }))} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Type de mesure</label>
                                <select style={iS} value={form.calibrationType} onChange={e => setForm(f => ({ ...f, calibrationType: e.target.value as CalibrationType }))}>
                                    {CAL_TYPES.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                                </select>
                            </div>
                            <div><label style={lS}>Machine associée</label>
                                <select style={iS} value={form.machineId} onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                                    <option value="">— Laboratoire / aucune —</option>
                                    {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>Dernier étalonnage</label>
                                <input type="date" style={iS} value={form.lastCalibration} onChange={e => setForm(f => ({ ...f, lastCalibration: e.target.value }))} />
                            </div>
                            <div><label style={lS}>Prochaine échéance</label>
                                <input type="date" style={iS} value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={lS}>N° de certificat</label>
                                <input style={iS} placeholder="Ex: CERT-2026-TT301" value={form.certificateNumber} onChange={e => setForm(f => ({ ...f, certificateNumber: e.target.value }))} />
                            </div>
                            <div><label style={lS}>Étalonné par</label>
                                <input style={iS} placeholder="Ex: Bureau Veritas" value={form.calibratedBy} onChange={e => setForm(f => ({ ...f, calibratedBy: e.target.value }))} />
                            </div>
                        </div>
                        <div><label style={lS}>Notes / observations</label>
                            <textarea style={{ ...iS, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '8px 12px', borderRadius: 8 }}>
                            L&apos;état (valide / à étalonner / expiré) est calculé automatiquement à partir de la prochaine échéance.
                        </div>
                    </div>
                </Modal>

                {/* Delete confirmation */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'instrument" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="cal-delete-confirm" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Ruler size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer « {deleteTarget?.instrumentName} » du registre ?</p>
                    </div>
                </Modal>
            </main>
        </>
    );
}
