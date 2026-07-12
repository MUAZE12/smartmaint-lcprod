'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import { productionBatchesDb } from '@/lib/db';
import { useState, useMemo } from 'react';
import {
    Package, Play, StopCircle, Plus, Cpu, User, Search, CheckCircle,
    AlertTriangle, Hash, Calendar, Info,
} from 'lucide-react';
import Link from 'next/link';
import type { ProductionBatch } from '@/lib/types';

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

function suggestBatchNumber(): string {
    const d = new Date();
    const yyyymmdd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `LOT-${yyyymmdd}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function ProductionBatchesPage() {
    const { user } = useAuth();
    const { productionBatches, machines } = useData();
    const meName = user?.name ?? '';

    // ── HOOKS FIRST — every useState / useMemo below runs BEFORE the
    //    role branch. Before, the operator early-return sat between the
    //    hooks, so on the first render (auth still resolving, role=undef)
    //    React ran the admin hooks; on the second render (role=operator)
    //    the early return skipped them → hook-order violation → blank page,
    //    which the user experienced as "I have to click twice to get in".
    const [search, setSearch] = useState('');
    const ordered = useMemo(() => [...productionBatches].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '')), [productionBatches]);
    const active = useMemo(() => ordered.filter(b => !b.endedAt), [ordered]);
    const ended = useMemo(() => ordered.filter(b => b.endedAt), [ordered]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ended;
        return ended.filter(b =>
            b.batchNumber.toLowerCase().includes(q) ||
            b.productName.toLowerCase().includes(q) ||
            b.operatorName.toLowerCase().includes(q)
        );
    }, [ended, search]);

    // While auth resolves show a loading placeholder — this is the ONLY
    // branch before the role-based render, so operators can't briefly see
    // the admin table. And we don't gate the operator/admin split on
    // `user` being defined — a soft session miss shouldn't leave them
    // stuck: the last-known role in localStorage lets us render the right
    // view on first paint. If nothing is known we default to the operator
    // view because the reported bug was "operator can't reach the page".
    if (typeof window !== 'undefined' && !user) {
        try {
            const cached = window.localStorage.getItem('smartmaint-last-role');
            if (cached === 'operator') return <OperatorBatchesView meName={meName} />;
        } catch { /* localStorage unavailable */ }
    }

    if (!user) {
        return (
            <>
                <Header title="Lots de production" subtitle="Chargement…" />
                <main style={{ padding: '40px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Chargement de votre session…
                </main>
            </>
        );
    }

    // Role-based branch — hooks above ran unconditionally so the order
    // stays stable across renders.
    if (user.role === 'operator') return <OperatorBatchesView meName={meName} />;

    return (
        <>
            <Header title="Lots de production" subtitle="Traçabilité HACCP — matière première vers bouteille" />
            <main style={{ padding: '24px 32px' }}>

                {/* KPIs */}
                <div data-tour="batch-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Lots en cours', value: active.length, color: '#3b82f6', icon: <Play size={13} /> },
                        { label: 'Lots terminés', value: ended.length, color: '#16a34a', icon: <CheckCircle size={13} /> },
                        { label: 'Total enregistrés', value: ordered.length, color: '#8b5cf6', icon: <Package size={13} /> },
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

                {/* Active batches. Démarrage + édition de quantité + clôture
                    sont des actions opérateur — exécutées depuis l'interface
                    opérateur. Pour admin/technicien on ne montre que la vue
                    « supervision » : lecture seule, on regarde le flux passer. */}
                <div data-tour="batch-active" className="card" style={{ padding: 0, marginBottom: 22, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Play size={18} color="#3b82f6" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Lots en cours</h3>
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Mode supervision · les actions production sont sur la tablette opérateur
                        </span>
                    </div>
                    {active.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                            Aucun lot en cours.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, padding: 18 }}>
                            {active.map(b => {
                                const m = b.machineId ? machines.find(x => x.id === b.machineId) : null;
                                const progress = b.plannedQty > 0 ? Math.min(100, Math.round((b.actualQty / b.plannedQty) * 100)) : 0;
                                return (
                                    <div key={b.id} data-tour="batch-card" data-batch-number={b.batchNumber} style={{
                                        borderRadius: 14, padding: '14px 16px',
                                        border: '1px solid #93c5fd', background: '#eff6ff',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Hash size={17} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.batchNumber}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.productName}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                                            {m && <span><Cpu size={11} style={{ verticalAlign: -1 }} /> {m.code}</span>}
                                            <span><User size={11} style={{ verticalAlign: -1 }} /> {b.operatorName}</span>
                                            <span><Calendar size={11} style={{ verticalAlign: -1 }} /> Démarré {fmtDate(b.startedAt)}</span>
                                        </div>
                                        {/* Progress bar */}
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Production</span>
                                                <span style={{ fontWeight: 700 }}>{b.actualQty} / {b.plannedQty} ({progress}%)</span>
                                            </div>
                                            <div style={{ height: 8, borderRadius: 100, background: '#dbeafe', overflow: 'hidden' }}>
                                                <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? '#16a34a' : '#3b82f6', transition: 'width 0.3s' }} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                            <span>Quantité produite : <b style={{ color: 'var(--text-primary)' }}>{b.actualQty} / {b.plannedQty}</b></span>
                                            <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
                                                Mise à jour + clôture côté opérateur
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Past batches — searchable */}
                <div data-tour="batch-history" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircle size={18} color="#16a34a" />
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Lots terminés — historique</h3>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{filtered.length} / {ended.length}</span>
                    </div>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ position: 'relative', maxWidth: 420 }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Chercher par n° de lot, produit, ou opérateur…"
                                style={{ width: '100%', padding: '9px 14px 9px 36px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                    </div>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Aucun lot terminé.</div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead><tr>
                                    <th>N° de lot</th><th>Produit</th><th>Machine</th><th>Opérateur</th>
                                    <th>Démarré</th><th>Terminé</th><th>Quantité</th>
                                </tr></thead>
                                <tbody>
                                    {filtered.map(b => {
                                        const m = b.machineId ? machines.find(x => x.id === b.machineId) : null;
                                        const yield_ = b.plannedQty > 0 ? Math.round((b.actualQty / b.plannedQty) * 100) : 0;
                                        const ok = yield_ >= 95;
                                        return (
                                            <tr key={b.id}>
                                                <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{b.batchNumber}</td>
                                                <td style={{ fontSize: 13 }}>{b.productName}</td>
                                                <td>{m ? <Link href={`/machines/${m.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{m.code}</Link> : '—'}</td>
                                                <td style={{ fontSize: 13 }}>{b.operatorName}</td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtDate(b.startedAt)}</td>
                                                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{b.endedAt ? fmtDate(b.endedAt) : '—'}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                                                        background: ok ? '#f0fdf4' : '#fffbeb',
                                                        color: ok ? '#16a34a' : '#d97706',
                                                    }}>
                                                        {ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                                                        {b.actualQty} / {b.plannedQty} · {yield_}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 22, padding: '12px 16px', borderRadius: 10, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--primary)' }}>
                    <Info size={16} />
                    Traçabilité HACCP — chaque lot est lié à une machine et un opérateur. En cas de réclamation, on remonte de la bouteille au lot, à la machine, à l&apos;opérateur, à l&apos;heure.
                </div>

            </main>
        </>
    );
}

