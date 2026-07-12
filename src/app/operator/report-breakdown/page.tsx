'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { interventionsDb, machinesDb } from '@/lib/db';
import {
    ArrowLeft, Camera, Video, X, Check, Cpu, ChevronLeft, ScanLine,
} from 'lucide-react';
import CameraCapture from '@/components/CameraCapture';
import MediaViewer from '@/components/MediaViewer';
import QRScanner from '@/components/QRScanner';

/** Downscale a photo blob → jpeg dataURL so it fits in the JSONB attachments
 *  column (mirrors technician/report/page.tsx). */
async function compressPhoto(blob: Blob, maxWidth = 1280): Promise<string> {
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i); i.onerror = reject; i.src = url;
        });
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return await blobToDataURL(blob);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.78);
    } finally { URL.revokeObjectURL(url); }
}
function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string); r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

// Scanner overlay text — operator UI is Arabic
const QR_AR = {
    title: 'مسح رمز QR',
    hint: 'ضع رمز QR الخاص بالآلة داخل الإطار',
    searching: 'جاري البحث عن رمز QR…',
    rejected: 'رمز QR غير معروف — لا توجد آلة مطابقة',
    matched: 'تم التعرف على الآلة',
    noCode: 'لم يتم العثور على رمز QR في الصورة',
    importImage: 'استيراد صورة',
    cameraDenied: 'تم رفض الوصول إلى الكاميرا. اسمح بالكاميرا لهذا التطبيق ثم أعد المحاولة.',
    cameraMissing: 'الكاميرا غير موجودة أو مستخدمة من برنامج آخر.',
};

