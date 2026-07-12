'use client';

// ============================================================
// Operator dashboard — Arabic/RTL
// Hosts the panic button + the operator-side quick actions:
//   O2  production target vs réel  (active batch counter)
//   O4  EPI / consommables manquants — routed to maintenance admin
//   O5  acquittement de consigne   (forced before "start shift")
//   O6  photo qualité              (per active batch)
// Relief requests (O3) belong to production / chef d'équipe and are
// intentionally NOT surfaced here in the maintenance-only build.
// ============================================================

import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/ui/Toast';
import {
    consumableRequestsDb, directiveAcksDb, productionBatchesDb,
} from '@/lib/db';
import {
    AlertTriangle, Clock, CheckCircle2, Wrench, Info, ScanLine,
    ShieldAlert, Camera, Plus, Minus, Target, X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import QualityDefectModal from '@/components/industry40/QualityDefectModal';
import CameraCapture from '@/components/CameraCapture';
import type { ProductionBatch, BatchQualityPhoto } from '@/lib/types';

async function compressPhoto(blob: Blob, maxWidth = 1024): Promise<string> {
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url;
        });
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.75);
    } finally { URL.revokeObjectURL(url); }
}

const initialReports = [
    { id: 'sig-001', machineId: 'mach-002', machineCode: 'FIL-001', problem: 'leak', status: 'inRepair', time: '10:30' },
    { id: 'sig-002', machineId: 'mach-004', machineCode: 'ECH-001', problem: 'noise', status: 'waiting', time: '09:15' },
    { id: 'sig-003', machineId: 'mach-001', machineCode: 'POM-001', problem: 'mechanical', status: 'resolved', time: 'أمس 14:20' },
];

