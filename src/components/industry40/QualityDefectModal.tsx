'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import QRScanner from '@/components/QRScanner';
import {
    ScanLine, AlertTriangle, Wrench, ExternalLink, X, Check, Package,
} from 'lucide-react';

// Arabic strings for the real QR scanner overlay (operator UI is RTL).
const QR_AR_QD = {
    title: 'مسح رمز الآلة',
    hint: 'وجّه الكاميرا إلى رمز QR الخاص بالآلة المنتجة',
    searching: 'جاري البحث عن رمز QR…',
    rejected: 'رمز QR غير معروف — لا توجد آلة مطابقة',
    matched: 'تم التعرف على الآلة',
    noCode: 'لم يتم العثور على رمز QR في الصورة',
    importImage: 'استيراد صورة',
    cameraDenied: 'تم رفض الوصول إلى الكاميرا. اسمح بالكاميرا لهذا التطبيق ثم أعد المحاولة.',
    cameraMissing: 'الكاميرا غير موجودة أو مستخدمة من برنامج آخر.',
};

const defectTypes = [
    { value: 'turbidity', label: 'تعكر الزيت', desc: 'Oil Turbidity — تعكر أو رواسب في الزيت' },
    { value: 'under_fill', label: 'تعبئة ناقصة', desc: 'Under-fill — حجم أقل من المطلوب' },
    { value: 'faulty_cap', label: 'سدادة معيبة', desc: 'Faulty Cap/Seal — سدادة غير محكمة' },
    { value: 'label_defect', label: 'ملصق معيب', desc: 'Label Defect — ملصق منحرف أو مفقود' },
    { value: 'color_off', label: 'لون غير مطابق', desc: 'Off-spec Color — اختلاف في لون الزيت' },
    { value: 'foreign_matter', label: 'شوائب أجنبية', desc: 'Foreign Matter — جسم غريب في المنتج' },
];

