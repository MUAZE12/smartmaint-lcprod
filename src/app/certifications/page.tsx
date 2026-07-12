'use client';

// ============================================================
// T7 — Habilitations / certifications techniciens
// Admin CRUD + expiry alerts. Used to block assigning a
// non-habilité technician to a risky intervention (downstream).
// ============================================================

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { techCertificationsDb } from '@/lib/db';
import type { CertType, TechCertification } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Award, Plus, AlertTriangle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';

const CERT_TYPES: CertType[] = ['B1V', 'BR', 'chimique', 'espaces confinés', 'autre'];

const certStyle: Record<CertType, { color: string; bg: string; label: string }> = {
    'B1V': { color: '#2563eb', bg: '#eff6ff', label: 'B1V — Travaux électriques basse tension' },
    'BR': { color: '#7c3aed', bg: '#f5f3ff', label: 'BR — Interventions générales BT' },
    'chimique': { color: '#dc2626', bg: '#fef2f2', label: 'Risque chimique' },
    'espaces confinés': { color: '#ea580c', bg: '#fff7ed', label: 'Espaces confinés' },
    'autre': { color: '#475569', bg: '#f1f5f9', label: 'Autre' },
};

/** Days between today and the expiry date — negative when already expired. */
function daysUntil(iso: string | null): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    return Math.round(ms / 86400000);
}

