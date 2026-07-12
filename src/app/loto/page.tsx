'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import { lotoRecordsDb } from '@/lib/db';
import { useState, useMemo } from 'react';
import {
    Lock, Unlock, Plus, Cpu, User, Calendar, AlertTriangle, ShieldCheck, Info,
} from 'lucide-react';
import Link from 'next/link';
import type { LotoRecord } from '@/lib/types';

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function elapsedSince(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function LotoPage() {
    const { user } = useAuth();
    const { lotoRecords, machines } = useData();
    const { showToast } = useToast();
    const meName = user?.name ?? '';

    const [isOpen, setIsOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        machineId: '',
        reason: '',
        padlockId: '',
        notes: '',
    });

    const openLock = () => {
        setForm({ machineId: '', reason: '', padlockId: '', notes: '' });
        setIsOpen(true);
    };

    const lockMachine = async () => {
        if (!form.machineId) { showToast('Sélectionnez une machine', 'error'); return; }
        if (!form.reason.trim()) { showToast('Le motif est obligatoire', 'error'); return; }
        if (!meName) { showToast('Connectez-vous d\'abord', 'error'); return; }
        const alreadyLocked = lotoRecords.find(r => r.machineId === form.machineId && !r.endedAt);
        if (alreadyLocked) {
            showToast(`Cette machine est déjà consignée par ${alreadyLocked.technicianName}`, 'error');
            return;
        }
        setBusy(true);
        try {
            await lotoRecordsDb.create({
                machineId: form.machineId,
                technicianName: meName,
                reason: form.reason.trim(),
                padlockId: form.padlockId.trim(),
                startedAt: new Date().toISOString(),
                endedAt: null,
                notes: form.notes.trim(),
            });
            showToast(`🔒 Machine consignée — vérifiez le cadenas physique avant intervention`);
            setIsOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    // Replaced native confirm() with a Modal so the demo (and the user)
    // can drive deconsignation with a real click instead of the browser's
    // blocking dialog that requires Enter/click outside the page flow.
    const [unlockTarget, setUnlockTarget] = useState<LotoRecord | null>(null);
    const requestUnlock = (r: LotoRecord) => {
        if (r.technicianName !== meName && user?.role !== 'admin') {
            showToast(`Seul ${r.technicianName} ou un admin peut déconsigner cette machine`, 'error');
            return;
        }
        setUnlockTarget(r);
    };
    const confirmUnlock = async () => {
        if (!unlockTarget) return;
        setBusy(true);
        try {
            await lotoRecordsDb.update(unlockTarget.id, { endedAt: new Date().toISOString() });
            showToast(`🔓 Machine déconsignée`);
            setUnlockTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const active = useMemo(() => lotoRecords.filter(r => !r.endedAt)
        .sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || '')), [lotoRecords]);
    const history = useMemo(() => lotoRecords.filter(r => !!r.endedAt)
        .sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || '')).slice(0, 30), [lotoRecords]);

    const availableMachines = machines.filter(m =>
        !lotoRecords.find(r => r.machineId === m.id && !r.endedAt));

    return (
        <>
            <Header title="Consignation LOTO" subtitle="Verrouillage / consignation des machines en intervention — sécurité personnel" />
            <main style={{ padding: '24px 32px' }}>

                {/* KPIs */}
                <div data-tour="loto-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Machines consignées', value: active.length, color: active.length ? '#dc2626' : '#16a34a', icon: <Lock size={13} /> },
                        { label: 'Consignations passées', value: history.length, color: '#8b5cf6', icon: <ShieldCheck size={13} /> },
                        { label: 'Total registre', value: lotoRecords.length, color: '#3b82f6', icon: <Calendar size={13} /> },
                    ].map((k, i) => (
                        <div key={i} className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{k.icon}</span>
                                <span className="section-eyebrow">{k.label}</span>
                            </div>
                            <div style={{ color: k.color, letterSpacing: '-0.02em' }}>{k.value}</div>
                        </div>
                    ))}
                </div>

                {/* Active lockouts */}
                <div data-tour="loto-active" className="card" style={{ padding: 0, marginBottom: 22, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Lock size={18} color="#dc2626" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Machines actuellement consignées</h3>
                        <button onClick={openLock} data-tour="loto-action" disabled={availableMachines.length === 0} style={{
                            marginLeft: 'auto', padding: '8px 14px', borderRadius: 8,
                            background: availableMachines.length ? '#b91c1c' : 'var(--surface-hover)',
                            color: availableMachines.length ? 'white' : 'var(--text-muted)',
                            border: 'none', fontWeight: 600, fontSize: 13,
                            cursor: availableMachines.length ? 'pointer' : 'not-allowed',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            boxShadow: availableMachines.length ? '0 1px 0 rgba(11,18,32,0.08)' : 'none',
                            transition: 'background 0.15s ease',
                        }}><Plus size={14} /> Consigner une machine</button>
                    </div>
                    {active.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 13 }}>
                            <ShieldCheck size={36} color="#16a34a" style={{ opacity: 0.6, margin: '0 auto 8px', display: 'block' }} />
                            Aucune machine consignée — toutes les machines sont disponibles pour la production.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, padding: 18 }}>
                            {active.map(r => {
                                const m = machines.find(x => x.id === r.machineId);
                                const isMine = r.technicianName === meName;
                                return (
                                    <div key={r.id} data-tour="loto-card" data-loto-padlock={r.padlockId || ''} style={{
                                        borderRadius: 14, padding: '14px 16px',
                                        border: '2px solid #fca5a5', background: '#fef2f2',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#dc2626', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Lock size={19} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Link href={m ? `/machines/${m.id}` : '#'} style={{ fontWeight: 800, fontSize: 16, color: '#991b1b', textDecoration: 'none' }}>
                                                    {m?.code ?? 'Machine ?'}
                                                </Link>
                                                <div style={{ fontSize: 12, color: '#7f1d1d' }}>{m?.name ?? ''}</div>
                                            </div>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: '#fee2e2', color: '#dc2626', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                                Consignée
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 12.5, color: '#7f1d1d', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                                <User size={12} /> <b>{r.technicianName}</b> {isMine && <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>(vous)</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                                <Calendar size={12} /> Depuis {fmtDate(r.startedAt)} · <b>{elapsedSince(r.startedAt)}</b>
                                            </div>
                                            {r.padlockId && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <Lock size={11} /> Cadenas n° <b>{r.padlockId}</b>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 13, fontStyle: 'italic', color: '#991b1b', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                                            « {r.reason} »
                                        </div>
                                        <button data-tour="loto-unlock" onClick={() => requestUnlock(r)} disabled={busy} style={{
                                            width: '100%', padding: '9px', borderRadius: 9,
                                            background: isMine || user?.role === 'admin' ? '#16a34a' : 'var(--surface-hover)',
                                            color: isMine || user?.role === 'admin' ? 'white' : 'var(--text-muted)',
                                            border: 'none', fontWeight: 700, fontSize: 13,
                                            cursor: busy ? 'wait' : (isMine || user?.role === 'admin' ? 'pointer' : 'not-allowed'),
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            fontFamily: 'inherit',
                                        }}>
                                            <Unlock size={14} /> Déconsigner
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* History */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={18} color="#16a34a" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Historique des consignations (30 dernières)</h3>
                    </div>
                    {history.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Aucune consignation passée.</div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Machine</th><th>Technicien</th><th>Motif</th><th>Cadenas</th><th>Début</th><th>Fin</th><th>Durée</th>
                                </tr></thead>
                                <tbody>
                                    {history.map(r => {
                                        const m = machines.find(x => x.id === r.machineId);
                                        const start = new Date(r.startedAt).getTime();
                                        const end = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
                                        const mins = Math.round((end - start) / 60000);
                                        const durStr = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
                                        return (
                                            <tr key={r.id}>
                                                <td>{m ? <Link href={`/machines/${m.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>{m.code}</Link> : '—'}</td>
                                                <td style={{ fontSize: 13 }}>{r.technicianName}</td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
                                                <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.padlockId || '—'}</td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtDate(r.startedAt)}</td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{r.endedAt ? fmtDate(r.endedAt) : '—'}</td>
                                                <td style={{ fontSize: 12.5, fontWeight: 600 }}>{durStr}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 22, padding: '12px 16px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: '#92400e' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <b>Cette consignation digitale ne remplace pas le cadenas physique.</b> Verrouillez toujours le sectionneur de la machine avec votre cadenas personnel + étiquette « Hors service » avant toute intervention électrique.
                    </div>
                </div>

                {/* New lockout modal */}
                <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="🔒 Consigner une machine" size="md"
                    footer={<>
                        <button onClick={() => setIsOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button data-tour="loto-form-save" onClick={lockMachine} disabled={busy} className="btn btn-sm" style={{ background: '#b91c1c', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>
                            <Lock size={14} /> Consigner
                        </button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={lS}>Machine *</label>
                            <select data-tour="loto-form-machine" style={iS} value={form.machineId}
                                onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                                <option value="">— Sélectionner —</option>
                                {availableMachines.map(m => (
                                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                                ))}
                            </select>
                            {availableMachines.length === 0 && (
                                <div style={{ marginTop: 6, fontSize: 11.5, color: '#dc2626' }}>Toutes les machines sont déjà consignées.</div>
                            )}
                        </div>
                        <div>
                            <label style={lS}>Motif de l&apos;intervention *</label>
                            <textarea data-tour="loto-form-reason" value={form.reason}
                                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                style={{ ...iS, minHeight: 70, resize: 'vertical' }}
                                placeholder="Ex : remplacement joints des buses + nettoyage CIP" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={lS}>N° de cadenas</label>
                                <input data-tour="loto-form-padlock" style={iS} value={form.padlockId}
                                    onChange={e => setForm(f => ({ ...f, padlockId: e.target.value }))}
                                    placeholder="CAD-014" />
                            </div>
                            <div>
                                <label style={lS}>Technicien</label>
                                <input style={{ ...iS, background: 'var(--surface-hover)' }} value={meName} readOnly />
                            </div>
                        </div>
                        <div>
                            <label style={lS}>Notes</label>
                            <input style={iS} value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Ex : consigne sectionneur principal + vanne air" />
                        </div>
                        <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', padding: '10px 12px', borderRadius: 8, border: '1px solid #fde68a' }}>
                            ⚠️ Avant de cliquer Consigner : verrouillez physiquement le sectionneur, apposez l&apos;étiquette, vérifiez l&apos;absence de tension au VAT.
                        </div>
                    </div>
                </Modal>

                {/* Déconsignation confirmation — replaces window.confirm. */}
                <Modal isOpen={!!unlockTarget} onClose={() => setUnlockTarget(null)} title="🔓 Déconsigner la machine" size="sm"
                    footer={<>
                        <button data-tour="loto-unlock-cancel" onClick={() => setUnlockTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="loto-unlock-confirm" onClick={confirmUnlock} disabled={busy} className="btn btn-sm" style={{ background: '#0e7c3f', color: 'white', border: 'none', opacity: busy ? 0.7 : 1 }}>
                            <Unlock size={14} /> Déconsigner
                        </button>
                    </>}>
                    {unlockTarget && (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <Unlock size={28} color="#16a34a" />
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
                                Déconsigner <b>{machines.find(m => m.id === unlockTarget.machineId)?.code}</b> ?
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                L&apos;intervention est terminée et le cadenas peut être retiré.
                            </p>
                        </div>
                    )}
                </Modal>
            </main>
        </>
    );
}