// ============================================================
// Operator-facing Arabic view — large touch targets, plain words.
// ============================================================
function OperatorBatchesView({ meName }: { meName: string }) {
    const { productionBatches, machines } = useData();
    const { showToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        batchNumber: '', productName: '', machineId: '', plannedQty: 1000,
    });
    const [endTarget, setEndTarget] = useState<ProductionBatch | null>(null);

    const openCreate = () => {
        setForm({ batchNumber: suggestBatchNumber(), productName: '', machineId: '', plannedQty: 1000 });
        setIsOpen(true);
    };

    const startBatch = async () => {
        if (!form.batchNumber.trim() || !form.productName.trim()) {
            showToast('رقم الدفعة واسم المنتج مطلوبان', 'error'); return;
        }
        setBusy(true);
        try {
            await productionBatchesDb.create({
                batchNumber: form.batchNumber.trim(),
                productName: form.productName.trim(),
                machineId: form.machineId || null,
                operatorName: meName || 'مشغل',
                startedAt: new Date().toISOString(),
                endedAt: null,
                plannedQty: form.plannedQty,
                actualQty: 0,
                notes: '',
            });
            showToast('✅ تم بدء الدفعة');
            setIsOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'خطأ', 'error');
        } finally { setBusy(false); }
    };

    const confirmEndBatch = async () => {
        if (!endTarget) return;
        const b = endTarget;
        setBusy(true);
        try {
            await productionBatchesDb.update(b.id, { endedAt: new Date().toISOString() });
            showToast(`✅ تم إنهاء الدفعة ${b.batchNumber}`);
            setEndTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'خطأ', 'error');
        } finally { setBusy(false); }
    };

    // Only show this operator's own batches
    const mine = useMemo(
        () => [...productionBatches]
            .filter(b => b.operatorName === meName)
            .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '')),
        [productionBatches, meName]);
    const active = mine.filter(b => !b.endedAt);
    const past = mine.filter(b => b.endedAt).slice(0, 12);

    return (
        <>
            <Header title="دفعات الإنتاج" subtitle={`مرحباً ${meName} — لتتبّع دفعاتك`} />
            <main style={{ padding: '20px 20px 40px', maxWidth: 720, margin: '0 auto' }} className="animate-fade-in">

                {/* ── Giant start button ── */}
                <button onClick={openCreate} style={{
                    width: '100%', padding: '24px', borderRadius: 22, border: 'none',
                    background: '#0e7c3f',
                    color: 'white', fontWeight: 800, fontSize: 18,
                    cursor: 'pointer', boxShadow: '0 16px 36px rgba(16,185,129,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                    fontFamily: 'inherit',
                }}>
                    <Plus size={26} /> بدء دفعة جديدة
                </button>

                {/* ── Active ── */}
                <h2 style={{ marginTop: 28, marginBottom: 12, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Play size={18} color="#10b981" /> دفعاتي الجارية
                </h2>
                {active.length === 0 ? (
                    <div style={{ padding: 26, textAlign: 'center', borderRadius: 16, background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 14 }}>
                        لا توجد دفعة جارية الآن.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {active.map(b => {
                            const m = b.machineId ? machines.find(x => x.id === b.machineId) : null;
                            const pct = b.plannedQty > 0 ? Math.min(100, Math.round((b.actualQty / b.plannedQty) * 100)) : 0;
                            return (
                                <div key={b.id} style={{
                                    padding: 18, borderRadius: 18,
                                    background: '#ecf7f0',
                                    border: '1px solid #6ee7b7',
                                }}>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#065f46' }}>{b.batchNumber}</div>
                                    <div style={{ fontSize: 14, color: '#065f46', opacity: 0.85, marginBottom: 10 }}>{b.productName}</div>
                                    {m && <div style={{ fontSize: 12, color: '#065f46', opacity: 0.8, marginBottom: 8 }}>الآلة : <b>{m.code}</b></div>}
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                                        <span style={{ fontSize: 32, fontWeight: 800, color: '#047857' }}>{b.actualQty}</span>
                                        <span style={{ fontSize: 14, color: '#065f46', opacity: 0.7 }}>/ {b.plannedQty}</span>
                                        <span style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 800, color: '#047857' }}>{pct} %</span>
                                    </div>
                                    <div style={{ height: 10, borderRadius: 100, background: 'rgba(255,255,255,0.6)', overflow: 'hidden', marginBottom: 14 }}>
                                        <div style={{ width: pct + '%', height: '100%', background: '#0e7c3f', transition: 'width 0.3s' }} />
                                    </div>
                                    <div style={{ fontSize: 11.5, color: '#065f46', opacity: 0.7, marginBottom: 10 }}>
                                        لتحديث الكمية، استخدم زر +1 / +10 في الصفحة الرئيسية.
                                    </div>
                                    <button onClick={() => setEndTarget(b)} disabled={busy} data-tour="op-batch-end" style={{
                                        width: '100%', padding: 14, borderRadius: 12, border: 'none',
                                        background: '#b91c1c',
                                        color: 'white', fontWeight: 800, fontSize: 15,
                                        cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    }}>
                                        <StopCircle size={18} /> إنهاء الدفعة
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Past ── */}
                {past.length > 0 && (
                    <>
                        <h2 style={{ marginTop: 28, marginBottom: 12, fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle size={18} color="#16a34a" /> دفعاتي السابقة
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {past.map(b => {
                                const m = b.machineId ? machines.find(x => x.id === b.machineId) : null;
                                const yield_ = b.plannedQty > 0 ? Math.round((b.actualQty / b.plannedQty) * 100) : 0;
                                const ok = yield_ >= 95;
                                return (
                                    <div key={b.id} style={{
                                        padding: '12px 16px', borderRadius: 14,
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{b.batchNumber}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.productName}{m ? ` — ${m.code}` : ''}</div>
                                        </div>
                                        <span style={{
                                            fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 100,
                                            background: ok ? '#f0fdf4' : '#fffbeb',
                                            color: ok ? '#15803d' : '#b45309',
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}>{ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />} {b.actualQty}/{b.plannedQty} · {yield_}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>

            {/* Start-batch modal — Arabic */}
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="بدء دفعة إنتاج" size="md"
                footer={<>
                    <button onClick={() => setIsOpen(false)} style={{ padding: '12px 20px', borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'inherit' }}>إلغاء</button>
                    <button onClick={startBatch} disabled={busy} style={{ padding: '12px 26px', borderRadius: 12, background: '#0e7c3f', color: 'white', border: 'none', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                        <Play size={16} /> بدء
                    </button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={opLbl}>رقم الدفعة</label>
                        <input style={opInp} value={form.batchNumber}
                            onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))}
                            placeholder="LOT-2026-…" />
                    </div>
                    <div>
                        <label style={opLbl}>اسم المنتج</label>
                        <input style={opInp} value={form.productName}
                            onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
                            placeholder="مثال : زيت زيتون بكر ممتاز 1 ل" />
                    </div>
                    <div>
                        <label style={opLbl}>الكمية المخطّطة</label>
                        <input style={opInp} type="number" min={0} value={form.plannedQty}
                            onChange={e => setForm(f => ({ ...f, plannedQty: Number(e.target.value) || 0 }))} />
                    </div>
                    <div>
                        <label style={opLbl}>الآلة</label>
                        <select style={opInp} value={form.machineId}
                            onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}>
                            <option value="">— اختر —</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                        </select>
                    </div>
                </div>
            </Modal>

            {/* End-batch confirmation — Modal instead of native confirm() so
                operators on tablet kiosks (where confirm() is suppressed) can
                still close their batches. */}
            <Modal isOpen={!!endTarget} onClose={() => setEndTarget(null)} title="إنهاء الدفعة" size="sm"
                footer={<>
                    <button data-tour="op-batch-end-cancel" onClick={() => setEndTarget(null)} style={{ padding: '12px 20px', borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'inherit' }}>إلغاء</button>
                    <button data-tour="op-batch-end-confirm" onClick={confirmEndBatch} disabled={busy} style={{ padding: '12px 26px', borderRadius: 12, background: '#b91c1c', color: 'white', border: 'none', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                        <StopCircle size={16} /> نعم، إنهاء
                    </button>
                </>}>
                {endTarget && (
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                        هل تريد فعلاً إنهاء الدفعة <b style={{ fontFamily: 'monospace' }}>{endTarget.batchNumber}</b> بكمية <b>{endTarget.actualQty}</b> وحدة من أصل <b>{endTarget.plannedQty}</b> ؟
                        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                            بعد الإنهاء، الدفعة تنتقل للسجلّ ولا يمكن تحريرها.
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}

const opInp: React.CSSProperties = { width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 16, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const opLbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 };