const recommendedActions: Record<string, { arAction: string; suggestedMachine: string; severity: 'warning' | 'critical' }> = {
    turbidity: {
        arAction: 'فحص حالة المرشح واستبدال خرطوشة الترشيح. جدولة صيانة وقائية.',
        suggestedMachine: 'FIL-001', severity: 'warning',
    },
    under_fill: {
        arAction: 'معايرة فوهات التعبئة الحجمية. تنبيه صيانة عاجلة.',
        suggestedMachine: 'REM-001', severity: 'critical',
    },
    faulty_cap: {
        arAction: 'فحص رأس السد وعزم الإغلاق. استبدال في حالة التآكل.',
        suggestedMachine: 'BOU-001', severity: 'warning',
    },
    label_defect: {
        arAction: 'فحص محاذاة آلة الوسم وحساس الموضع. إعادة المعايرة.',
        suggestedMachine: 'ETQ-001', severity: 'warning',
    },
    color_off: {
        arAction: 'فحص خزان المزج ودرجة حرارة العملية. إعادة معايرة الحساسات.',
        suggestedMachine: 'MEL-001', severity: 'warning',
    },
    foreign_matter: {
        arAction: 'إيقاف فوري. تنظيف المنطقة وفحص المرشحات. التحقق من المادة الأولية.',
        suggestedMachine: 'FIL-001', severity: 'critical',
    },
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function QualityDefectModal({ isOpen, onClose }: Props) {
    const { showToast } = useToast();
    const { machines } = useData();
    const [rollId, setRollId] = useState('');
    const [defectType, setDefectType] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [detected, setDetected] = useState<{ code: string; name: string } | null>(null);

    const recommendation = defectType ? recommendedActions[defectType] : null;

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setRollId('');
            setDefectType('');
            setDetected(null);
            setScannerOpen(false);
        }
    }, [isOpen]);

    const handleSubmit = () => {
        if (!detected) {
            showToast('يرجى مسح رمز QR للآلة أولاً', 'error');
            return;
        }
        if (!defectType) {
            showToast('يرجى اختيار نوع العيب', 'error');
            return;
        }
        const lot = rollId.trim();
        showToast(`✅ تم تسجيل عيب الجودة على آلة ${detected.code}${lot ? ` — ${lot}` : ''}`);
        onClose();
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="📋 الإبلاغ عن عيب في الجودة"
                subtitle="امسح رمز QR الخاص بالآلة المنتجة"
                size="md"
                footer={
                    <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        <button onClick={onClose} style={{
                            flex: 1, padding: '12px', borderRadius: 12,
                            background: 'var(--surface-hover)', border: '1px solid var(--border)',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)',
                            fontFamily: 'inherit',
                        }}>
                            إلغاء
                        </button>
                        <button onClick={handleSubmit} style={{
                            flex: 1, padding: '12px', borderRadius: 12,
                            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                            color: 'white', border: 'none', fontSize: 14, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                            ✅ تسجيل العيب
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* ====== SCAN MACHINE QR BUTTON ====== */}
                    {!detected && (
                        <button onClick={() => setScannerOpen(true)}
                            style={{
                                width: '100%', padding: '24px', borderRadius: 18,
                                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                                transition: 'transform 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                            <div style={{
                                width: 52, height: 52, borderRadius: 14,
                                background: 'rgba(139,92,246,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <ScanLine size={28} color="#a78bfa" />
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 17, fontWeight: 700 }}>مسح رمز QR للآلة</div>
                                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                                    Scan machine QR code
                                </div>
                            </div>
                        </button>
                    )}

                    {/* ====== DETECTED MACHINE CARD ====== */}
                    {detected && (
                        <div style={{
                            borderRadius: 16,
                            background: 'linear-gradient(135deg, #f0fdf4, #d1fae5)',
                            border: '2px solid #86efac', overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '14px 18px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'rgba(34,197,94,0.1)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: '#22c55e', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Check size={20} color="white" strokeWidth={3} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                                            تم تحديد الآلة
                                        </div>
                                        <div style={{ fontSize: 11, color: '#15803d' }}>
                                            Machine identifiée
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setDetected(null)}
                                    style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: 'rgba(239,68,68,0.1)', border: 'none',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', color: '#ef4444',
                                    }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '16px 18px', display: 'flex', gap: 14 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: 'rgba(34,197,94,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Package size={24} color="#22c55e" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 16, color: '#14532d' }}>
                                        {detected.code}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>
                                        {detected.name}
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                padding: '10px 18px',
                                borderTop: '1px solid rgba(34,197,94,0.2)',
                                display: 'flex', gap: 8,
                            }}>
                                <button onClick={() => { setDetected(null); setScannerOpen(true); }}
                                    style={{
                                        flex: 1, padding: '10px', borderRadius: 10,
                                        background: 'transparent', border: '1px solid #86efac',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                        color: '#166534', fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}>
                                    <ScanLine size={16} /> إعادة المسح
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ====== MANUAL LOT INPUT (optional) ====== */}
                    <div>
                        <label style={{
                            display: 'block', fontSize: 12, fontWeight: 700,
                            color: 'var(--text-muted)', marginBottom: 6,
                        }}>
                            رقم الدفعة (اختياري) — Lot / Batch (optional)
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className="input"
                                placeholder="مثال: LOT-8842"
                                value={rollId}
                                onChange={e => setRollId(e.target.value)}
                                style={{ flex: 1, fontFamily: 'inherit' }}
                                dir="auto"
                            />
                            {rollId && (
                                <button onClick={() => setRollId('')} style={{
                                    padding: '10px 14px', borderRadius: 10,
                                    background: '#fef2f2', border: '1px solid #fecaca',
                                    cursor: 'pointer', color: '#ef4444',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <X size={18} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ====== DEFECT TYPE ====== */}
                    <div>
                        <label style={{
                            display: 'block', fontSize: 12, fontWeight: 700,
                            color: 'var(--text-muted)', marginBottom: 6,
                        }}>
                            نوع العيب
                        </label>
                        <select
                            className="select"
                            value={defectType}
                            onChange={e => setDefectType(e.target.value)}
                            style={{ fontFamily: 'inherit' }}
                        >
                            <option value="">— اختر نوع العيب —</option>
                            {defectTypes.map(d => (
                                <option key={d.value} value={d.value}>{d.label} — {d.desc}</option>
                            ))}
                        </select>
                    </div>

                    {/* ====== RECOMMENDED ACTION ====== */}
                    {recommendation && (
                        <div style={{
                            padding: 16, borderRadius: 14,
                            background: recommendation.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                            border: `1px solid ${recommendation.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                {recommendation.severity === 'critical'
                                    ? <AlertTriangle size={18} color="#ef4444" />
                                    : <Wrench size={18} color="#f59e0b" />}
                                <span style={{
                                    fontWeight: 700, fontSize: 14,
                                    color: recommendation.severity === 'critical' ? '#dc2626' : '#d97706',
                                }}>
                                    الإجراء الموصى به
                                </span>
                            </div>
                            <p style={{
                                fontSize: 13, color: 'var(--text-secondary)',
                                lineHeight: 1.7, marginBottom: 10,
                            }}>
                                {recommendation.arAction}
                            </p>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 12, color: 'var(--primary)', fontWeight: 600,
                            }}>
                                <ExternalLink size={14} />
                                الآلة النموذجية : {recommendation.suggestedMachine}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ====== REAL QR SCANNER (validates against the machine database) ====== */}
            {scannerOpen && (
                <QRScanner
                    machines={machines}
                    accent="#8b5cf6"
                    strings={QR_AR_QD}
                    onMatch={(m) => {
                        setDetected({ code: m.code, name: m.name });
                        setScannerOpen(false);
                        showToast(`✅ ${m.code} — ${m.name}`);
                    }}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </>
    );
}