export default function ReportBreakdown() {
    const { showToast } = useToast();
    const { t } = useApp();
    const { machines } = useData();
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
    const [selectedImpacts, setSelectedImpacts] = useState<string[]>([]);

    // Real media state (object URLs from real camera capture)
    const [photos, setPhotos] = useState<string[]>([]);
    const [videos, setVideos] = useState<{ id: string; duration: number }[]>([]);

    // Camera overlay state
    const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null);

    // Fullscreen media viewer state
    const [viewingMedia, setViewingMedia] = useState<{ src: string; type: 'photo' | 'video' } | null>(null);

    const symptoms = [
        { id: 'mechanical', labelKey: 'operator.mechanical', emoji: '⚙️', color: '#f59e0b', bg: '#fffbeb' },
        { id: 'electrical', labelKey: 'operator.electrical', emoji: '⚡', color: '#3b82f6', bg: '#eff6ff' },
        { id: 'leak', labelKey: 'operator.leak', emoji: '💧', color: '#06b6d4', bg: '#ecfeff' },
        { id: 'noise', labelKey: 'operator.noise', emoji: '🔊', color: '#8b5cf6', bg: '#f5f3ff' },
    ];

    const impacts = [
        { id: 'stopped', labelKey: 'operator.stopped', emoji: '🛑', color: '#ef4444', bg: '#fef2f2' },
        { id: 'degraded', labelKey: 'operator.degraded', emoji: '⚠️', color: '#f59e0b', bg: '#fffbeb' },
        { id: 'safety', labelKey: 'operator.safety', emoji: '☠️', color: '#dc2626', bg: '#fef2f2' },
        { id: 'quality', labelKey: 'operator.qualityDefect', emoji: '📉', color: '#8b5cf6', bg: '#f5f3ff' },
    ];

    const machine = machines.find(m => m.id === selectedMachine);

    const toggleSymptom = (id: string) => {
        setSelectedSymptoms(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };
    const toggleImpact = (id: string) => {
        setSelectedImpacts(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    // Open real camera for photo
    const openPhotoCamera = () => {
        setCameraMode('photo');
    };

    // Open real camera for video
    const openVideoCamera = () => {
        setCameraMode('video');
    };

    // Convert each captured blob to a base64 dataURL immediately. This is
    // what later gets persisted in `intervention.attachments` so the admin
    // can actually open the media — blob URLs would die with this session.
    const handlePhotoCaptured = async (blob: Blob) => {
        try {
            const dataUrl = await compressPhoto(blob);
            setPhotos(prev => [...prev, dataUrl]);
            showToast('📸 تم التقاط الصورة بنجاح');
        } catch {
            showToast('خطأ في معالجة الصورة', 'error');
        } finally { setCameraMode(null); }
    };

    const handleVideoCaptured = async (blob: Blob) => {
        try {
            // Read duration from a temporary object URL — that URL is revoked
            // right after; the dataURL we persist is independent.
            const tempUrl = URL.createObjectURL(blob);
            const dur = await new Promise<number>(resolve => {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.onloadedmetadata = () => resolve(Math.round(v.duration) || 0);
                v.onerror = () => resolve(0);
                v.src = tempUrl;
            });
            URL.revokeObjectURL(tempUrl);
            const dataUrl = await blobToDataURL(blob);
            setVideos(prev => [...prev, { id: dataUrl, duration: dur }]);
            showToast('🎥 تم تسجيل الفيديو بنجاح');
        } catch {
            showToast('خطأ في معالجة الفيديو', 'error');
        } finally { setCameraMode(null); }
    };

    const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx));
    const removeVideo = (idx: number) => setVideos(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async () => {
        if (!selectedMachine) { showToast('اختر آلة أولاً', 'error'); return; }
        setSubmitting(true);
        try {
            // Persist the breakdown as a corrective intervention (unassigned, planned).
            const symptomTxt = selectedSymptoms.length ? selectedSymptoms.join(', ') : 'non précisé';
            const impactTxt = selectedImpacts.length ? selectedImpacts.join(', ') : 'non précisé';
            // Persist photos + videos as inline base64 attachments on the
            // intervention — that's the data path the admin /interventions
            // page reads from. Tagged "before" so they sit in the right
            // gallery section.
            const capturedAt = new Date().toISOString();
            const attachments = [
                ...photos.map(dataUrl => ({ type: 'photo' as const, dataUrl, capturedAt, phase: 'before' as const })),
                ...videos.map(v => ({ type: 'video' as const, dataUrl: v.id, capturedAt, phase: 'before' as const })),
            ];
            await interventionsDb.create({
                machineId: selectedMachine,
                technicianId: null,
                interventionType: 'corrective',
                description: `Panne signalée par opérateur — Symptômes : ${symptomTxt}. Impact : ${impactTxt}. (${photos.length} photo(s), ${videos.length} vidéo(s) jointes)`,
                probableCause: '',
                actionDone: '',
                startDate: new Date().toISOString(),
                endDate: null,
                downtimeHours: 0, laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0,
                status: 'planifiée',
                attachments: attachments.length ? attachments : undefined,
            });
            // If the operator flagged the machine as stopped, mark it broken.
            if (selectedImpacts.includes('stopped')) {
                await machinesDb.update(selectedMachine, { status: 'en panne' });
            }
            setStep(4);
            showToast('✅ تم إرسال البلاغ وحفظه');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'خطأ في الإرسال', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const stepLabel = `الخطوة ${step} من 3`;

    if (step === 4) {
        return (
            <>
                <Header title="تم الإبلاغ عن العطل" subtitle="تم إرسال بلاغك" />
                <main style={{ padding: '24px 32px', maxWidth: 600, margin: '0 auto' }} className="animate-fade-in">
                    <div style={{
                        textAlign: 'center', padding: '60px 32px', borderRadius: 24,
                        background: '#ecf7f0',
                        border: '2px solid #86efac',
                    }}>
                        <div style={{
                            width: 100, height: 100, borderRadius: '50%', margin: '0 auto 24px',
                            background: '#0e7c3f',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 16px 48px rgba(34,197,94,0.3)',
                        }}>
                            <Check size={52} color="white" strokeWidth={3} />
                        </div>
                        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#166534', marginBottom: 16 }}>
                            تم إرسال الطلب!
                        </h2>
                        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #bbf7d0', marginBottom: 24, textAlign: 'right' }}>
                            <p style={{ fontSize: 14, color: '#166534', marginBottom: 8 }}>
                                <b>الآلة :</b> {machine?.code} — {machine?.name}
                            </p>
                            <p style={{ fontSize: 14, color: '#166534', marginBottom: 8 }}>
                                <b>الأعراض :</b> {selectedSymptoms.length} مختارة
                            </p>
                            <p style={{ fontSize: 14, color: '#166534', marginBottom: 8 }}>
                                <b>الصور :</b> {photos.length > 0 ? `✅ ${photos.length} صورة` : '❌ لا'}
                            </p>
                            <p style={{ fontSize: 14, color: '#166534' }}>
                                <b>الفيديو :</b> {videos.length > 0 ? `✅ ${videos.length} فيديو` : '❌ لا'}
                            </p>
                        </div>
                        <p style={{ fontSize: 14, color: '#166534', marginBottom: 24 }}>
                            الحالة: ⏳ في انتظار فني
                        </p>
                        <Link href="/operator/dashboard" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '16px 32px', borderRadius: 16,
                            background: '#0e7c3f',
                            color: 'white', fontWeight: 700, fontSize: 16, textDecoration: 'none',
                            boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
                        }}>
                            العودة إلى لوحة القيادة
                        </Link>
                    </div>
                </main>
            </>
        );
    }

    return (
        <>
            <Header title="الإبلاغ عن عطل" subtitle={stepLabel} />
            <main style={{ padding: '24px 32px', maxWidth: 700, margin: '0 auto' }}>
                <Link href="/operator/dashboard" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 14, color: 'var(--primary)', textDecoration: 'none',
                    fontWeight: 500, marginBottom: 20,
                }}>
                    <ChevronLeft size={16} /> إلغاء
                </Link>

                {/* Real Camera Overlay */}
                {cameraMode && (
                    <CameraCapture
                        mode={cameraMode}
                        onCapture={cameraMode === 'photo' ? handlePhotoCaptured : handleVideoCaptured}
                        onClose={() => setCameraMode(null)}
                    />
                )}

                {/* Real QR scanner — validates against the machine database */}
                {scannerOpen && (
                    <QRScanner
                        machines={machines}
                        accent="#10b981"
                        strings={QR_AR}
                        onMatch={(m) => {
                            setSelectedMachine(m.id);
                            setScannerOpen(false);
                            setStep(2);
                            showToast(`✅ ${m.code} — ${m.name}`);
                        }}
                        onClose={() => setScannerOpen(false)}
                    />
                )}

                {/* Fullscreen Media Viewer */}
                {viewingMedia && (
                    <MediaViewer
                        src={viewingMedia.src}
                        type={viewingMedia.type}
                        onClose={() => setViewingMedia(null)}
                    />
                )}

                {/* Progress */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
                    {[1, 2, 3].map(s => (
                        <div key={s} style={{
                            flex: 1, height: 6, borderRadius: 3,
                            background: s <= step ? '#0e7c3f' : '#e2e8f0',
                            transition: 'all 0.4s ease',
                        }} />
                    ))}
                </div>

                {/* Step 1: Machine */}
                {step === 1 && (
                    <div data-tour="panic-step-1" className="animate-fade-in">
                        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                            أي آلة؟ 🏭
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            امسح رمز QR أو اضغط للاختيار
                        </p>

                        {/* Scan QR — opens the real camera scanner */}
                        <button onClick={() => setScannerOpen(true)} style={{
                            width: '100%', padding: '20px', borderRadius: 18, marginBottom: 18,
                            background: '#0e7c3f',
                            color: 'white', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            fontSize: 17, fontWeight: 800,
                            boxShadow: '0 8px 24px rgba(16,185,129,0.32)',
                        }}>
                            <ScanLine size={26} /> امسح رمز QR للآلة
                        </button>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {machines.map(m => (
                                <button key={m.id} onClick={() => { setSelectedMachine(m.id); setStep(2); }} style={{
                                    padding: '24px 16px', borderRadius: 20,
                                    border: '2px solid var(--border)', background: 'var(--surface)',
                                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; }}>
                                    <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Cpu size={26} color="#64748b" />
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: 17 }}>{m.code}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Symptoms + Media */}
                {step === 2 && (
                    <div data-tour="panic-step-2" className="animate-fade-in">
                        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                            الأعراض الملاحظة 🔍
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
                            الآلة : <b>{machine?.code}</b>
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                            اختر عرضاً واحداً أو أكثر
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                            {symptoms.map(s => {
                                const sel = selectedSymptoms.includes(s.id);
                                return (
                                    <button key={s.id} onClick={() => toggleSymptom(s.id)} style={{
                                        padding: '22px 16px', borderRadius: 18,
                                        border: `3px solid ${sel ? s.color : 'var(--border)'}`,
                                        background: sel ? s.bg : 'var(--surface)',
                                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                                        position: 'relative',
                                    }}>
                                        {sel && (
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8, width: 22, height: 22,
                                                borderRadius: '50%', background: s.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Check size={14} color="white" strokeWidth={3} />
                                            </div>
                                        )}
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>{s.emoji}</div>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: sel ? s.color : 'var(--text-primary)' }}>
                                            {t(s.labelKey)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ====== MEDIA ATTACHMENT ZONE ====== */}
                        <div style={{ marginBottom: 24 }}>
                            <label style={{
                                display: 'block', fontSize: 13, fontWeight: 700,
                                color: 'var(--text-primary)', marginBottom: 12,
                            }}>
                                المرفقات (صور / فيديو)
                            </label>

                            {/* Real preview grid */}
                            {(photos.length > 0 || videos.length > 0) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                                    {photos.map((p, i) => (
                                        <div key={`p-${i}`} className="media-preview" style={{
                                            position: 'relative', width: 80, height: 80, borderRadius: 14,
                                            overflow: 'hidden', border: '2px solid var(--border)',
                                            background: '#000', cursor: 'pointer',
                                        }}>
                                            <img src={p} alt={`صورة ${i + 1}`}
                                                onClick={() => setViewingMedia({ src: p, type: 'photo' })}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button onClick={(e) => { e.stopPropagation(); removePhoto(i); }} style={{
                                                position: 'absolute', top: -6, left: -6, width: 22, height: 22,
                                                borderRadius: '50%', background: '#ef4444', border: '2px solid white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: 'white', padding: 0,
                                            }}>
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}
                                    {videos.map((v, i) => (
                                        <div key={`v-${i}`} className="media-preview" style={{
                                            position: 'relative', width: 80, height: 80, borderRadius: 14,
                                            overflow: 'hidden', border: '2px solid var(--border)',
                                            background: '#000', cursor: 'pointer',
                                        }}
                                        onClick={() => setViewingMedia({ src: v.id, type: 'video' })}
                                        >
                                            <video src={v.id} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            {/* Play icon overlay */}
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(0,0,0,0.3)',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.9)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #333', marginLeft: 2 }} />
                                                </div>
                                            </div>
                                            <span style={{
                                                position: 'absolute', bottom: 4, right: 4,
                                                fontSize: 9, fontWeight: 700, color: 'white',
                                                background: 'rgba(0,0,0,0.5)', padding: '1px 5px',
                                                borderRadius: 4,
                                            }}>{v.duration}ث</span>
                                            <button onClick={(e) => { e.stopPropagation(); removeVideo(i); }} style={{
                                                position: 'absolute', top: -6, left: -6, width: 22, height: 22,
                                                borderRadius: '50%', background: '#ef4444', border: '2px solid white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: 'white', padding: 0,
                                            }}>
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div data-tour="panic-media-actions" style={{ display: 'flex', gap: 12 }}>
                                <button onClick={openPhotoCamera} style={{
                                    flex: 1, padding: '18px', borderRadius: 16,
                                    border: '2px dashed var(--border)',
                                    background: 'var(--surface-hover)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: 10,
                                    fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                                    <Camera size={22} /> التقاط صورة
                                </button>
                                <button onClick={openVideoCamera} style={{
                                    flex: 1, padding: '18px', borderRadius: 16,
                                    border: '2px dashed var(--border)',
                                    background: 'var(--surface-hover)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: 10,
                                    fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.color = '#8b5cf6'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                                    <Video size={22} /> تسجيل فيديو
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={() => setStep(1)} style={{
                                flex: 1, padding: '16px', borderRadius: 14,
                                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                fontWeight: 600, fontSize: 15, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                color: 'var(--text-primary)',
                            }}>
                                <ArrowLeft size={18} /> رجوع
                            </button>
                            <button data-tour="panic-next" onClick={() => selectedSymptoms.length > 0 && setStep(3)}
                                disabled={selectedSymptoms.length === 0} style={{
                                    flex: 2, padding: '16px', borderRadius: 14,
                                    background: selectedSymptoms.length > 0
                                        ? '#0e7c3f'
                                        : '#e2e8f0',
                                    color: selectedSymptoms.length > 0 ? 'white' : '#94a3b8',
                                    border: 'none',
                                    fontWeight: 700, fontSize: 16,
                                    cursor: selectedSymptoms.length > 0 ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}>
                                التالي <ArrowLeft size={20} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Impact + Confirm */}
                {step === 3 && (
                    <div data-tour="panic-step-3" className="animate-fade-in">
                        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                            مستوى التأثير ⚠️
                        </h2>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                            اختر التأثيرات الملاحظة
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                            {impacts.map(imp => {
                                const sel = selectedImpacts.includes(imp.id);
                                return (
                                    <button key={imp.id} onClick={() => toggleImpact(imp.id)} style={{
                                        padding: '22px 16px', borderRadius: 18,
                                        border: `3px solid ${sel ? imp.color : 'var(--border)'}`,
                                        background: sel ? imp.bg : 'var(--surface)',
                                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                                        position: 'relative',
                                    }}>
                                        {sel && (
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8, width: 22, height: 22,
                                                borderRadius: '50%', background: imp.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Check size={14} color="white" strokeWidth={3} />
                                            </div>
                                        )}
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>{imp.emoji}</div>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: sel ? imp.color : 'var(--text-primary)' }}>
                                            {t(imp.labelKey)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Summary card */}
                        <div style={{
                            padding: 16, borderRadius: 14,
                            background: '#f8fafc', border: '1px solid var(--border-light)',
                            marginBottom: 24,
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                                ملخص البلاغ
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                                <div><b>الآلة:</b> {machine?.code} — {machine?.name}</div>
                                <div><b>الأعراض:</b> {selectedSymptoms.length} مختارة</div>
                                <div><b>الصور:</b> {photos.length > 0 ? `${photos.length} ✅` : 'لا ❌'}</div>
                                <div><b>الفيديو:</b> {videos.length > 0 ? `${videos.length} ✅` : 'لا ❌'}</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={() => setStep(2)} style={{
                                flex: 1, padding: '16px', borderRadius: 14,
                                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                fontWeight: 600, fontSize: 15, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                color: 'var(--text-primary)',
                            }}>
                                <ArrowLeft size={18} /> رجوع
                            </button>
                            <button data-tour="panic-submit" onClick={handleSubmit} disabled={submitting} style={{
                                flex: 2, padding: '18px', borderRadius: 14,
                                background: '#b91c1c',
                                color: 'white', border: 'none', fontWeight: 800, fontSize: 17,
                                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
                            }}>
                                🔥 {submitting ? 'جارٍ الإرسال…' : 'تأكيد التنبيه'}
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}