export default function OperatorDashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { productionBatches, directives, directiveAcks, machines } = useData();

    const [reports] = useState(initialReports);
    const [showQualityModal, setShowQualityModal] = useState(false);

    // Escape hatch — the tutorial fires `smartmaint-demo-close-quality-modal`
    // after clicking the modal-close X to guarantee the modal is dismissed
    // before moving on. Fire-and-forget; nothing bad happens if it's not open.
    useEffect(() => {
        const close = () => setShowQualityModal(false);
        window.addEventListener('smartmaint-demo-close-quality-modal', close);
        return () => window.removeEventListener('smartmaint-demo-close-quality-modal', close);
    }, []);

    const meName = user?.name ?? '';

    // ── O5 — first unacknowledged active directive ──
    const myAcks = useMemo(
        () => new Set(directiveAcks.filter(a => a.operatorName === meName).map(a => a.directiveId)),
        [directiveAcks, meName]);
    const unackedDirective = useMemo(() => directives
        .filter(d => d.active && !myAcks.has(d.id))
        .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))[0] ?? null,
        [directives, myAcks]);

    const ackDirective = async () => {
        if (!unackedDirective) return;
        try {
            await directiveAcksDb.create({ directiveId: unackedDirective.id, operatorName: meName, ackAt: new Date().toISOString() });
            showToast('✅ تم تأكيد التعليمات');
        } catch (err) { showToast(err instanceof Error ? err.message : 'خطأ', 'error'); }
    };

    // ── O2 + O6 — my active production batch ──
    const myBatch = useMemo(() => productionBatches
        .filter(b => !b.endedAt && b.operatorName === meName)[0] ?? null, [productionBatches, meName]);

    // ── O4 — consumable / EPI request form ──
    const [consumOpen, setConsumOpen] = useState(false);
    const [consumCat, setConsumCat] = useState<'EPI' | 'consommable' | 'autre'>('EPI');
    const [consumItem, setConsumItem] = useState('');
    const [consumQty, setConsumQty] = useState(1);
    const [consumUrgent, setConsumUrgent] = useState(false);
    const [consumBusy, setConsumBusy] = useState(false);
    const submitConsumable = async () => {
        if (!consumItem.trim()) { showToast('اكتب اسم العنصر', 'error'); return; }
        setConsumBusy(true);
        try {
            await consumableRequestsDb.create({
                operatorName: meName, category: consumCat, item: consumItem.trim(),
                quantity: consumQty, urgency: consumUrgent ? 'urgente' : 'normale',
                notes: '', status: 'ouverte', handledBy: null, handledAt: null,
            });
            showToast('📩 تم إرسال الطلب');
            setConsumOpen(false); setConsumItem(''); setConsumQty(1); setConsumUrgent(false); setConsumCat('EPI');
        } catch (err) { showToast(err instanceof Error ? err.message : 'خطأ', 'error'); }
        finally { setConsumBusy(false); }
    };

    // ── O6 — quality photo capture ──
    const [photoMode, setPhotoMode] = useState(false);
    const handleQualityPhoto = async (blob: Blob) => {
        setPhotoMode(false);
        if (!myBatch) return;
        try {
            const dataUrl = await compressPhoto(blob);
            const photos = [...(myBatch.qualityPhotos ?? []), { dataUrl, capturedAt: new Date().toISOString() } as BatchQualityPhoto];
            await productionBatchesDb.update(myBatch.id, { qualityPhotos: photos });
            showToast('📸 تم حفظ الصورة');
        } catch (err) { showToast(err instanceof Error ? err.message : 'خطأ', 'error'); }
    };

    const statusMap: Record<string, { labelAr: string; color: string; bg: string; icon: React.ElementType }> = {
        'waiting': { labelAr: 'في انتظار الفني', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
        'inRepair': { labelAr: 'قيد الإصلاح', color: '#3b82f6', bg: '#eff6ff', icon: Wrench },
        'resolved': { labelAr: 'تم الحل', color: '#22c55e', bg: '#f0fdf4', icon: CheckCircle2 },
    };
    const problemKeys: Record<string, string> = {
        'leak': 'تسرب سائل',
        'noise': 'ضوضاء غير طبيعية',
        'mechanical': 'انسداد ميكانيكي',
        'electrical': 'مشكلة كهربائية',
    };
    const brokenMachines = machines.filter(m => m.status === 'en panne' || m.status === 'en maintenance');

    return (
        <>
            <Header title="لوحة تحكم المشغل" subtitle={`مرحباً ${user?.name ?? ''} 👋`} />
            <main style={{ padding: '24px 32px', maxWidth: 700, margin: '0 auto' }} className="animate-fade-in">

                {/* ── O5 — Unacknowledged directive (forced acknowledgement) ── */}
                {unackedDirective && (
                    <div data-tour="op-directive" style={{
                        marginBottom: 20, padding: '20px 22px', borderRadius: 18,
                        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                        border: '2px solid #f59e0b',
                        boxShadow: '0 8px 24px rgba(245,158,11,0.18)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <ShieldAlert size={22} color="#d97706" />
                            <span style={{ fontWeight: 800, color: '#92400e', fontSize: 15 }}>تعليمة من المدير — مطلوب تأكيدها</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#92400e', marginBottom: 6 }}>{unackedDirective.title}</div>
                        <div style={{ fontSize: 13.5, color: '#78350f', lineHeight: 1.55, marginBottom: 12 }}>{unackedDirective.content}</div>
                        <button onClick={ackDirective} style={{
                            width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                            background: 'linear-gradient(135deg, #d97706, #b45309)', color: 'white',
                            fontWeight: 800, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                            <CheckCircle2 size={18} /> أؤكد قراءة هذه التعليمة
                        </button>
                    </div>
                )}

                {/* Panic button — solid crimson, thick edge, restrained.
                    Operators must be able to hit it in one look, so the
                    visual weight stays but the "consumer-app red gradient"
                    is replaced by a single deep red with a clear ring. */}
                <Link href="/operator/report-breakdown" data-tour="op-panic" style={{ textDecoration: 'none' }}>
                    <div style={{
                        background: '#b91c1c',
                        borderRadius: 16, padding: '32px 28px', textAlign: 'center', color: 'white',
                        cursor: 'pointer', transition: 'background 0.15s ease, transform 0.05s ease',
                        boxShadow: '0 12px 30px -8px rgba(185,28,28,0.35), inset 0 0 0 4px rgba(255,255,255,0.06)',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#b91c1c'; }}
                    >
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 14px', fontSize: 32 }}>⚠️</div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>الإبلاغ عن عطل</h2>
                        <p style={{ fontSize: 13, opacity: 0.85 }}>اضغط للإبلاغ في 3 خطوات</p>
                    </div>
                </Link>

                {/* Quality Defect Button — solid purple */}
                <button onClick={() => setShowQualityModal(true)} id="quality-defect-btn" data-tour="op-quality" style={{
                    width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 10,
                    background: '#5b21b6',
                    color: 'white', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 14, fontWeight: 600, letterSpacing: '0.005em',
                    boxShadow: '0 4px 12px -4px rgba(91,33,182,0.35)',
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit',
                }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#6d28d9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#5b21b6'; }}
                >
                    <ScanLine size={17} /> الإبلاغ عن عيب في الجودة
                </button>

                {/* ── O4 — Quick action: EPI / consommables manquants ── */}
                <button onClick={() => setConsumOpen(o => !o)} data-tour="op-consumable" style={{
                    marginTop: 10, width: '100%',
                    padding: '13px 18px', borderRadius: 10, border: 'none',
                    background: '#b45309', color: 'white',
                    fontWeight: 600, fontSize: 14, letterSpacing: '0.005em', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 12px -4px rgba(180,83,9,0.35)',
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit',
                }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#c2670c'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#b45309'; }}
                >
                    <ShieldAlert size={17} />
                    EPI / مستلزمات ناقصة
                </button>

                {/* O4 — Inline consumable form */}
                {consumOpen && (
                    <div data-tour="op-consumable-form" style={{ marginTop: 12, padding: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>الإبلاغ عن عنصر ناقص أو مكسور</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                            {(['EPI', 'consommable', 'autre'] as const).map(c => (
                                <button key={c} onClick={() => setConsumCat(c)} style={{
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                    border: '1px solid ' + (consumCat === c ? '#f97316' : 'var(--border)'),
                                    background: consumCat === c ? '#fff7ed' : 'transparent',
                                    color: consumCat === c ? '#c2410c' : 'var(--text-secondary)',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>{c === 'EPI' ? '🛡️ EPI' : c === 'consommable' ? '🧴 مستهلكات' : '📦 أخرى'}</button>
                            ))}
                        </div>
                        <input className="input" value={consumItem} onChange={e => setConsumItem(e.target.value)}
                            placeholder="مثال : خوذة مكسورة، قفازات M، ..." style={{ marginBottom: 8 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 13 }}>الكمية :</span>
                            <button onClick={() => setConsumQty(q => Math.max(1, q - 1))} style={iconQtyBtn}><Minus size={14} /></button>
                            <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{consumQty}</span>
                            <button onClick={() => setConsumQty(q => q + 1)} style={iconQtyBtn}><Plus size={14} /></button>
                            <label style={{ marginInlineStart: 'auto', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={consumUrgent} onChange={e => setConsumUrgent(e.target.checked)} />
                                عاجل
                            </label>
                        </div>
                        <button onClick={submitConsumable} disabled={consumBusy} style={{
                            width: '100%', padding: 12, borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white',
                            fontWeight: 700, fontSize: 14, cursor: consumBusy ? 'wait' : 'pointer',
                            opacity: consumBusy ? 0.7 : 1, fontFamily: 'inherit',
                        }}>{consumBusy ? '...' : 'إرسال الطلب'}</button>
                    </div>
                )}

                {/* ── O2 — Active batch with target counter ── */}
                {myBatch && (
                    <ActiveBatchCard batch={myBatch} onOpenPhoto={() => setPhotoMode(true)} />
                )}
                {!myBatch && (
                    <div style={{
                        marginTop: 16, padding: '14px 18px', borderRadius: 14,
                        background: 'var(--surface)', border: '1px dashed var(--border)',
                        fontSize: 13, color: 'var(--text-muted)', textAlign: 'center',
                    }}>
                        ابدأ <Link href="/production-batches" style={{ color: '#10b981', fontWeight: 700 }}>دفعة إنتاج</Link> لمتابعة الهدف والكمية الفعلية.
                    </div>
                )}

                {/* Machine status summary */}
                {brokenMachines.length > 0 && (
                    <div style={{
                        marginTop: 18, padding: '14px 18px', borderRadius: 14,
                        background: '#fef2f2', border: '1px solid #fecaca',
                        display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <Info size={18} color="#ef4444" />
                        <span style={{ fontSize: 13.5, color: '#991b1b', fontWeight: 500 }}>
                            <b>{brokenMachines.length}</b> آلة/آلات معطلة أو في الصيانة حالياً
                        </span>
                    </div>
                )}

                {/* My Reports */}
                <div style={{ marginTop: 28 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        📋 بلاغاتي الأخيرة
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {reports.map((report) => {
                            const st = statusMap[report.status];
                            const Icon = st.icon;
                            return (
                                <div key={report.id} style={{
                                    background: 'var(--surface)', borderRadius: 14,
                                    padding: '14px 18px', border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', gap: 12,
                                }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: st.bg,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={20} color={st.color} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{report.machineCode}</div>
                                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                            {problemKeys[report.problem] || report.problem}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: st.bg, color: st.color }}>{st.labelAr}</span>
                                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>{report.time}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>

            {showQualityModal && <QualityDefectModal isOpen={true} onClose={() => setShowQualityModal(false)} />}
            {photoMode && <CameraCapture mode="photo" onCapture={handleQualityPhoto} onClose={() => setPhotoMode(false)} />}
        </>
    );
}

const iconQtyBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface-hover)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
};

interface ActiveBatchCardProps { batch: ProductionBatch; onOpenPhoto: () => void; }

function ActiveBatchCard({ batch, onOpenPhoto }: ActiveBatchCardProps) {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const pct = batch.plannedQty > 0 ? Math.min(100, Math.round((batch.actualQty / batch.plannedQty) * 100)) : 0;
    const photos = batch.qualityPhotos ?? [];

    const bump = async (delta: number) => {
        setBusy(true);
        try {
            await productionBatchesDb.update(batch.id, { actualQty: Math.max(0, batch.actualQty + delta) });
        } catch (err) { showToast(err instanceof Error ? err.message : 'خطأ', 'error'); }
        finally { setBusy(false); }
    };

    /** Remove one quality photo from this batch — by capturedAt timestamp,
     *  so we don't index against a stale slice. */
    const deletePhoto = async (capturedAt: string) => {
        if (!window.confirm('حذف هذه الصورة ؟')) return;
        try {
            const next = (batch.qualityPhotos ?? []).filter(p => p.capturedAt !== capturedAt);
            await productionBatchesDb.update(batch.id, { qualityPhotos: next });
            showToast('🗑️ تم حذف الصورة');
        } catch (err) { showToast(err instanceof Error ? err.message : 'خطأ', 'error'); }
    };

    return (
        <div data-tour="op-batch" style={{
            marginTop: 18, padding: 18, borderRadius: 18,
            background: 'linear-gradient(135deg, #f0fdf4, #d1fae5)',
            border: '1px solid #6ee7b7',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Target size={22} color="#059669" />
                <span style={{ fontWeight: 800, fontSize: 15, color: '#065f46' }}>الإنتاج الحالي</span>
                <span style={{ marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: '#065f46', background: 'rgba(255,255,255,0.6)', padding: '3px 9px', borderRadius: 100 }}>
                    {batch.batchNumber}
                </span>
            </div>
            <div style={{ fontSize: 13, color: '#065f46', marginBottom: 8 }}>{batch.productName}</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: '#047857', lineHeight: 1 }}>{batch.actualQty}</span>
                <span style={{ fontSize: 14, color: '#065f46', opacity: 0.7 }}>/ {batch.plannedQty}</span>
                <span style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 700, color: '#047857' }}>{pct} %</span>
            </div>
            <div style={{ height: 8, borderRadius: 100, background: 'rgba(255,255,255,0.6)', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.3s' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => bump(1)} disabled={busy} style={bigGreen('linear-gradient(135deg, #10b981, #047857)')}>
                    <Plus size={18} /> +1
                </button>
                <button onClick={() => bump(10)} disabled={busy} style={bigGreen('linear-gradient(135deg, #10b981, #047857)')}>
                    <Plus size={18} /> +10
                </button>
                <button onClick={() => bump(-1)} disabled={busy || batch.actualQty === 0} style={{
                    ...bigGreen('var(--surface)'), color: '#047857', border: '1px solid #6ee7b7',
                }}><Minus size={16} /> −1</button>
                <button onClick={onOpenPhoto} data-tour="op-batch-photo" style={{
                    ...bigGreen('linear-gradient(135deg, #8b5cf6, #6d28d9)'),
                }}><Camera size={16} /> صورة جودة</button>
            </div>

            {photos.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {photos.slice(-6).map((p) => (
                        <div key={p.capturedAt} style={{ position: 'relative', width: 52, height: 52 }}>
                            <img src={p.dataUrl} alt=""
                                style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.6)' }} />
                            <button
                                type="button"
                                onClick={() => deletePhoto(p.capturedAt)}
                                title="حذف"
                                style={{
                                    position: 'absolute', top: -6, right: -6,
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: '#dc2626', color: 'white', border: '2px solid white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', padding: 0,
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                                }}
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                    {photos.length > 6 && (
                        <span style={{ alignSelf: 'center', fontSize: 11, color: '#065f46', fontWeight: 700 }}>+{photos.length - 6}</span>
                    )}
                </div>
            )}
        </div>
    );
}

function bigGreen(bg: string): React.CSSProperties {
    return {
        flex: '1 1 100px', padding: '12px 14px', borderRadius: 12, border: 'none',
        background: bg, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
    };
}
