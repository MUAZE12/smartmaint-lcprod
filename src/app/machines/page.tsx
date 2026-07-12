'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import ImageUpload from '@/components/ui/ImageUpload';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/context/AppContext';
import { useData } from '@/context/DataContext';
import { machinesDb } from '@/lib/db';
import { getMachineKPI, getCriticalityLevel } from '@/lib/calculations';
import type { Machine, MachineType } from '@/lib/types';
import {
    Plus, Search, Filter, Cpu, Edit, Trash2, Eye, MapPin, DollarSign, AlertTriangle, Zap, Ruler, FileText, Upload, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useMemo, useRef, useEffect } from 'react';

const emptyForm = {
    code: '', name: '', type: 'Réception' as MachineType, workshop: '', location: '',
    line: '', function: '',
    installationDate: '', hourlyDowntimeCost: 0, importanceLevel: 5,
    status: 'opérationnelle' as Machine['status'],
    imageUrl: undefined as string | undefined,
    manufacturer: '', model: '', serialNumber: '',
    voltage: undefined as number | undefined, power: undefined as number | undefined, amperage: undefined as number | undefined,
    airPressure: undefined as number | undefined, waterConsumption: undefined as number | undefined,
    length: undefined as number | undefined, width: undefined as number | undefined,
    height: undefined as number | undefined, weight: undefined as number | undefined,
    manualFileName: undefined as string | undefined,
    mainCounterUnit: 'heures',
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'opérationnelle': { label: 'Opérationnelle', color: '#22c55e', bg: '#f0fdf4' },
    'en panne': { label: 'En panne', color: '#ef4444', bg: '#fef2f2' },
    'en maintenance': { label: 'En maintenance', color: '#f59e0b', bg: '#fffbeb' },
    'arrêtée': { label: 'Arrêtée', color: '#64748b', bg: '#f1f5f9' },
};

