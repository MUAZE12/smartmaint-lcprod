'use client';

import Header from '@/components/Header';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import MediaViewer from '@/components/MediaViewer';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { interventionsDb, interventionPartsDb, sparePartsDb } from '@/lib/db';
import type { Intervention, InterventionPart } from '@/lib/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    Plus, CalendarPlus, Filter, Search, Clock, CheckCircle, AlertTriangle, XCircle,
    ChevronRight, ChevronLeft, Wrench, Shield, Eye, Stamp, Trash2, LayoutGrid, List, GripVertical, CalendarDays,
    Package, Play, ClipboardList, Paperclip, Film,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'planifiée': { label: 'Planifiée', color: '#64748b', bg: '#f1f5f9' },
    'en cours': { label: 'En cours', color: '#f59e0b', bg: '#fffbeb' },
    'terminée': { label: 'Terminée', color: '#22c55e', bg: '#f0fdf4' },
    'clôturée': { label: 'Clôturée', color: '#8b5cf6', bg: '#f5f3ff' },
    'annulée': { label: 'Annulée', color: '#ef4444', bg: '#fef2f2' },
};

const typeColors: Record<string, string> = {
    'corrective': '#ef4444', 'préventive': '#22c55e', 'conditionnelle': '#f59e0b', 'améliorative': '#3b82f6',
};

// Work-order lifecycle stages, in order.
const WO_STAGES: Intervention['status'][] = ['planifiée', 'en cours', 'terminée', 'clôturée'];

const urgencyLevels = [
    { value: 'low', label: 'Faible', color: '#22c55e' },
    { value: 'medium', label: 'Moyen', color: '#f59e0b' },
    { value: 'critical', label: 'Critique', color: '#ef4444' },
];

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--background)',
    fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none',
};
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const woActionBtn = (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '12px', borderRadius: 10, border: 'none',
    background: color, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
});