export default function CertificationsPage() {
    const { techCertifications, technicians } = useData();
    const { showToast } = useToast();

    const [editing, setEditing] = useState<TechCertification | null>(null);
    const [showNew, setShowNew] = useState(false);
    type CertStatus = 'valide' | 'à renouveler' | 'expirée';
    const [statusFilter, setStatusFilter] = useState<CertStatus | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TechCertification | null>(null);
    const [busy, setBusy] = useState(false);

    const statusOf = (c: TechCertification): CertStatus | 'sans expiration' => {
        const d = daysUntil(c.expiresAt);
        if (d === null) return 'sans expiration';
        if (d < 0) return 'expirée';
        if (d <= 60) return 'à renouveler';
        return 'valide';
    };

    // KPI tallies
    const { expired, expiringSoon, valid } = useMemo(() => {
        let exp = 0, soon = 0, ok = 0;
        techCertifications.forEach(c => {
            const d = daysUntil(c.expiresAt);
            if (d === null) ok++;
            else if (d < 0) exp++;
            else if (d <= 60) soon++;
            else ok++;
        });
        return { expired: exp, expiringSoon: soon, valid: ok };
    }, [techCertifications]);

    const sorted = useMemo(() => {
        const base = statusFilter
            ? techCertifications.filter(c => {
                const s = statusOf(c);
                // 'valide' filter includes "sans expiration" since both are
                // currently-acceptable; the other filters are strict.
                return statusFilter === 'valide' ? (s === 'valide' || s === 'sans expiration') : s === statusFilter;
            })
            : techCertifications;
        return [...base].sort((a, b) => {
            const da = daysUntil(a.expiresAt) ?? 99999;
            const db = daysUntil(b.expiresAt) ?? 99999;
            return da - db;
        });
    }, [techCertifications, statusFilter]);

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try { await techCertificationsDb.remove(deleteTarget.id); showToast('Habilitation supprimée'); setDeleteTarget(null); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const toggleFilter = (s: CertStatus) => setStatusFilter(prev => prev === s ? null : s);

    return (
        <>
            <Header title="Habilitations" subtitle="Certifications & habilitations réglementaires des techniciens" />
            <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }} className="animate-fade-in">

                <div data-tour="cert-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                    <KpiCard color="#16a34a" icon={CheckCircle2} label="Valides" value={valid} active={statusFilter === 'valide'} onClick={() => toggleFilter('valide')} dataStatus="valide" />
                    <KpiCard color="#f59e0b" icon={AlertTriangle} label="Expirent < 60 j" value={expiringSoon} active={statusFilter === 'à renouveler'} onClick={() => toggleFilter('à renouveler')} dataStatus="à renouveler" />
                    <KpiCard color="#dc2626" icon={AlertTriangle} label="Expirées" value={expired} active={statusFilter === 'expirée'} onClick={() => toggleFilter('expirée')} dataStatus="expirée" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={() => setShowNew(true)} data-tour="cert-add" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                        color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
                    }}><Plus size={15} /> Ajouter une habilitation</button>
                </div>

                <div data-tour="cert-table" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {sorted.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                            Aucune habilitation enregistrée. Cliquez « Ajouter ».
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Technicien</th><th>Type</th><th>N°</th><th>Émetteur</th>
                                    <th>Émise le</th><th>Expire le</th><th>Statut</th><th></th>
                                </tr></thead>
                                <tbody>
                                    {sorted.map(c => {
                                        const d = daysUntil(c.expiresAt);
                                        const status = d === null ? 'sans expiration' : d < 0 ? 'expirée' : d <= 60 ? 'à renouveler' : 'valide';
                                        const sColor = status === 'expirée' ? '#dc2626' : status === 'à renouveler' ? '#d97706' : '#16a34a';
                                        const sBg = status === 'expirée' ? '#fef2f2' : status === 'à renouveler' ? '#fffbeb' : '#f0fdf4';
                                        const meta = certStyle[c.certType];
                                        return (
                                            <tr key={c.id} data-tour="cert-row" data-cert-number={c.certNumber || ''}>
                                                <td style={{ fontWeight: 600 }}>{c.technicianName}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block', fontSize: 11.5, fontWeight: 700,
                                                        padding: '3px 9px', borderRadius: 100,
                                                        background: meta.bg, color: meta.color,
                                                    }}>{c.certType}</span>
                                                </td>
                                                <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.certNumber || '—'}</td>
                                                <td style={{ fontSize: 12.5 }}>{c.issuingBody || '—'}</td>
                                                <td style={{ fontSize: 12.5 }}>{c.issuedAt ?? '—'}</td>
                                                <td style={{ fontSize: 12.5 }}>{c.expiresAt ?? '—'}{d !== null && (
                                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                                                        {d < 0 ? `${Math.abs(d)} j de retard` : `dans ${d} j`}
                                                    </div>
                                                )}</td>
                                                <td>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100, color: sColor, background: sBg }}>{status}</span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={() => setEditing(c)} title="Modifier" style={iconBtn('#3b82f6')}><Pencil size={12} /></button>
                                                        <button data-tour="cert-row-delete" onClick={() => setDeleteTarget(c)} title="Supprimer" style={iconBtn('#ef4444')}><Trash2 size={12} /></button>
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
            </main>

            {(showNew || editing) && (
                <CertForm
                    cert={editing}
                    technicians={technicians}
                    onClose={() => { setShowNew(false); setEditing(null); }}
                />
            )}

            {/* Delete confirmation modal (replaces window.confirm so the
                demo can drive the flow with a real click). */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'habilitation" size="sm"
                footer={<>
                    <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                    <button data-tour="cert-delete-confirm" onClick={remove} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>Supprimer</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <AlertTriangle size={28} color="#ef4444" />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer cette habilitation ?</p>
                    {deleteTarget && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                            {deleteTarget.technicianName} — {deleteTarget.certType}
                        </p>
                    )}
                </div>
            </Modal>
        </>
    );
}