export default function MachinesPage() {
    const { showToast } = useToast();
    const { t, formatCurrency } = useApp();
    // ── Live data from Supabase via DataContext (real-time subscribed) ──
    const { machines: machineList, loading } = useData();

    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'technical'>('general');
    const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // Honor ?status= / ?type= so dashboard widgets can deep-link here
    // pre-filtered. Re-runs on every URL change (router-driven navigation
    // keeps the page mounted, so a simple mount-only effect missed updates
    // when the user came back from /dashboard with a different filter).
    // Tutorial escape hatch — the demo's per-character `type` action races
    // React-controlled inputs in this multi-tab form (image upload + grids
    // wrapping the inputs). Without this, the form was being submitted
    // empty and the save was rejected silently, and the cursor wandered to
    // a row that never appeared.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as Partial<typeof emptyForm> | undefined;
            if (!detail) return;
            setForm(prev => ({ ...prev, ...detail }));
        };
        window.addEventListener('smartmaint-demo-set-machine-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-machine-form', handler);
    }, []);

    const searchParams = useSearchParams();
    useEffect(() => {
        const s = searchParams.get('status');
        const t = searchParams.get('type');
        setFilterStatus(s || 'all');
        setFilterType(t || 'all');
    }, [searchParams]);

    const types = useMemo(() => [...new Set(machineList.map(m => m.type))], [machineList]);

    const filtered = machineList.filter(m => {
        const matchSearch = m.code.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === 'all' || m.status === filterStatus;
        const matchType = filterType === 'all' || m.type === filterType;
        return matchSearch && matchStatus && matchType;
    });

    const openCreate = () => {
        setEditingMachine(null); setForm(emptyForm); setActiveTab('general'); setIsModalOpen(true);
    };

    const openEdit = (m: Machine) => {
        setEditingMachine(m);
        setForm({
            code: m.code, name: m.name, type: m.type, workshop: m.workshop,
            location: m.location,
            line: m.line || '', function: m.function || '',
            installationDate: m.installationDate,
            hourlyDowntimeCost: m.hourlyDowntimeCost, importanceLevel: m.importanceLevel,
            status: m.status, imageUrl: m.imageUrl,
            manufacturer: m.manufacturer || '', model: m.model || '', serialNumber: m.serialNumber || '',
            voltage: m.voltage, power: m.power, amperage: m.amperage,
            airPressure: m.airPressure, waterConsumption: m.waterConsumption,
            length: m.length, width: m.width, height: m.height, weight: m.weight,
            manualFileName: m.manualFileName, mainCounterUnit: m.mainCounterUnit || 'heures',
        });
        setActiveTab('general'); setIsModalOpen(true);
    };

    // ── Persist to Supabase. Real-time subscription updates the UI. ──
    const handleSave = async () => {
        if (!form.code.trim() || !form.name.trim()) {
            showToast('Code et nom sont obligatoires', 'error');
            return;
        }
        setSaving(true);
        try {
            // PostgreSQL rejects "" for date/numeric columns — coerce to null.
            const payload = {
                ...form,
                installationDate: form.installationDate?.trim() ? form.installationDate : null,
                manufacturer: form.manufacturer || null,
                model: form.model || null,
                serialNumber: form.serialNumber || null,
                manualFileName: form.manualFileName || null,
                imageUrl: form.imageUrl || null,
            };
            if (editingMachine) {
                await machinesDb.update(editingMachine.id, payload as unknown as Partial<Machine>);
                showToast('Machine mise à jour avec succès');
            } else {
                await machinesDb.create({ ...(payload as unknown as Omit<Machine, 'id' | 'createdAt'>), criticalityScore: 0 });
                showToast('Machine créée avec succès');
            }
            setIsModalOpen(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement';
            showToast(msg, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await machinesDb.remove(deleteTarget.id);
            showToast('Machine supprimée', 'error');
            setDeleteTarget(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erreur lors de la suppression';
            showToast(msg, 'error');
        } finally {
            setDeleting(false);
        }
    };

    const updateForm = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

    const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'application/pdf') { updateForm('manualFileName', file.name); }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px 14px', borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--background)',
        fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s',
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
    };
    const sectionTitle = (icon: React.ReactNode, text: string): React.ReactNode => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 4, marginTop: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
            {icon} {text}
        </div>
    );

    return (
        <>
            <Header title={t('page.machines.title')} subtitle={t('page.machines.subtitle')} />
            <main style={{ padding: '24px 32px' }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <div data-tour="machines-search" style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="input" placeholder={t('action.search')} value={search} onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 40, fontSize: 14, padding: '10px 14px 10px 40px' }} />
                    </div>
                    <Filter size={16} color="var(--text-muted)" />
                    <select data-tour="machines-filter-status" className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 160, padding: '10px 14px', fontSize: 14 }}>
                        <option value="all">{t('common.all')}</option>
                        <option value="opérationnelle">{t('status.operational')}</option>
                        <option value="en panne">{t('status.broken')}</option>
                        <option value="en maintenance">{t('status.maintenance')}</option>
                    </select>
                    <select data-tour="machines-filter-type" className="input" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 160, padding: '10px 14px', fontSize: 14 }}>
                        <option value="all">{t('common.all')}</option>
                        {types.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                    </select>
                    <button onClick={openCreate} data-tour="page-add" style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                        borderRadius: 8, background: 'var(--primary)',
                        color: 'white', border: 'none', fontWeight: 600, fontSize: 13.5,
                        cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease',
                    }}>
                        <Plus size={18} /> {t('machine.create')}
                    </button>
                </div>

                {/* Empty / loading state */}
                {loading && machineList.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Chargement des machines…</p>
                    </div>
                )}
                {!loading && machineList.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <Cpu size={40} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune machine. Cliquez sur « {t('machine.create')} » pour commencer.</p>
                    </div>
                )}

                {/* Cards Grid */}
                <div data-tour="machines-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                    {filtered.map(m => {
                        const kpi = getMachineKPI(m.id);
                        const st = statusConfig[m.status] ?? statusConfig['opérationnelle'];
                        const critLevel = getCriticalityLevel(kpi.criticalityScore);
                        return (
                            <div key={m.id} data-tour="machines-card" data-machine-code={m.code} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-light)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                            {m.imageUrl ? (
                                                <img src={m.imageUrl} alt={m.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eef2fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Cpu size={19} color="#0b3a86" />
                                                </div>
                                            )}
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 650, fontSize: 14, letterSpacing: '-0.005em', color: 'var(--text-primary)', fontFamily: 'ui-monospace, "JetBrains Mono", "Courier New", monospace' }}>{m.code}</div>
                                                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: st.bg, color: st.color, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0 }}>{st.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {m.workshop || '—'}</span>
                                        {m.line && <span>· {m.line}</span>}
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><DollarSign size={11} /> {formatCurrency(m.hourlyDowntimeCost)}/h</span>
                                    </div>
                                    {m.function && (
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.45, borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
                                            {m.function}
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{
                                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                                        background: critLevel === 'élevé' ? '#fbecec' : critLevel === 'moyen' ? '#fbf1e3' : '#ecf7f0',
                                        color: critLevel === 'élevé' ? '#b91c1c' : critLevel === 'moyen' ? '#b45309' : '#0e7c3f',
                                        textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                                    }}>
                                        {critLevel} · {kpi.criticalityScore.toFixed(0)}
                                    </span>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <Link href={`/machines/${m.id}`} title="Ouvrir la fiche" style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none', transition: 'background 0.12s ease, color 0.12s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                        ><Eye size={14} /></Link>
                                        <button onClick={() => openEdit(m)} title="Modifier" style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', transition: 'background 0.12s ease, color 0.12s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                        ><Edit size={14} /></button>
                                        <button data-tour="machines-card-delete" onClick={() => setDeleteTarget(m)} title="Supprimer" style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', transition: 'background 0.12s ease, color 0.12s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#fbecec'; e.currentTarget.style.color = '#b91c1c'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                        ><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ========================= CREATE / EDIT MODAL ========================= */}
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                    title={editingMachine ? `${t('machine.edit')} ${editingMachine.code}` : t('machine.create')} size="lg"
                    footer={<>
                        <button data-tour="machine-form-cancel" onClick={() => setIsModalOpen(false)} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: saving ? 0.5 : 1 }}>{t('action.cancel')}</button>
                        <button data-tour="machine-form-save" onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1, transition: 'background 0.15s ease' }}>
                            {saving && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                            {editingMachine ? t('action.update') : t('action.save')}
                        </button>
                    </>}>

                    {/* Image Upload */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                        <ImageUpload value={form.imageUrl} onChange={(url) => updateForm('imageUrl', url)} shape="square" size={140} label={t('machine.uploadImage')} />
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface-hover)', borderRadius: 10, padding: 4 }}>
                        {[
                            { key: 'general' as const, label: t('machine.tabGeneral') },
                            { key: 'technical' as const, label: t('machine.tabTechnical') },
                        ].map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                                flex: 1, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                background: activeTab === tab.key ? 'white' : 'transparent',
                                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                            }}>{tab.label}</button>
                        ))}
                    </div>

                    {activeTab === 'general' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div><label style={labelStyle}>{t('machine.code')} *</label><input style={inputStyle} placeholder="Ex: REM-002" value={form.code} onChange={e => updateForm('code', e.target.value)} /></div>
                                <div><label style={labelStyle}>{t('machine.name')} *</label><input style={inputStyle} placeholder="Ex: Remplisseuse automatique" value={form.name} onChange={e => updateForm('name', e.target.value)} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div><label style={labelStyle}>{t('machine.type')}</label>
                                    <select style={inputStyle} value={form.type} onChange={e => updateForm('type', e.target.value)}>
                                        <option value="Réception">Réception</option><option value="Préparation">Préparation</option><option value="Production">Production</option><option value="Remplissage">Remplissage</option><option value="Conditionnement">Conditionnement</option><option value="Expédition">Expédition</option><option value="Utilités">Utilités</option>
                                    </select>
                                </div>
                                <div><label style={labelStyle}>{t('machine.workshop')}</label><input style={inputStyle} placeholder="Ex: Ligne de conditionnement" value={form.workshop} onChange={e => updateForm('workshop', e.target.value)} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Ligne</label>
                                    <input style={inputStyle} placeholder="Ex: Ligne 1, Réception, Préparation, Général…" value={form.line} onChange={e => updateForm('line', e.target.value)} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Fonction</label>
                                    <input style={inputStyle} placeholder="Ex: Mélange produit, Pose étiquettes…" value={form.function} onChange={e => updateForm('function', e.target.value)} />
                                </div>
                            </div>
                            <div><label style={labelStyle}>{t('machine.location')}</label><input style={inputStyle} placeholder="Ex: Hall production — Ligne 1" value={form.location} onChange={e => updateForm('location', e.target.value)} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                <div><label style={labelStyle}>{t('machine.manufacturer')}</label><input style={inputStyle} placeholder="Ex: Tetra Pak" value={form.manufacturer} onChange={e => updateForm('manufacturer', e.target.value)} /></div>
                                <div><label style={labelStyle}>{t('machine.model')}</label><input style={inputStyle} placeholder="Ex: A3/Flex" value={form.model} onChange={e => updateForm('model', e.target.value)} /></div>
                                <div><label style={labelStyle}>{t('machine.serialNumber')}</label><input style={inputStyle} placeholder="Ex: TP-2020-71542" value={form.serialNumber} onChange={e => updateForm('serialNumber', e.target.value)} /></div>
                            </div>
                            <div><label style={labelStyle}>{t('machine.status')}</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {Object.entries(statusConfig).map(([key, val]) => (
                                        <button key={key} onClick={() => updateForm('status', key)} style={{
                                            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                            border: form.status === key ? `2px solid ${val.color}` : '2px solid var(--border)',
                                            background: form.status === key ? val.bg : 'var(--surface)',
                                            color: form.status === key ? val.color : 'var(--text-muted)',
                                        }}>{val.label}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'technical' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div><label style={labelStyle}>{t('machine.installDate')}</label><input type="date" style={inputStyle} value={form.installationDate} onChange={e => updateForm('installationDate', e.target.value)} /></div>

                            {sectionTitle(<Zap size={14} />, 'Spécifications Électriques')}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div><label style={labelStyle}>{t('machine.voltage')}</label><input type="number" style={inputStyle} value={form.voltage ?? ''} onChange={e => updateForm('voltage', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.power')}</label><input type="number" style={inputStyle} value={form.power ?? ''} onChange={e => updateForm('power', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.amperage')}</label><input type="number" style={inputStyle} value={form.amperage ?? ''} onChange={e => updateForm('amperage', e.target.value ? +e.target.value : undefined)} /></div>
                            </div>

                            {sectionTitle(<span>💧</span>, 'Réseaux')}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelStyle}>{t('machine.airPressure')}</label><input type="number" style={inputStyle} value={form.airPressure ?? ''} onChange={e => updateForm('airPressure', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.waterConsumption')}</label><input type="number" style={inputStyle} value={form.waterConsumption ?? ''} onChange={e => updateForm('waterConsumption', e.target.value ? +e.target.value : undefined)} /></div>
                            </div>

                            {sectionTitle(<Ruler size={14} />, 'Dimensions & Poids')}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                                <div><label style={labelStyle}>{t('machine.length')}</label><input type="number" style={inputStyle} value={form.length ?? ''} onChange={e => updateForm('length', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.width')}</label><input type="number" style={inputStyle} value={form.width ?? ''} onChange={e => updateForm('width', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.height')}</label><input type="number" style={inputStyle} value={form.height ?? ''} onChange={e => updateForm('height', e.target.value ? +e.target.value : undefined)} /></div>
                                <div><label style={labelStyle}>{t('machine.weight')}</label><input type="number" style={inputStyle} value={form.weight ?? ''} onChange={e => updateForm('weight', e.target.value ? +e.target.value : undefined)} /></div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelStyle}>{t('machine.downtimeCost')}</label><input type="number" style={inputStyle} value={form.hourlyDowntimeCost} onChange={e => updateForm('hourlyDowntimeCost', +e.target.value)} /></div>
                                <div>
                                    <label style={labelStyle}>{t('machine.importance')}</label>
                                    <input type="range" min={1} max={10} value={form.importanceLevel} onChange={e => updateForm('importanceLevel', +e.target.value)} style={{ width: '100%', marginTop: 8 }} />
                                    <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>{form.importanceLevel}/10</div>
                                </div>
                            </div>

                            {sectionTitle(<FileText size={14} />, 'Documentation & Compteur')}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={labelStyle}>{t('machine.manual')}</label>
                                    <button onClick={() => pdfInputRef.current?.click()} style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        border: '1px dashed var(--border)', background: 'var(--surface-hover)',
                                        fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                        color: form.manualFileName ? 'var(--text-primary)' : 'var(--text-muted)',
                                    }}>
                                        <Upload size={14} /> {form.manualFileName || t('machine.uploadPdf')}
                                    </button>
                                    <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfUpload} style={{ display: 'none' }} />
                                </div>
                                <div>
                                    <label style={labelStyle}>{t('machine.counterUnit')}</label>
                                    <select style={inputStyle} value={form.mainCounterUnit} onChange={e => updateForm('mainCounterUnit', e.target.value)}>
                                        <option value="heures">Heures de marche</option>
                                        <option value="litres">Litres traités</option>
                                        <option value="cycles">Cycles de remplissage</option>
                                        <option value="bouteilles">Bouteilles produites</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>

                {/* Delete Confirmation */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('common.delete.title')} size="sm"
                    footer={<>
                        <button data-tour="machine-delete-cancel" onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: deleting ? 0.5 : 1 }}>{t('action.cancel')}</button>
                        <button data-tour="machine-delete-confirm" onClick={handleDelete} disabled={deleting} style={{ padding: '9px 18px', borderRadius: 8, background: '#b91c1c', color: 'white', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: deleting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: deleting ? 0.7 : 1, transition: 'background 0.15s ease' }}>
                            {deleting && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                            {t('action.delete')}
                        </button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <AlertTriangle size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{t('action.delete')} <b>{deleteTarget?.code}</b> ?</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{deleteTarget?.name} — {t('common.delete.confirm')}</p>
                    </div>
                </Modal>
            </main>
            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
}
