'use client';

import Header from '@/components/Header';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { toolsDb, purchaseRequisitionsDb, purchaseRequisitionLinesDb } from '@/lib/db';
import type { Tool, ToolCategory, ToolStatus, Machine, SparePart } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import {
    Wrench, Zap, Activity, Shield, Briefcase, Package, MapPin,
    CheckCircle, Search, AlertTriangle, ArrowRight, Clock, Hand, RotateCcw,
    ShoppingCart,
} from 'lucide-react';

// ── Tool category metadata ──
const categoryMeta: Record<ToolCategory, { icon: React.ElementType; color: string; bg: string }> = {
    'mécanique': { icon: Wrench, color: '#3b82f6', bg: '#eff6ff' },
    'électrique': { icon: Zap, color: '#f59e0b', bg: '#fffbeb' },
    'mesure': { icon: Activity, color: '#8b5cf6', bg: '#f5f3ff' },
    'sécurité': { icon: Shield, color: '#ef4444', bg: '#fef2f2' },
};

const statusMeta: Record<ToolStatus, { color: string; bg: string; label: string }> = {
    'disponible': { color: '#16a34a', bg: '#f0fdf4', label: 'Disponible' },
    'utilisé': { color: '#2563eb', bg: '#eff6ff', label: 'En utilisation' },
    'en maintenance': { color: '#d97706', bg: '#fffbeb', label: 'En maintenance' },
};

type StatusFilter = 'all' | ToolStatus | 'mine';

/** Where a spare part is stored — derived from its machine's workshop. */
function partLocation(part: SparePart, machines: Machine[]): string {
    if (part.machineId) {
        const m = machines.find(x => x.id === part.machineId);
        if (m) return `Magasin · ${m.workshop}`;
    }
    return 'Magasin général';
}

/** Hours since a checkout — for the "depuis" badge. */
function hoursSince(iso: string | null): string {
    if (!iso) return '';
    const h = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 24) return `${Math.round(h)} h`;
    return `${Math.round(h / 24)} j`;
}

