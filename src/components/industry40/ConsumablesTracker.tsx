'use client';

import { useState, useEffect } from 'react';
import { Package, Clock, AlertTriangle, CheckCircle, Plus, Edit, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { consumablesDb } from '@/lib/db';
import type { Consumable } from '@/lib/types';

// Derived state — DB fields (totalHours / usedHours) are repurposed to
// hold QUANTITIES: totalHours = initial stock, usedHours = consumed. The
// UI speaks quantity so it stays coherent with Pièces de rechange.
function lifeOf(c: Consumable) {
    const pct = c.totalHours > 0 ? Math.round((c.usedHours / c.totalHours) * 100) : 0;
    const status: 'ok' | 'warning' | 'critical' = pct >= 85 ? 'critical' : pct >= 60 ? 'warning' : 'ok';
    return {
        pct: Math.min(100, pct),
        status,
        remaining: Math.max(0, Math.round(c.totalHours - c.usedHours)),
    };
}

function statusColor(s: string) {
    return s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#22c55e';
}
function statusBg(s: string) {
    return s === 'critical' ? '#fef2f2' : s === 'warning' ? '#fffbeb' : '#f0fdf4';
}

const ATELIERS = ['Tous ateliers', 'Réception', 'Préparation', 'Production', 'Remplissage', 'Conditionnement', 'Expédition', 'Utilités'];
const EMPTY = { name: '', atelier: 'Tous ateliers', totalHours: 500, usedHours: 0, icon: '📦' };

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function ConsumablesTracker() {
    const { showToast } = useToast();
    const { consumables } = useData();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Consumable | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Consumable | null>(null);
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    // Tutorial escape hatch — the demo's `type` action races React-controlled
    // inputs in this specific modal, so the form was being submitted empty
    // and the save validation rejected it (cursor disappeared because the
    // expected new row never rendered). Listening on a CustomEvent lets the
    // tutorial set the form synchronously without touching the input DOM.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as Partial<typeof EMPTY> | undefined;
            if (!detail) return;
            setForm(prev => ({ ...prev, ...detail }));
        };
        window.addEventListener('smartmaint-demo-set-consumable-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-consumable-form', handler);
    }, []);

    const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
    const openEdit = (c: Consumable) => {
        setEditing(c);
        setForm({ name: c.name, atelier: c.atelier, totalHours: c.totalHours, usedHours: c.usedHours, icon: c.icon });
        setModalOpen(true);
    };

    const save = async () => {
        if (!form.name.trim()) { showToast('Le nom du consommable est obligatoire', 'error'); return; }
        setBusy(true);
        try {
            if (editing) { await consumablesDb.update(editing.id, form); showToast('Consommable mis à jour'); }
            else { await consumablesDb.create({ ...form, icon: form.icon || '📦' }); showToast('Consommable ajouté'); }
            setModalOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await consumablesDb.remove(deleteTarget.id);
            showToast('Consommable supprimé', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    return (
        <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={18} color="#3b82f6" />
                <h3 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Consommables — quantités en stock</h3>
                <button data-tour="cons-add" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--primary-lighter)', color: 'var(--primary)', border: 'none', cursor: 'pointer' }}>
                    <Plus size={14} /> Ajouter
                </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {consumables.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Aucun consommable suivi. Cliquez sur « Ajouter ».
                    </div>
                )}
                {consumables.map(item => {
                    const { pct, status, remaining } = lifeOf(item);
                    const color = statusColor(status);
                    const StatusIcon = status === 'critical' ? AlertTriangle : status === 'warning' ? Clock : CheckCircle;
                    return (
                        <div key={item.id} data-tour="cons-row" data-cons-name={item.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10, background: statusBg(status),
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                            }}>
                                {item.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <StatusIcon size={12} color={color} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
                                        <button onClick={() => openEdit(item)} style={{ width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-hover)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}><Edit size={11} /></button>
                                        <button data-tour="cons-delete" onClick={() => setDeleteTarget(item)} style={{ width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={11} /></button>
                                    </div>
                                </div>
                                <div style={{ height: 8, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: 100, width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, transition: 'width 0.8s ease' }} />
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    {item.atelier} · reste ~<b style={{ color }}>{remaining} unité(s)</b> · consommé {item.usedHours}/{item.totalHours}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Create / edit modal */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le consommable' : 'Nouveau consommable'} size="md"
                footer={<>
                    <button data-tour="cons-cancel" onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                    <button data-tour="cons-save" onClick={save} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#1e40af)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>Enregistrer</button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div><label style={lS}>Nom du consommable *</label><input style={iS} placeholder="Ex: Cartouche filtrante huile" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
                        <div><label style={lS}>Atelier</label>
                            <select style={iS} value={form.atelier} onChange={e => setForm(f => ({ ...f, atelier: e.target.value }))}>
                                {ATELIERS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div><label style={lS}>Icône</label><input style={{ ...iS, textAlign: 'center' }} maxLength={2} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label style={lS}>Quantité totale (unités)</label><input type="number" min={1} style={iS} value={form.totalHours} onChange={e => setForm(f => ({ ...f, totalHours: +e.target.value }))} placeholder="Ex: 100" /></div>
                        <div><label style={lS}>Quantité consommée</label><input type="number" min={0} style={iS} value={form.usedHours} onChange={e => setForm(f => ({ ...f, usedHours: +e.target.value }))} placeholder="Ex: 45" /></div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        💡 « Quantité consommée » ≥ 85% de « Quantité totale » déclenche l&apos;alerte rouge « à commander ». Pour un réapprovisionnement automatique lié à un fournisseur, créez plutôt une entrée dans <b>Pièces de rechange</b>.
                    </div>
                </div>
            </Modal>

            {/* Delete confirmation */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le consommable" size="sm"
                footer={<>
                    <button data-tour="cons-delete-cancel" onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                    <button data-tour="cons-delete-confirm" onClick={remove} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>Supprimer</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <AlertTriangle size={28} color="#ef4444" />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer <b>{deleteTarget?.name}</b> ?</p>
                </div>
            </Modal>
        </div>
    );
}