function KpiCard({ icon: Icon, color, label, value, active, onClick, dataStatus }: { icon: React.ElementType; color: string; label: string; value: number; active?: boolean; onClick?: () => void; dataStatus?: string }) {
    return (
        <button
            type="button"
            data-tour="cert-kpi-card"
            data-status={dataStatus}
            onClick={onClick}
            className="card"
            style={{
                padding: '14px 16px',
                border: active ? `1px solid ${color}` : '1px solid var(--border)',
                background: active ? color + '10' : 'var(--surface)',
                cursor: onClick ? 'pointer' : 'default',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                boxShadow: active ? `0 0 0 3px ${color}18` : '0 1px 2px rgba(11,18,32,0.03)',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {active && <div style={{ position: 'absolute', top: 12, bottom: 12, left: 0, width: 3, background: color, borderRadius: '0 3px 3px 0' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} />
                </div>
                <div>
                    <div className="section-eyebrow">{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{value}</div>
                </div>
            </div>
        </button>
    );
}

function iconBtn(color: string): React.CSSProperties {
    return {
        width: 26, height: 26, borderRadius: 7, border: '1px solid ' + color + '30',
        background: color + '15', color, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
    };
}

interface CertFormProps {
    cert: TechCertification | null;
    technicians: { id: string; fullName: string }[];
    onClose: () => void;
}

function CertForm({ cert, technicians, onClose }: CertFormProps) {
    const { showToast } = useToast();
    const [technicianId, setTechnicianId] = useState<string | null>(cert?.technicianId ?? technicians[0]?.id ?? null);
    const [certType, setCertType] = useState<CertType>(cert?.certType ?? 'B1V');
    const [certNumber, setCertNumber] = useState(cert?.certNumber ?? '');
    const [issuedAt, setIssuedAt] = useState<string>(cert?.issuedAt ?? '');
    const [expiresAt, setExpiresAt] = useState<string>(cert?.expiresAt ?? '');
    const [issuingBody, setIssuingBody] = useState(cert?.issuingBody ?? '');
    const [notes, setNotes] = useState(cert?.notes ?? '');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        if (!technicianId) { showToast('Choisissez un technicien', 'error'); return; }
        const tech = technicians.find(t => t.id === technicianId);
        if (!tech) { showToast('Technicien introuvable', 'error'); return; }
        setBusy(true);
        try {
            const payload = {
                technicianId,
                technicianName: tech.fullName,
                certType, certNumber,
                issuedAt: issuedAt || null,
                expiresAt: expiresAt || null,
                issuingBody, notes,
            };
            if (cert) await techCertificationsDb.update(cert.id, payload);
            else await techCertificationsDb.create(payload);
            showToast(cert ? 'Habilitation mise à jour' : 'Habilitation enregistrée');
            onClose();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={cert ? 'Modifier l\'habilitation' : 'Nouvelle habilitation'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Technicien">
                    <select className="input" value={technicianId ?? ''} onChange={e => setTechnicianId(e.target.value || null)}>
                        {technicians.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                    </select>
                </Field>
                <Field label="Type d'habilitation">
                    <select className="input" value={certType} onChange={e => setCertType(e.target.value as CertType)}>
                        {CERT_TYPES.map(t => <option key={t} value={t}>{t} — {certStyle[t].label}</option>)}
                    </select>
                </Field>
                <Field label="N° certificat">
                    <input data-tour="cert-form-number" className="input" value={certNumber} onChange={e => setCertNumber(e.target.value)} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Émise le">
                        <input className="input" type="date" value={issuedAt ?? ''} onChange={e => setIssuedAt(e.target.value)} />
                    </Field>
                    <Field label="Expire le">
                        <input className="input" type="date" value={expiresAt ?? ''} onChange={e => setExpiresAt(e.target.value)} />
                    </Field>
                </div>
                <Field label="Organisme émetteur">
                    <input className="input" value={issuingBody} onChange={e => setIssuingBody(e.target.value)} placeholder="ex. APAVE Maroc" />
                </Field>
                <Field label="Notes">
                    <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button data-tour="cert-form-cancel" onClick={onClose} className="btn btn-secondary">Annuler</button>
                    <button data-tour="cert-form-save" onClick={save} disabled={busy} style={{
                        padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                        color: 'white', fontWeight: 700, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer',
                        fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
                    }}>{busy ? '...' : 'Enregistrer'}</button>
                </div>
            </div>
        </Modal>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {children}
        </div>
    );
}