export default function TechnicianInventoryPage() {
    const { showToast } = useToast();
    const { user } = useAuth();
    const { tools, spareParts, machines } = useData();

    const meName = user?.name ?? '';
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<ToolCategory | 'all'>('all');
    const [partSearch, setPartSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    // ── T4 — part-request shortcut ──
    const [reqPart, setReqPart] = useState<SparePart | null>(null);
    const [reqQty, setReqQty] = useState(1);
    const [reqUrgency, setReqUrgency] = useState<'normale' | 'urgente'>('normale');
    const [reqNotes, setReqNotes] = useState('');
    const [reqSubmitting, setReqSubmitting] = useState(false);
    const openRequest = (p: SparePart) => {
        setReqPart(p);
        setReqQty(Math.max(p.minimumStock, p.minimumStock * 2 - p.quantity, 1));
        setReqUrgency(p.quantity <= p.minimumStock ? 'urgente' : 'normale');
        setReqNotes('');
    };
    const closeRequest = () => { setReqPart(null); setReqQty(1); setReqUrgency('normale'); setReqNotes(''); };
    const submitRequest = async () => {
        if (!reqPart) return;
        setReqSubmitting(true);
        try {
            const reqNumber = 'REQ-T-' + Date.now().toString(36).toUpperCase();
            const machineContext = reqPart.machineId
                ? machines.find(m => m.id === reqPart.machineId)?.code ?? ''
                : '';
            const req = await purchaseRequisitionsDb.create({
                reqNumber,
                status: 'soumise',
                machineId: reqPart.machineId ?? null,
                interventionId: null,
                requestedBy: meName || 'Technicien',
                notes: `Demande terrain — ${reqPart.name} (${reqPart.reference})`
                    + (machineContext ? ` · machine ${machineContext}` : '')
                    + (reqUrgency === 'urgente' ? ' · ⚠️ URGENT' : '')
                    + (reqNotes ? ` · ${reqNotes}` : ''),
            });
            await purchaseRequisitionLinesDb.create({
                requisitionId: req.id,
                sparePartId: reqPart.id,
                quantity: reqQty,
                estimatedUnitCost: reqPart.unitCost,
            });
            showToast(`✅ Demande ${reqNumber} envoyée à l'admin`);
            closeRequest();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de l\'envoi', 'error');
        } finally {
            setReqSubmitting(false);
        }
    };

    // ── Tools KPIs ──
    const availableCount = tools.filter(t => t.status === 'disponible').length;
    const myCount = tools.filter(t => t.assignedTo === meName).length;
    const maintenanceCount = tools.filter(t => t.status === 'en maintenance').length;

    const visibleTools = useMemo(() => {
        return tools.filter(t => {
            if (statusFilter === 'mine') {
                if (t.assignedTo !== meName) return false;
            } else if (statusFilter !== 'all') {
                if (t.status !== statusFilter) return false;
            }
            if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
            return true;
        });
    }, [tools, statusFilter, categoryFilter, meName]);

    // ── Parts ──
    const criticalParts = spareParts.filter(p => p.quantity <= p.minimumStock).length;
    const totalStock = spareParts.reduce((s, p) => s + p.quantity, 0);
    const visibleParts = useMemo(() => {
        const q = partSearch.trim().toLowerCase();
        const rows = q
            ? spareParts.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.reference.toLowerCase().includes(q))
            : spareParts;
        // sort: critical first, then by name
        return [...rows].sort((a, b) => {
            const ca = a.quantity <= a.minimumStock ? 0 : 1;
            const cb = b.quantity <= b.minimumStock ? 0 : 1;
            return ca - cb || a.name.localeCompare(b.name);
        });
    }, [spareParts, partSearch]);

    // ── Actions ──
    const checkout = async (tool: Tool) => {
        if (!meName) { showToast('Connectez-vous pour réserver un outil', 'error'); return; }
        setBusyId(tool.id);
        try {
            await toolsDb.update(tool.id, {
                status: 'utilisé',
                assignedTo: meName,
                lastCheckoutAt: new Date().toISOString(),
            });
            showToast(`✅ Vous avez pris « ${tool.name} »`);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erreur', 'error');
        } finally { setBusyId(null); }
    };
    const returnTool = async (tool: Tool) => {
        setBusyId(tool.id);
        try {
            await toolsDb.update(tool.id, {
                status: 'disponible',
                assignedTo: null,
                lastCheckoutAt: null,
            });
            showToast(`↩️ « ${tool.name} » rendu`);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erreur', 'error');
        } finally { setBusyId(null); }
    };

    const kpi = (label: string, value: string | number, color: string, icon: React.ReactNode) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    return (
        <>
            <Header title="Outillage & Pièces" subtitle="Vérifiez la disponibilité de votre matériel avant intervention" />
            <main style={{ padding: '24px 32px' }}>

                {/* ====== KPIs ====== */}
                <div data-tour="inv-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {kpi('Outils disponibles', availableCount, '#16a34a', <Briefcase size={13} />)}
                    {kpi('Mes outils en main', myCount, '#2563eb', <Hand size={13} />)}
                    {kpi('Pièces en stock critique', criticalParts, criticalParts ? '#dc2626' : '#16a34a', <AlertTriangle size={13} />)}
                    {kpi('Total unités en stock', totalStock, '#8b5cf6', <Package size={13} />)}
                </div>

                {/* ====== TOOLS SECTION ====== */}
                <div data-tour="inv-tools" className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Briefcase size={18} color="#f97316" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Outillage de maintenance</h3>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{visibleTools.length} / {tools.length}</span>
                    </div>

                    {/* Filters */}
                    <div style={{ padding: '12px 18px', display: 'flex', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(['all', 'disponible', 'utilisé', 'en maintenance', 'mine'] as StatusFilter[]).map(s => {
                                const on = statusFilter === s;
                                const label = s === 'all' ? 'Tous'
                                    : s === 'mine' ? 'Mes outils'
                                        : statusMeta[s].label;
                                const c = s === 'all' ? '#64748b' : s === 'mine' ? '#2563eb' : statusMeta[s].color;
                                return (
                                    <button key={s} onClick={() => setStatusFilter(s)} style={{
                                        padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                        border: `1px solid ${on ? c : 'var(--border)'}`, background: on ? c : 'var(--surface)', color: on ? 'white' : 'var(--text-secondary)',
                                    }}>{label}</button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                            <button onClick={() => setCategoryFilter('all')} style={{
                                padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                border: `1px solid ${categoryFilter === 'all' ? '#64748b' : 'var(--border)'}`, background: categoryFilter === 'all' ? '#64748b' : 'var(--surface)', color: categoryFilter === 'all' ? 'white' : 'var(--text-secondary)',
                            }}>Toutes catégories</button>
                            {(Object.keys(categoryMeta) as ToolCategory[]).map(c => {
                                const meta = categoryMeta[c];
                                const Icon = meta.icon;
                                const on = categoryFilter === c;
                                return (
                                    <button key={c} onClick={() => setCategoryFilter(c)} title={c} style={{
                                        padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
                                        border: `1px solid ${on ? meta.color : 'var(--border)'}`, background: on ? meta.color : 'var(--surface)', color: on ? 'white' : 'var(--text-secondary)', textTransform: 'capitalize',
                                    }}><Icon size={12} /> {c}</button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tool cards */}
                    {visibleTools.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 13 }}>
                            Aucun outil ne correspond à ce filtre.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, padding: 18 }}>
                            {visibleTools.map(tool => {
                                const meta = categoryMeta[tool.category];
                                const status = statusMeta[tool.status];
                                const Icon = meta.icon;
                                const isMine = tool.assignedTo === meName;
                                const isBusy = busyId === tool.id;
                                return (
                                    <div key={tool.id} style={{
                                        borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
                                        border: `1px solid ${isMine ? '#2563eb55' : 'var(--border)'}`,
                                        background: isMine ? '#eff6ff' : 'var(--surface)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Icon size={18} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{tool.name}</div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{tool.category}</div>
                                            </div>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: status.bg, color: status.color, whiteSpace: 'nowrap' }}>
                                                {status.label}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <MapPin size={12} color="var(--text-muted)" /> {tool.location}
                                        </div>
                                        {tool.assignedTo && (
                                            <div style={{ fontSize: 11.5, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <Hand size={12} /> Pris par <b>{tool.assignedTo}</b>
                                                {tool.lastCheckoutAt && (
                                                    <span style={{ color: 'var(--text-muted)' }}>· <Clock size={10} style={{ verticalAlign: -1 }} /> il y a {hoursSince(tool.lastCheckoutAt)}</span>
                                                )}
                                            </div>
                                        )}
                                        {tool.notes && (
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>« {tool.notes} »</div>
                                        )}
                                        <div style={{ marginTop: 'auto' }}>
                                            {tool.status === 'en maintenance' ? (
                                                <div style={{ fontSize: 11.5, color: '#d97706', fontWeight: 600, textAlign: 'center', padding: '6px 0' }}>
                                                    Non disponible
                                                </div>
                                            ) : isMine ? (
                                                <button onClick={() => returnTool(tool)} disabled={isBusy} style={{
                                                    width: '100%', padding: '8px', borderRadius: 9, border: '1px solid #2563eb',
                                                    background: 'white', color: '#2563eb', fontWeight: 700, cursor: isBusy ? 'wait' : 'pointer', fontSize: 13,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                }}>
                                                    <RotateCcw size={14} /> Rendre l&apos;outil
                                                </button>
                                            ) : tool.status === 'disponible' ? (
                                                <button onClick={() => checkout(tool)} disabled={isBusy} style={{
                                                    width: '100%', padding: '8px', borderRadius: 9, border: 'none',
                                                    background: 'linear-gradient(135deg,#f97316,#ea580c)', color: 'white', fontWeight: 700, cursor: isBusy ? 'wait' : 'pointer', fontSize: 13,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                }}>
                                                    <Hand size={14} /> Prendre l&apos;outil
                                                </button>
                                            ) : (
                                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
                                                    Indisponible — utilisé ailleurs
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ====== SPARE PARTS SECTION ====== */}
                <div data-tour="inv-parts" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Package size={18} color="#f59e0b" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Pièces de rechange — stock & emplacement</h3>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{visibleParts.length} / {spareParts.length}</span>
                    </div>

                    {/* Search */}
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ position: 'relative', maxWidth: 420 }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input value={partSearch} onChange={e => setPartSearch(e.target.value)}
                                placeholder="Chercher par nom ou référence (ex: SKF, NSF…)"
                                style={{ width: '100%', padding: '9px 14px 9px 36px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                    </div>

                    {/* Parts table */}
                    {visibleParts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)', fontSize: 13 }}>
                            Aucune pièce trouvée.
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>Pièce</th><th>Référence</th><th>En stock</th><th>Seuil mini.</th><th>Où la trouver</th><th>Machine</th><th></th>
                                </tr></thead>
                                <tbody>
                                    {visibleParts.map(p => {
                                        const critical = p.quantity <= p.minimumStock;
                                        const m = p.machineId ? machines.find(x => x.id === p.machineId) : null;
                                        return (
                                            <tr key={p.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                                </td>
                                                <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.reference}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
                                                        padding: '3px 10px', borderRadius: 100,
                                                        background: critical ? '#fef2f2' : '#f0fdf4',
                                                        color: critical ? '#dc2626' : '#16a34a',
                                                    }}>
                                                        {p.quantity}{critical && <AlertTriangle size={11} />}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{p.minimumStock}</td>
                                                <td style={{ fontSize: 12.5 }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                        <MapPin size={12} color="var(--text-muted)" /> {partLocation(p, machines)}
                                                    </span>
                                                </td>
                                                <td>
                                                    {m ? (
                                                        <Link href={`/machines/${m.id}`} style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            {m.code} <ArrowRight size={11} />
                                                        </Link>
                                                    ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                                                </td>
                                                <td>
                                                    <button onClick={() => openRequest(p)} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                                        padding: '5px 10px', fontSize: 12, fontWeight: 700,
                                                        borderRadius: 8, border: '1px solid #fb923c',
                                                        background: '#fff7ed', color: '#c2410c',
                                                        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                                                    }} title="Créer une demande d'achat pré-remplie">
                                                        <ShoppingCart size={12} /> Demander
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ====== TIP CARD ====== */}
                <div style={{ marginTop: 22, padding: '14px 18px', borderRadius: 12, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12.5, color: 'var(--primary)', lineHeight: 1.55 }}>
                        <b>Préparation d&apos;intervention</b> — avant de partir sur une machine, vérifiez que l&apos;outil
                        dont vous avez besoin est <b>disponible</b> et que les <b>pièces de rechange</b> sont en
                        stock. Si un outil est déjà pris, vous voyez par qui ; si une pièce manque, l&apos;onglet
                        Approvisionnement vous permet d&apos;en demander une.
                    </div>
                </div>
            </main>

            {/* T4 — Spare-part request modal */}
            {reqPart && (
                <Modal isOpen={true} onClose={closeRequest} title={`Demander : ${reqPart.name}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            Référence <b style={{ fontFamily: 'monospace' }}>{reqPart.reference}</b>
                            {' '}— stock actuel <b>{reqPart.quantity}</b> (seuil {reqPart.minimumStock}).
                            {reqPart.machineId && (
                                <> Machine concernée&nbsp;: <b>{machines.find(m => m.id === reqPart.machineId)?.code ?? '—'}</b>.</>
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quantité demandée</label>
                            <input type="number" min={1} className="input" value={reqQty}
                                onChange={e => setReqQty(Math.max(1, Number(e.target.value) || 1))} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Urgence</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {(['normale', 'urgente'] as const).map(u => (
                                    <button key={u} type="button" onClick={() => setReqUrgency(u)} style={{
                                        flex: 1, padding: '10px 12px', borderRadius: 10,
                                        border: '1px solid ' + (reqUrgency === u ? (u === 'urgente' ? '#dc2626' : '#f97316') : 'var(--border)'),
                                        background: reqUrgency === u ? (u === 'urgente' ? '#fef2f2' : '#fff7ed') : 'var(--surface)',
                                        color: reqUrgency === u ? (u === 'urgente' ? '#dc2626' : '#c2410c') : 'var(--text-secondary)',
                                        fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                    }}>{u === 'urgente' ? '⚠️ Urgente' : 'Normale'}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note (optionnel)</label>
                            <textarea className="input" rows={2} value={reqNotes}
                                onChange={e => setReqNotes(e.target.value)}
                                placeholder="Ex. cassée pendant l'intervention de ce matin..." />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                            <button type="button" onClick={closeRequest} className="btn btn-secondary">Annuler</button>
                            <button type="button" onClick={submitRequest} disabled={reqSubmitting} style={{
                                padding: '10px 18px', borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                color: 'white', fontWeight: 700, fontSize: 13.5,
                                cursor: reqSubmitting ? 'wait' : 'pointer', opacity: reqSubmitting ? 0.7 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                                <ShoppingCart size={15} /> {reqSubmitting ? 'Envoi…' : 'Envoyer la demande'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