export default function InterventionsPage() {
    const { showToast } = useToast();
    const { interventions: intList, machines, technicians, spareParts, interventionParts } = useData();
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'inprogress' | 'validate'>('all');

    // Slide-over for planning
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [planForm, setPlanForm] = useState({
        description: '', type: 'préventive' as Intervention['interventionType'],
        urgency: 'medium', machineId: '', technicianId: '',
        startDate: '', startTime: '08:00', duration: 2,
        details: '', safetyLock: false, safetyPPE: true,
        parts: [] as string[],
    });

    // Validation slide-over
    const [validationTarget, setValidationTarget] = useState<Intervention | null>(null);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showApproved, setShowApproved] = useState(false);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Intervention | null>(null);

    // Work-order detail drawer
    const [woTarget, setWoTarget] = useState<Intervention | null>(null);
    const [woPartId, setWoPartId] = useState('');
    const [woPartQty, setWoPartQty] = useState(1);
    const [viewingMedia, setViewingMedia] = useState<{ src: string; type: 'photo' | 'video' } | null>(null);

    // View mode + Kanban/Calendar drag-and-drop
    const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'calendar'>('table');
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

    // Tutorial escape hatch — lets the demo jump the calendar to a month
    // that actually has interventions to point at (current month may be
    // empty on a fresh install, leaving the demo with nothing to drag).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { iso?: string; offset?: number } | undefined;
            if (!detail) return;
            if (detail.iso) {
                const d = new Date(detail.iso); d.setDate(1); d.setHours(0, 0, 0, 0);
                setCalMonth(d);
            } else if (typeof detail.offset === 'number') {
                setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + detail.offset!); return d; });
            }
        };
        window.addEventListener('smartmaint-demo-set-cal-month', handler);
        return () => window.removeEventListener('smartmaint-demo-set-cal-month', handler);
    }, []);

    // Tutorial escape hatch — close the open validation drawer.
    useEffect(() => {
        const close = () => setValidationTarget(null);
        window.addEventListener('smartmaint-demo-close-validation', close);
        return () => window.removeEventListener('smartmaint-demo-close-validation', close);
    }, []);

    const pendingValidation = intList.filter(i => i.status === 'terminée');

    // Honor ?tab= so dashboard widgets can deep-link to a filtered view.
    useEffect(() => {
        const tab = new URLSearchParams(window.location.search).get('tab');
        if (tab === 'inprogress' || tab === 'validate' || tab === 'all') setActiveTab(tab);
    }, []);

    const filtered = useMemo(() => {
        let list = intList;
        if (activeTab === 'inprogress') list = list.filter(i => i.status === 'en cours' || i.status === 'planifiée');
        else if (activeTab === 'validate') list = list.filter(i => i.status === 'terminée');
        if (search) list = list.filter(i => i.description.toLowerCase().includes(search.toLowerCase()) || machines.find(m => m.id === i.machineId)?.code.toLowerCase().includes(search.toLowerCase()));
        return list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [intList, activeTab, search]);

    // Kanban + Calendar: apply BOTH the tab filter and the search filter so
    // switching to "En cours" or "À valider" tabs while in those views also
    // narrows the visible content. Columns of unwanted statuses simply show
    // empty / get hidden by the Kanban column gate downstream.
    const kanbanList = useMemo(() => {
        let list = intList;
        if (activeTab === 'inprogress') list = list.filter(i => i.status === 'en cours' || i.status === 'planifiée');
        else if (activeTab === 'validate') list = list.filter(i => i.status === 'terminée');
        if (search) list = list.filter(i => i.description.toLowerCase().includes(search.toLowerCase())
            || machines.find(m => m.id === i.machineId)?.code.toLowerCase().includes(search.toLowerCase()));
        return list;
    }, [intList, activeTab, search, machines]);

    // Drag a card onto a column → persist the new status
    const handleDropOnColumn = async (status: Intervention['status']) => {
        const id = draggedId;
        setDraggedId(null);
        setDragOverCol(null);
        if (!id) return;
        const int = intList.find(i => i.id === id);
        if (!int || int.status === status) return;
        try {
            const patch: Partial<Intervention> = { status };
            // Moving into a finished column stamps the end date if missing
            if ((status === 'terminée' || status === 'clôturée') && !int.endDate) {
                patch.endDate = new Date().toISOString();
            }
            await interventionsDb.update(int.id, patch);
            showToast(`Intervention → ${statusConfig[status]?.label || status}`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
    };

    // Calendar: 6×7 grid of dates, Monday-first
    const calGrid = useMemo(() => {
        const first = new Date(calMonth);
        const offset = (first.getDay() + 6) % 7;   // 0 = Monday
        const start = new Date(first);
        start.setDate(first.getDate() - offset);
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i); return d;
        });
    }, [calMonth]);

    // Drag a card onto a calendar day → reschedule (keeps the time of day)
    const handleDropOnDay = async (cellDate: Date) => {
        const id = draggedId;
        setDraggedId(null);
        setDragOverCol(null);
        if (!id) return;
        const int = intList.find(i => i.id === id);
        if (!int) return;
        const orig = new Date(int.startDate);
        const next = new Date(cellDate);
        next.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
        if (next.toDateString() === orig.toDateString()) return;
        try {
            await interventionsDb.update(int.id, { startDate: next.toISOString() });
            showToast(`Replanifiée au ${format(next, 'dd/MM/yyyy', { locale: fr })}`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
    };

    const handleCreateIntervention = async () => {
        if (!machines.length || !technicians.length) {
            showToast('Aucune machine ou technicien disponible', 'error');
            return;
        }
        setBusy(true);
        try {
            await interventionsDb.create({
                machineId: planForm.machineId || machines[0].id,
                technicianId: planForm.technicianId || technicians[0].id,
                interventionType: planForm.type,
                description: planForm.description || 'Nouvelle intervention planifiée',
                probableCause: '', actionDone: '',
                startDate: planForm.startDate ? `${planForm.startDate}T${planForm.startTime}:00Z` : new Date().toISOString(),
                endDate: null,
                downtimeHours: planForm.duration,
                laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0,
                status: 'planifiée',
            });
            setIsDrawerOpen(false);
            showToast('✅ Intervention planifiée et assignée avec succès');
            setPlanForm({ description: '', type: 'préventive', urgency: 'medium', machineId: '', technicianId: '', startDate: '', startTime: '08:00', duration: 2, details: '', safetyLock: false, safetyPPE: true, parts: [] });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de la création', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleValidate = async () => {
        if (!validationTarget) return;
        setShowApproved(true);
        // Run DB update in parallel with the celebratory animation
        try {
            await interventionsDb.update(validationTarget.id, { status: 'clôturée' });
            setTimeout(() => {
                setValidationTarget(null);
                setShowApproved(false);
                showToast('✅ Intervention validée et clôturée');
            }, 1500);
        } catch (err) {
            setShowApproved(false);
            showToast(err instanceof Error ? err.message : 'Erreur lors de la validation', 'error');
        }
    };

    const handleReject = async () => {
        if (!validationTarget) return;
        try {
            await interventionsDb.update(validationTarget.id, { status: 'en cours' });
            setIsRejectOpen(false);
            setValidationTarget(null);
            showToast('Rapport renvoyé au technicien pour correction', 'info');
            setRejectReason('');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors du rejet', 'error');
        }
    };

    const handleDeleteIntervention = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await interventionsDb.remove(deleteTarget.id);
            showToast('Intervention supprimée', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de la suppression', 'error');
        } finally {
            setBusy(false);
        }
    };

    // ── Work-order lifecycle ──
    // Re-derive from the live list so the drawer reflects realtime updates.
    const wo = woTarget ? intList.find(i => i.id === woTarget.id) ?? woTarget : null;
    const woParts = wo ? interventionParts.filter(p => p.interventionId === wo.id) : [];
    const woMachine = wo ? machines.find(m => m.id === wo.machineId) : null;
    const woTech = wo ? technicians.find(t => t.id === wo.technicianId) : null;

    const advanceWO = async (next: Intervention['status']) => {
        if (!wo) return;
        setBusy(true);
        try {
            const patch: Partial<Intervention> = { status: next };
            if (next === 'terminée' && !wo.endDate) patch.endDate = new Date().toISOString();
            await interventionsDb.update(wo.id, patch);
            showToast(`Ordre de travail → ${statusConfig[next]?.label || next}`);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const addWoPart = async () => {
        if (!wo || !woPartId || woPartQty < 1) return;
        const sp = spareParts.find(s => s.id === woPartId);
        if (!sp) return;
        setBusy(true);
        try {
            const line = woPartQty * sp.unitCost;
            await interventionPartsDb.create({
                interventionId: wo.id, sparePartId: sp.id, partName: sp.name,
                quantity: woPartQty, unitCost: sp.unitCost,
            });
            await sparePartsDb.update(sp.id, { quantity: Math.max(0, sp.quantity - woPartQty) });
            await interventionsDb.update(wo.id, {
                partsCost: (wo.partsCost || 0) + line,
                totalCost: (wo.totalCost || 0) + line,
            });
            showToast(woPartQty > sp.quantity
                ? `Pièce enregistrée — stock ${sp.name} insuffisant, vérifiez l'inventaire`
                : 'Pièce ajoutée à l\'ordre de travail');
            setWoPartId(''); setWoPartQty(1);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const removeWoPart = async (p: InterventionPart) => {
        if (!wo) return;
        setBusy(true);
        try {
            const line = p.quantity * p.unitCost;
            await interventionPartsDb.remove(p.id);
            if (p.sparePartId) {
                const sp = spareParts.find(s => s.id === p.sparePartId);
                if (sp) await sparePartsDb.update(sp.id, { quantity: sp.quantity + p.quantity });
            }
            await interventionsDb.update(wo.id, {
                partsCost: Math.max(0, (wo.partsCost || 0) - line),
                totalCost: Math.max(0, (wo.totalCost || 0) - line),
            });
            showToast('Pièce retirée de l\'ordre de travail', 'info');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    return (
        <>
            <Header title="Interventions" subtitle="Gestion et suivi des interventions" />
            <main style={{ padding: '24px 32px' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                    <div data-tour="intv-tabs" style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', borderRadius: 10, padding: 4 }}>
                        {[
                            { key: 'all' as const, label: 'Toutes', count: intList.length },
                            { key: 'inprogress' as const, label: 'En cours', count: intList.filter(i => i.status === 'en cours' || i.status === 'planifiée').length },
                            { key: 'validate' as const, label: '🔔 À Valider', count: pendingValidation.length },
                        ].map(tab => (
                            <button key={tab.key} data-tour={`intv-tab-${tab.key}`} onClick={() => setActiveTab(tab.key)} style={{
                                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                                background: activeTab === tab.key ? 'white' : 'transparent',
                                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                            }}>
                                {tab.label}
                                {tab.key === 'validate' && tab.count > 0 && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: '#ef4444', color: 'white', minWidth: 18, textAlign: 'center' }}>{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1 }} />
                    <div data-tour="intv-search" style={{ position: 'relative', minWidth: 200 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 36, padding: '8px 12px 8px 36px', fontSize: 13, width: '100%' }} />
                    </div>
                    {/* Table / Kanban view toggle */}
                    <div data-tour="intv-views" style={{ display: 'flex', gap: 2, background: 'var(--surface-hover)', borderRadius: 9, padding: 3 }}>
                        {([
                            { m: 'table' as const, icon: List, label: 'Tableau' },
                            { m: 'kanban' as const, icon: LayoutGrid, label: 'Kanban' },
                            { m: 'calendar' as const, icon: CalendarDays, label: 'Calendrier' },
                        ]).map(v => {
                            const Icon = v.icon;
                            return (
                                <button key={v.m} data-tour={`intv-view-${v.m}`} onClick={() => setViewMode(v.m)} title={v.label} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 7,
                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                    background: viewMode === v.m ? 'white' : 'transparent',
                                    color: viewMode === v.m ? 'var(--text-primary)' : 'var(--text-muted)',
                                    boxShadow: viewMode === v.m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                }}>
                                    <Icon size={15} /> {v.label}
                                </button>
                            );
                        })}
                    </div>
                    <button onClick={() => setIsDrawerOpen(true)} data-tour="page-add" style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8,
                        background: 'var(--primary)', color: 'white', border: 'none',
                        fontWeight: 600, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease',
                    }}>
                        <CalendarPlus size={16} /> Planifier une intervention
                    </button>
                </div>

                {/* Intervention table */}
                {viewMode === 'table' && (
                <div data-tour="intv-table" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Machine</th><th>Type</th><th>Description</th><th>Technicien</th><th>Date</th><th>Durée</th><th>Statut</th><th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(int => {
                                    const machine = machines.find(m => m.id === int.machineId);
                                    const tech = technicians.find(t => t.id === int.technicianId);
                                    const st = statusConfig[int.status] || statusConfig['planifiée'];
                                    const tc = typeColors[int.interventionType] || '#64748b';
                                    return (
                                        <tr key={int.id} style={{ cursor: 'pointer' }}
                                            onClick={() => setWoTarget(int)}>
                                            <td><span style={{ fontWeight: 600 }}>{machine?.code}</span></td>
                                            <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: `${tc}15`, color: tc }}>{int.interventionType}</span></td>
                                            <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{int.description}</td>
                                            <td style={{ fontSize: 13 }}>{tech?.fullName}</td>
                                            <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{format(new Date(int.startDate), 'dd/MM/yy', { locale: fr })}</td>
                                            <td>{int.downtimeHours}h</td>
                                            <td><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: st.bg, color: st.color }}>{st.label}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    {int.status === 'terminée' && (
                                                        <button onClick={(e) => { e.stopPropagation(); setValidationTarget(int); }} style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', background: '#fffbeb', padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                                                            Valider
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(int); }}
                                                        title="Supprimer l'intervention"
                                                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
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

                {/* Kanban board — drag a card to change its status */}
                {viewMode === 'kanban' && (
                    <div data-tour="intv-kanban" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + (
                        activeTab === 'inprogress' ? 2 : activeTab === 'validate' ? 1 : 4
                    ) + ', 1fr)', gap: 14, alignItems: 'start' }}>
                        {(['planifiée', 'en cours', 'terminée', 'clôturée'] as Intervention['status'][])
                            .filter(s =>
                                activeTab === 'inprogress' ? (s === 'planifiée' || s === 'en cours') :
                                activeTab === 'validate' ? s === 'terminée' :
                                true
                            )
                            .map(colStatus => {
                            const cfg = statusConfig[colStatus];
                            const cards = kanbanList
                                .filter(i => i.status === colStatus)
                                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                            const isOver = dragOverCol === colStatus;
                            return (
                                <div key={colStatus}
                                    data-tour={`intv-col-${colStatus.replace(/[éè]/g, 'e').replace(/ô/g, 'o').replace(/\s/g, '-')}`}
                                    onDragOver={e => { e.preventDefault(); setDragOverCol(colStatus); }}
                                    onDragLeave={() => setDragOverCol(c => c === colStatus ? null : c)}
                                    onDrop={() => handleDropOnColumn(colStatus)}
                                    style={{
                                        background: isOver ? `${cfg.color}12` : 'var(--surface-hover)',
                                        border: isOver ? `2px dashed ${cfg.color}` : '2px solid transparent',
                                        borderRadius: 14, padding: 10, minHeight: 220, transition: 'background 0.15s, border-color 0.15s',
                                    }}>
                                    {/* Column header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
                                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: cfg.color }} />
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{cfg.label}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '1px 8px', borderRadius: 100 }}>{cards.length}</span>
                                    </div>
                                    {/* Cards */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {cards.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
                                                Glissez une carte ici
                                            </div>
                                        )}
                                        {cards.map(int => {
                                            const machine = machines.find(m => m.id === int.machineId);
                                            const tech = technicians.find(t => t.id === int.technicianId);
                                            const tc = typeColors[int.interventionType] || '#64748b';
                                            const dragging = draggedId === int.id;
                                            return (
                                                <div key={int.id}
                                                    draggable
                                                    onDragStart={() => setDraggedId(int.id)}
                                                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                                                    // Opening the detail modal for ANY status (was: only
                                                    // 'terminée') so clicking a card from any column shows
                                                    // its info. The validation actions inside the modal are
                                                    // already gated by status.
                                                    onClick={() => setValidationTarget(int)}
                                                    style={{
                                                        background: 'var(--surface)', borderRadius: 10, padding: '12px 12px 10px',
                                                        borderLeft: `4px solid ${tc}`, border: '1px solid var(--border-light)', borderLeftWidth: 4,
                                                        cursor: 'grab', opacity: dragging ? 0.4 : 1,
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                    }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                        <GripVertical size={13} color="var(--text-muted)" />
                                                        <span style={{ fontWeight: 700, fontSize: 13 }}>{machine?.code || '—'}</span>
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: `${tc}15`, color: tc }}>{int.interventionType}</span>
                                                    </div>
                                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                        {int.description}
                                                    </p>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <span style={{
                                                                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                                                background: tech ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'var(--surface-active)',
                                                                color: 'white', fontSize: 8, fontWeight: 700,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}>
                                                                {tech ? tech.fullName.split(' ').map(n => n[0]).join('').slice(0, 2) : '—'}
                                                            </span>
                                                            {tech ? tech.fullName.split(' ')[0] : 'Non assigné'}
                                                        </span>
                                                        <span>{format(new Date(int.startDate), 'dd/MM/yy', { locale: fr })}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Calendar view — drag a card to reschedule */}
                {viewMode === 'calendar' && (
                    <div data-tour="intv-calendar" className="card" style={{ padding: 16 }}>
                        {/* Month nav */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 }}>
                            <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
                                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                <ChevronLeft size={17} />
                            </button>
                            <span style={{ fontSize: 16, fontWeight: 700, minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>
                                {format(calMonth, 'MMMM yyyy', { locale: fr })}
                            </span>
                            <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
                                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                <ChevronRight size={17} />
                            </button>
                        </div>
                        {/* Weekday header */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
                            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>
                            ))}
                        </div>
                        {/* Day grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                            {calGrid.map((cell, idx) => {
                                const inMonth = cell.getMonth() === calMonth.getMonth();
                                const isToday = cell.toDateString() === new Date().toDateString();
                                const dayInts = kanbanList.filter(i => new Date(i.startDate).toDateString() === cell.toDateString());
                                const key = cell.toISOString().slice(0, 10);
                                const isOver = dragOverCol === `cal-${key}`;
                                return (
                                    <div key={idx}
                                        onDragOver={e => { e.preventDefault(); setDragOverCol(`cal-${key}`); }}
                                        onDragLeave={() => setDragOverCol(c => c === `cal-${key}` ? null : c)}
                                        onDrop={() => handleDropOnDay(cell)}
                                        // Click on an empty area of the day → open the planner pre-filled
                                        // with this date. Existing intervention badges stop propagation
                                        // so clicking them still opens the detail drawer.
                                        onClick={(e) => {
                                            if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('[data-intv-badge]')) return;
                                            setPlanForm(f => ({ ...f, startDate: key }));
                                            setIsDrawerOpen(true);
                                        }}
                                        title="Cliquez pour planifier une intervention ce jour"
                                        style={{
                                            minHeight: 96, borderRadius: 10, padding: 6, cursor: 'pointer',
                                            background: isOver ? 'rgba(59,130,246,0.1)' : inMonth ? 'var(--surface)' : 'var(--surface-hover)',
                                            border: isOver ? '2px dashed #3b82f6' : isToday ? '2px solid #3b82f6' : '1px solid var(--border-light)',
                                            opacity: inMonth ? 1 : 0.5,
                                            transition: 'background 0.15s, border-color 0.15s',
                                        }}
                                        onMouseEnter={e => { if (inMonth && !isOver) e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
                                        onMouseLeave={e => { if (inMonth && !isOver) e.currentTarget.style.background = 'var(--surface)'; }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? '#3b82f6' : 'var(--text-muted)', marginBottom: 4, paddingLeft: 2 }}>
                                            {cell.getDate()}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            {dayInts.slice(0, 4).map(int => {
                                                const machine = machines.find(m => m.id === int.machineId);
                                                const tc = typeColors[int.interventionType] || '#64748b';
                                                return (
                                                    <div key={int.id}
                                                        data-intv-badge
                                                        draggable
                                                        onDragStart={() => setDraggedId(int.id)}
                                                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                                                        // Click ANY status to open detail (was: only terminée).
                                                        // stopPropagation so the day-cell's onClick doesn't ALSO
                                                        // fire and open the planner.
                                                        onClick={(e) => { e.stopPropagation(); setValidationTarget(int); }}
                                                        title={int.description}
                                                        style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                                                            background: `${tc}1a`, color: tc, cursor: 'grab',
                                                            borderLeft: `3px solid ${tc}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                            opacity: draggedId === int.id ? 0.4 : 1,
                                                        }}>
                                                        {machine?.code || '—'}
                                                    </div>
                                                );
                                            })}
                                            {dayInts.length > 4 && (
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>+{dayInts.length - 4} autres</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* Planning Slide-over */}
            <SlideOver
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title="📅 Planifier une Intervention"
                subtitle="Remplissez les informations pour programmer l'intervention"
                width={560}
                footer={
                    <>
                        <button onClick={() => setIsDrawerOpen(false)} className="btn btn-secondary btn-sm">Annuler</button>
                        <button data-tour="plan-save" onClick={handleCreateIntervention} className="btn btn-primary btn-sm">Créer l&apos;intervention</button>
                    </>
                }
            >
                {/* Section 1 */}
                <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={16} /> Détails de l&apos;intervention</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div><label style={labelStyle}>Description *</label><input data-tour="plan-desc" style={inputStyle} placeholder="Titre de l'intervention..." value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} /></div>
                        <div><label style={labelStyle}>Type de maintenance</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {(['préventive', 'corrective', 'améliorative', 'conditionnelle'] as const).map(t => (
                                    <button key={t} onClick={() => setPlanForm(p => ({ ...p, type: t }))} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: planForm.type === t ? `2px solid ${typeColors[t]}` : '2px solid var(--border)', background: planForm.type === t ? `${typeColors[t]}10` : 'var(--surface)', color: planForm.type === t ? typeColors[t] : 'var(--text-muted)', transition: 'all 0.2s', textTransform: 'capitalize' }}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div><label style={labelStyle}>Niveau d&apos;urgence</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {urgencyLevels.map(u => (
                                    <button key={u.value} onClick={() => setPlanForm(p => ({ ...p, urgency: u.value }))} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: planForm.urgency === u.value ? `2px solid ${u.color}` : '2px solid var(--border)', background: planForm.urgency === u.value ? `${u.color}15` : 'var(--surface)', color: planForm.urgency === u.value ? u.color : 'var(--text-muted)' }}>
                                        {u.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2 */}
                <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Filter size={16} /> Affectation</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div><label style={labelStyle}>Machine concernée</label>
                            <select data-tour="plan-machine" style={inputStyle} value={planForm.machineId} onChange={e => setPlanForm(p => ({ ...p, machineId: e.target.value }))}>
                                <option value="">Sélectionner une machine</option>
                                {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Assigné à</label>
                            <select data-tour="plan-tech" style={inputStyle} value={planForm.technicianId} onChange={e => setPlanForm(p => ({ ...p, technicianId: e.target.value }))}>
                                <option value="">Sélectionner un technicien</option>
                                {technicians.map(t => <option key={t.id} value={t.id}>{t.fullName} — {t.specialty}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section 3 */}
                <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={16} /> Planification</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div><label style={labelStyle}>Date prévue</label><input type="date" style={inputStyle} value={planForm.startDate} onChange={e => setPlanForm(p => ({ ...p, startDate: e.target.value }))} /></div>
                        <div><label style={labelStyle}>Heure de début</label><input type="time" style={inputStyle} value={planForm.startTime} onChange={e => setPlanForm(p => ({ ...p, startTime: e.target.value }))} /></div>
                        <div><label style={labelStyle}>Durée estimée (h)</label><input type="number" min={0.5} step={0.5} style={inputStyle} value={planForm.duration} onChange={e => setPlanForm(p => ({ ...p, duration: +e.target.value }))} /></div>
                    </div>
                </div>

                {/* Section 4 */}
                <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={16} /> Ressources & Consignes</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div><label style={labelStyle}>Description détaillée</label>
                            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Instructions détaillées pour le technicien..." value={planForm.details} onChange={e => setPlanForm(p => ({ ...p, details: e.target.value }))} />
                        </div>
                        <div><label style={labelStyle}>Pièces de rechange requises</label>
                            <select style={inputStyle} onChange={e => { if (e.target.value && !planForm.parts.includes(e.target.value)) setPlanForm(p => ({ ...p, parts: [...p.parts, e.target.value] })); e.target.value = ''; }}>
                                <option value="">+ Ajouter une pièce</option>
                                {spareParts.map(sp => <option key={sp.id} value={sp.id}>{sp.name} ({sp.reference})</option>)}
                            </select>
                            {planForm.parts.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {planForm.parts.map(pid => {
                                        const part = spareParts.find(s => s.id === pid);
                                        return (
                                            <span key={pid} style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 100, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {part?.name}
                                                <button onClick={() => setPlanForm(p => ({ ...p, parts: p.parts.filter(p2 => p2 !== pid) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0, fontSize: 14, fontWeight: 700 }}>×</button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                <input type="checkbox" checked={planForm.safetyLock} onChange={e => setPlanForm(p => ({ ...p, safetyLock: e.target.checked }))} style={{ width: 18, height: 18, borderRadius: 4 }} />
                                ⚡ Nécessite consignation électrique
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                <input type="checkbox" checked={planForm.safetyPPE} onChange={e => setPlanForm(p => ({ ...p, safetyPPE: e.target.checked }))} style={{ width: 18, height: 18, borderRadius: 4 }} />
                                🦺 Port des EPI obligatoire
                            </label>
                        </div>
                    </div>
                </div>
            </SlideOver>

            {/* Validation Slide-over */}
            <SlideOver
                isOpen={!!validationTarget}
                onClose={() => { setValidationTarget(null); setShowApproved(false); }}
                title="Compte-rendu d'intervention"
                subtitle={validationTarget ? `${machines.find(m => m.id === validationTarget.machineId)?.code} — À valider` : ''}
                width={560}
                footer={!showApproved ? (
                    <>
                        <button onClick={() => setIsRejectOpen(true)} style={{ padding: '9px 16px', borderRadius: 8, background: '#fbecec', border: '1px solid #f5c6c6', color: '#b91c1c', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s ease' }}>
                            ↩ Refuser
                        </button>
                        <button data-tour="wo-validate-confirm" onClick={handleValidate} style={{ padding: '9px 18px', borderRadius: 8, background: '#0e7c3f', color: 'white', border: 'none', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 0 rgba(11,18,32,0.08)', transition: 'background 0.15s ease' }}>
                            ✓ Valider et clôturer
                        </button>
                    </>
                ) : undefined}
            >
                {validationTarget && !showApproved && (
                    <>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#fffbeb', color: '#f59e0b', marginBottom: 16, display: 'inline-block' }}>
                            🔔 En attente de validation
                        </span>

                        {/* Report section */}
                        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Rapport du Technicien</h4>
                            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}><b>Cause probable :</b> {validationTarget.probableCause || 'Non renseignée'}</p>
                            <p style={{ fontSize: 14, lineHeight: 1.6 }}><b>Actions réalisées :</b> {validationTarget.actionDone || 'Non renseignées'}</p>
                        </div>

                        {/* Prévu vs Réalisé widget */}
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>📊 Prévu vs Réalisé</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Durée prévue</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>2h</div>
                                </div>
                                <div style={{ background: 'var(--surface)', border: `1px solid ${validationTarget.downtimeHours > 2 ? '#fecaca' : 'var(--border)'}`, borderRadius: 12, padding: 14, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Durée réelle</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: validationTarget.downtimeHours > 2 ? '#ef4444' : '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                        {validationTarget.downtimeHours}h
                                        {validationTarget.downtimeHours > 2 && <AlertTriangle size={16} />}
                                    </div>
                                </div>
                                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Coût prévu</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>1 500 MAD</div>
                                </div>
                                <div style={{ background: 'var(--surface)', border: `1px solid ${validationTarget.totalCost > 1500 ? '#fecaca' : 'var(--border)'}`, borderRadius: 12, padding: 14, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Coût réel</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: validationTarget.totalCost > 1500 ? '#ef4444' : '#22c55e' }}>
                                        {validationTarget.totalCost.toLocaleString()} MAD
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            <b>Technicien :</b> {technicians.find(t => t.id === validationTarget.technicianId)?.fullName}
                        </div>
                    </>
                )}

                {/* Approved stamp */}
                {showApproved && (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '24px 40px', border: '4px solid #22c55e', borderRadius: 16,
                            transform: 'rotate(-8deg)', animation: 'modalIn 0.4s ease',
                        }}>
                            <Stamp size={48} color="#22c55e" />
                            <div style={{ fontSize: 32, fontWeight: 900, color: '#22c55e', letterSpacing: '0.1em', marginTop: 8 }}>APPROUVÉ</div>
                        </div>
                    </div>
                )}
            </SlideOver>

            {/* Work-order detail Slide-over */}
            <SlideOver
                isOpen={!!wo}
                onClose={() => { setWoTarget(null); setWoPartId(''); setWoPartQty(1); }}
                title="🛠️ Ordre de travail"
                subtitle={wo && woMachine ? `${woMachine.code} — ${woMachine.name}` : ''}
                width={580}
            >
                {wo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                        {/* Lifecycle stepper */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                {WO_STAGES.map((s, i) => {
                                    const cur = WO_STAGES.indexOf(wo.status);
                                    const reached = cur >= 0 && cur >= i;
                                    const cfg = statusConfig[s];
                                    return (
                                        <div key={s} style={{ display: 'flex', alignItems: 'flex-start', flex: i < WO_STAGES.length - 1 ? 1 : 'none' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 72 }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, fontWeight: 800,
                                                    background: reached ? cfg.color : 'var(--surface-hover)',
                                                    color: reached ? 'white' : 'var(--text-muted)',
                                                    border: `2px solid ${reached ? cfg.color : 'var(--border)'}`,
                                                }}>{reached && cur > i ? '✓' : i + 1}</div>
                                                <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', color: reached ? cfg.color : 'var(--text-muted)' }}>{cfg.label}</span>
                                            </div>
                                            {i < WO_STAGES.length - 1 && (
                                                <div style={{ flex: 1, height: 3, borderRadius: 2, marginTop: 14, background: cur > i ? statusConfig[WO_STAGES[i + 1]].color : 'var(--border)' }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {wo.status === 'annulée' && (
                                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '6px 12px', borderRadius: 8, textAlign: 'center' }}>
                                    Ordre de travail annulé
                                </div>
                            )}
                        </div>

                        {/* Details */}
                        <div style={{ background: 'var(--surface-hover)', borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                            {([
                                ['Type', wo.interventionType],
                                ['Technicien', woTech?.fullName ?? 'Non assigné'],
                                ['Date prévue', format(new Date(wo.startDate), 'dd/MM/yyyy', { locale: fr })],
                                ['Durée d\'arrêt', `${wo.downtimeHours} h`],
                            ] as [string, string][]).map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k}</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{v}</div>
                                </div>
                            ))}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</div>
                                <div style={{ fontSize: 13, marginTop: 2 }}>{wo.description}</div>
                            </div>
                        </div>

                        {/* Attachments (photos + videos jointes par l'opérateur OU le technicien) */}
                        {wo.attachments && wo.attachments.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Paperclip size={16} /> Pièces jointes
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{wo.attachments.length}</span>
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                                    {wo.attachments.map((att, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setViewingMedia({ src: att.dataUrl, type: att.type })}
                                            title={`${att.type === 'photo' ? 'Photo' : 'Vidéo'} · ${new Date(att.capturedAt).toLocaleString('fr-FR')}${att.phase ? ` · ${att.phase === 'before' ? 'avant' : 'après'}` : ''}`}
                                            style={{
                                                position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden',
                                                border: '1px solid var(--border)', background: 'var(--surface-hover)',
                                                padding: 0, cursor: 'pointer', display: 'block',
                                            }}
                                        >
                                            {att.type === 'photo' ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={att.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <>
                                                    <video src={att.dataUrl} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                                                        <Film size={22} color="white" />
                                                    </div>
                                                </>
                                            )}
                                            {att.phase && (
                                                <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: att.phase === 'before' ? '#dc2626' : '#16a34a', color: 'white', textTransform: 'uppercase' }}>
                                                    {att.phase === 'before' ? 'avant' : 'après'}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Parts consumed */}
                        <div>
                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Package size={16} /> Pièces consommées
                            </h4>
                            {woParts.length === 0 && (
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0 8px' }}>Aucune pièce enregistrée sur cet ordre.</div>
                            )}
                            {woParts.map(p => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.partName}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.quantity} × {p.unitCost.toLocaleString('fr-FR')} MAD</div>
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{(p.quantity * p.unitCost).toLocaleString('fr-FR')} MAD</span>
                                    <button onClick={() => removeWoPart(p)} disabled={busy} title="Retirer" style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                            <div data-tour="wo-part-row" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <select data-tour="wo-part-select" value={woPartId} onChange={e => setWoPartId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                                    <option value="">+ Choisir une pièce…</option>
                                    {spareParts.map(sp => <option key={sp.id} value={sp.id}>{sp.name} — stock {sp.quantity}</option>)}
                                </select>
                                <input data-tour="wo-part-qty" type="number" min={1} value={woPartQty} onChange={e => setWoPartQty(Math.max(1, +e.target.value))} style={{ ...inputStyle, width: 72 }} />
                                <button data-tour="wo-part-add" onClick={addWoPart} disabled={busy || !woPartId} style={{ padding: '0 16px', borderRadius: 10, background: woPartId ? 'linear-gradient(135deg,#3b82f6,#1e40af)' : 'var(--surface-hover)', color: woPartId ? 'white' : 'var(--text-muted)', border: 'none', fontSize: 13, fontWeight: 600, cursor: busy || !woPartId ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                    Ajouter
                                </button>
                            </div>
                        </div>

                        {/* Costs */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                            {([
                                ['Main d\'œuvre', wo.laborCost, '#3b82f6'],
                                ['Pièces', wo.partsCost, '#f59e0b'],
                                ['Arrêt', wo.downtimeCost, '#ef4444'],
                                ['Total', wo.totalCost, '#16a34a'],
                            ] as [string, number, string][]).map(([k, v, c]) => (
                                <div key={k} style={{ background: 'var(--surface-hover)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: c, marginTop: 3 }}>{v.toLocaleString('fr-FR')}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>MAD</div>
                                </div>
                            ))}
                        </div>

                        {/* Lifecycle action */}
                        {wo.status === 'planifiée' && (
                            <button data-tour="wo-start" onClick={() => advanceWO('en cours')} disabled={busy} style={woActionBtn('#f59e0b')}>
                                <Play size={16} /> Démarrer l&apos;ordre de travail
                            </button>
                        )}
                        {wo.status === 'en cours' && (
                            <button data-tour="wo-finish" onClick={() => advanceWO('terminée')} disabled={busy} style={woActionBtn('#22c55e')}>
                                <CheckCircle size={16} /> Marquer comme terminé
                            </button>
                        )}
                        {wo.status === 'terminée' && (
                            <button data-tour="wo-validate-open" onClick={() => { const t = wo; setWoTarget(null); setValidationTarget(t); }} style={woActionBtn('#8b5cf6')}>
                                <ClipboardList size={16} /> Valider et clôturer
                            </button>
                        )}
                        {wo.status === 'clôturée' && (
                            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: 12, borderRadius: 10 }}>
                                ✓ Ordre de travail clôturé
                            </div>
                        )}
                    </div>
                )}
            </SlideOver>

            {/* Reject modal */}
            <Modal isOpen={isRejectOpen} onClose={() => setIsRejectOpen(false)} title="↩️ Refuser le rapport" size="sm"
                footer={
                    <>
                        <button onClick={() => setIsRejectOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button onClick={handleReject} style={{ padding: '10px 20px', borderRadius: 10, background: '#ef4444', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Envoyer le refus</button>
                    </>
                }>
                <div>
                    <label style={labelStyle}>Motif du refus</label>
                    <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="Ex: Il manque la référence de la pièce changée..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                </div>
            </Modal>

            {/* Delete confirmation modal */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'intervention" size="sm"
                footer={
                    <>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} className="btn btn-secondary btn-sm">Annuler</button>
                        <button data-tour="intv-delete-confirm" onClick={handleDeleteIntervention} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>
                }>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <AlertTriangle size={28} color="#ef4444" />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Supprimer cette intervention ?</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{deleteTarget?.description} — cette action est irréversible.</p>
                </div>
            </Modal>

            {viewingMedia && (
                <MediaViewer src={viewingMedia.src} type={viewingMedia.type} onClose={() => setViewingMedia(null)} />
            )}

            <style jsx>{`
        @keyframes modalIn { from { opacity: 0; transform: scale(0.5) rotate(-15deg); } to { opacity: 1; transform: scale(1) rotate(-8deg); } }
      `}</style>
        </>
    );
}
