'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { interventionsDb, sparePartsDb, maintenancePlansDb } from '@/lib/db';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { ClipboardList, Mic, MicOff, CheckCircle, Save, ArrowLeft, X, Search, Zap, Play, Pause, RotateCcw, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { transcribeBlob } from '@/lib/transcription';
import CameraCapture from '@/components/CameraCapture';
import type { InterventionAttachment } from '@/lib/types';

const HHMMSS = (ms: number) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/** Downscale a photo blob to a reasonable size and re-encode as jpeg. Keeps
 *  the dataURL under ~200 KB so the JSONB column doesn't explode. */
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

// ── Quick-insert phrases — the most common report wording, one tap each.
// Edible-oil / agro-food maintenance context.
const QUICK_CAUSES = [
    'Usure normale de la pièce',
    'Défaut de lubrification',
    'Encrassement / accumulation de résidus',
    'Fuite d\'huile',
    'Desserrage dû aux vibrations',
    'Surchauffe du moteur',
    'Roulement endommagé',
    'Courroie usée',
    'Joint d\'étanchéité défectueux',
    'Capteur déréglé',
];
const QUICK_ACTIONS = [
    'Remplacement de la pièce défectueuse',
    'Nettoyage et dégraissage du mécanisme',
    'Resserrage des fixations et raccords',
    'Lubrification (graisse NSF H1)',
    'Remplacement du roulement',
    'Remplacement de la courroie',
    'Remplacement du joint d\'étanchéité',
    'Réglage et calibrage',
    'Purge du circuit',
    'Contrôle et test de bon fonctionnement',
];

/** Append a phrase to existing text, separated cleanly. */
const appendPhrase = (current: string, phrase: string) =>
    current.trim() ? current.trim() + '. ' + phrase : phrase;

/** A row of one-tap phrase chips shown above a textarea. */
function QuickChips({ phrases, onPick }: { phrases: string[]; onPick: (p: string) => void }) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                <Zap size={12} color="#f97316" /> Actions rapides
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {phrases.map(p => (
                    <button key={p} type="button" onClick={() => onPick(p)} style={{
                        fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--surface-hover)',
                        color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#ea580c'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                        + {p}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ReportFormContent() {
    const { showToast } = useToast();
    const { interventions, machines, spareParts } = useData();
    const searchParams = useSearchParams();
    const intId = searchParams.get('id') || interventions[0]?.id;
    const intervention = interventions.find(i => i.id === intId);
    const machine = machines.find(m => m.id === intervention?.machineId);

    const [actionDone, setActionDone] = useState(intervention?.actionDone || '');
    const [probableCause, setProbableCause] = useState(intervention?.probableCause || '');
    const [selectedParts, setSelectedParts] = useState<{ id: string; name: string; ref: string; qty: number }[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // ── T5 — schedule a follow-up preventive plan from the closed intervention ──
    const [planScheduled, setPlanScheduled] = useState(false);
    const [planSubmitting, setPlanSubmitting] = useState(false);
    const [planFrequency, setPlanFrequency] = useState(30);
    const schedulePreventive = async () => {
        if (!intervention || !machine) return;
        setPlanSubmitting(true);
        try {
            const now = new Date();
            const next = new Date(now); next.setDate(next.getDate() + planFrequency);
            await maintenancePlansDb.create({
                machineId: machine.id,
                title: `Contrôle préventif suite à ${intervention.description.slice(0, 80)}`,
                interventionType: 'préventive',
                frequencyDays: planFrequency,
                lastDoneDate: now.toISOString(),
                nextDueDate: next.toISOString(),
                active: true,
                notes: probableCause
                    ? `Suite à l'intervention "${intervention.description}". Cause d'origine : ${probableCause}.`
                    : `Suite à l'intervention "${intervention.description}".`,
            });
            setPlanScheduled(true);
            showToast(`✅ Préventif planifié — prochaine échéance dans ${planFrequency} jours`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de la planification', 'error');
        } finally {
            setPlanSubmitting(false);
        }
    };

    // ── Intervention timer — start/pause/stop, persisted in localStorage so
    // the technician can navigate away and come back. On stop, the elapsed
    // time is offered as a value for `downtimeHours` in the saved report.
    const timerKey = `intv-timer-${intId || ''}`;
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerStartAt, setTimerStartAt] = useState<number | null>(null);
    const [timerAccumMs, setTimerAccumMs] = useState(0);
    const [timerTick, setTimerTick] = useState(0); // forces re-render every second
    useEffect(() => {
        try {
            const raw = localStorage.getItem(timerKey);
            if (raw) {
                const s = JSON.parse(raw);
                setTimerAccumMs(s.accumMs ?? 0);
                if (s.startAt) { setTimerStartAt(s.startAt); setTimerRunning(true); }
            }
        } catch { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timerKey]);
    useEffect(() => {
        if (!timerRunning) return;
        const id = setInterval(() => setTimerTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [timerRunning]);
    const elapsedMs = timerAccumMs + (timerRunning && timerStartAt ? Date.now() - timerStartAt : 0);
    const persistTimer = (running: boolean, startAt: number | null, accumMs: number) => {
        try { localStorage.setItem(timerKey, JSON.stringify({ running, startAt, accumMs })); } catch { /* ignore */ }
    };
    const startTimer = () => {
        const now = Date.now();
        setTimerStartAt(now); setTimerRunning(true);
        persistTimer(true, now, timerAccumMs);
    };
    const pauseTimer = () => {
        if (!timerRunning || !timerStartAt) return;
        const newAccum = timerAccumMs + (Date.now() - timerStartAt);
        setTimerAccumMs(newAccum); setTimerStartAt(null); setTimerRunning(false);
        persistTimer(false, null, newAccum);
    };
    const resetTimer = () => {
        setTimerStartAt(null); setTimerRunning(false); setTimerAccumMs(0);
        try { localStorage.removeItem(timerKey); } catch { /* ignore */ }
    };
    void timerTick; // referenced to keep the per-second re-render via setTimerTick

    // ── Photo attachments — base64 dataURLs saved into intervention.attachments (JSONB)
    const [attachments, setAttachments] = useState<InterventionAttachment[]>(
        (intervention?.attachments ?? []) as InterventionAttachment[]);
    /** Camera mode tracks both kind (photo/video) and T8 phase (before|after). */
    const [cameraMode, setCameraMode] = useState<{ kind: 'photo' | 'video'; phase: 'before' | 'after' } | null>(null);
    const hasBefore = attachments.some(a => a.phase === 'before');
    const handlePhotoCaptured = async (blob: Blob) => {
        const phase = cameraMode?.phase ?? 'after';
        setCameraMode(null);
        try {
            const dataUrl = await compressPhoto(blob);
            setAttachments(prev => [...prev, { type: 'photo', dataUrl, capturedAt: new Date().toISOString(), phase }]);
            showToast(phase === 'before' ? '📸 Photo « avant » enregistrée' : '📷 Photo ajoutée');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur photo', 'error');
        }
    };
    const handleVideoCaptured = async (blob: Blob) => {
        const phase = cameraMode?.phase ?? 'after';
        setCameraMode(null);
        if (blob.size > 5 * 1024 * 1024) {
            showToast('Vidéo trop volumineuse (max 5 Mo) — préférez une photo', 'error');
            return;
        }
        try {
            const dataUrl = await blobToDataURL(blob);
            setAttachments(prev => [...prev, { type: 'video', dataUrl, capturedAt: new Date().toISOString(), phase }]);
            showToast('🎥 Vidéo ajoutée');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur vidéo', 'error');
        }
    };
    const removeAttachment = (i: number) =>
        setAttachments(prev => prev.filter((_, idx) => idx !== i));

    // Persist the report: close the intervention + deduct used parts from stock.
    const handleSubmit = async () => {
        if (!intervention) { showToast('Intervention introuvable', 'error'); return; }
        setSubmitting(true);
        try {
            const partsCost = selectedParts.reduce((s, p) => {
                const sp = spareParts.find(x => x.id === p.id);
                return s + (sp?.unitCost ?? 0) * p.qty;
            }, 0);
            // If the technician used the timer, use the measured downtime
            const usedTimer = elapsedMs > 1000;
            const downtimeHours = usedTimer
                ? Math.round((elapsedMs / 3600000) * 100) / 100
                : intervention.downtimeHours;
            const downtimeCost = usedTimer
                ? Math.round(downtimeHours * (machine?.hourlyDowntimeCost ?? 0))
                : intervention.downtimeCost;
            await interventionsDb.update(intervention.id, {
                actionDone,
                probableCause,
                status: 'terminée',
                endDate: new Date().toISOString(),
                partsCost,
                downtimeHours,
                downtimeCost,
                totalCost: (intervention.laborCost ?? 0) + partsCost + downtimeCost,
                attachments,
            });
            // Deduct each used part from inventory stock
            await Promise.all(selectedParts.map(async p => {
                const sp = spareParts.find(x => x.id === p.id);
                if (sp) await sparePartsDb.update(sp.id, { quantity: Math.max(0, sp.quantity - p.qty) });
            }));
            // Clear the running timer for this intervention
            try { localStorage.removeItem(timerKey); } catch { /* ignore */ }
            showToast('✅ Intervention clôturée et enregistrée');
            setSubmitted(true);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Searchable parts combobox
    const [partSearch, setPartSearch] = useState('');
    const [partDropdownOpen, setPartDropdownOpen] = useState(false);
    const filteredParts = spareParts.filter(sp =>
        sp.name.toLowerCase().includes(partSearch.toLowerCase()) ||
        sp.reference.toLowerCase().includes(partSearch.toLowerCase())
    );

    // ====== VOICE DICTATION ======
    // Local recording + bundled Whisper. The mic can target either of the two
    // text fields — the active target is tracked in a ref so the recorder's
    // onstop closure sees the latest one.
    type DictationTarget = 'cause' | 'action';
    const [dictationMode, setDictationMode] = useState<'speech' | 'recording' | null>(null);
    const [dictationTarget, setDictationTarget] = useState<DictationTarget | null>(null);
    const dictationTargetRef = useRef<DictationTarget>('action');
    const [audioMemo, setAudioMemo] = useState<string | null>(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [transcribing, setTranscribing] = useState(false);
    const [transcribeMsg, setTranscribeMsg] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);

    const fmtRecordingTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // Start local audio recording (MediaRecorder — works 100% offline,
    // then Whisper transcribes from the model bundled in public/models/).
    const startLocalRecording = useCallback(async (target: DictationTarget = 'action') => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            showToast('🎤 Le microphone n\'est pas disponible sur cet appareil.', 'error');
            return;
        }
        dictationTargetRef.current = target;
        setDictationTarget(target);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                },
            });
            micStreamRef.current = stream;
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';
            const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream, options);
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setAudioMemo(url);
                stream.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
                // Transcribe audio to text using Whisper AI
                setTranscribing(true);
                setTranscribeMsg('Démarrage...');
                transcribeBlob(blob, (msg) => setTranscribeMsg(msg))
                    .then(text => {
                        if (text) {
                            const setter = dictationTargetRef.current === 'cause'
                                ? setProbableCause : setActionDone;
                            setter(prev => {
                                const base = prev.replace(/\[\.\.\.].*/, '').trim();
                                return base ? base + ' ' + text : text;
                            });
                            const label = dictationTargetRef.current === 'cause'
                                ? 'cause probable' : 'action réalisée';
                            showToast(`✅ Transcription insérée dans « ${label} »`);
                        } else {
                            showToast('⚠️ Parole non détectée — parlez plus fort ou réessayez', 'info');
                        }
                    })
                    .catch(() => {
                        showToast('⚠️ Parole non détectée — parlez plus fort et réessayez', 'info');
                    })
                    .finally(() => {
                        setTranscribing(false);
                        setTranscribeMsg('');
                    });
            };
            mediaRecorderRef.current = recorder;
            recorder.start(100);
            setIsRecording(true);
            setDictationMode('recording');
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
            showToast('🎙️ Enregistrement vocal — parlez, puis appuyez à nouveau pour arrêter');
        } catch (err) {
            const name = err instanceof Error ? err.name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                showToast('🎤 Accès au microphone refusé. Autorisez le micro pour cette application, puis réessayez.', 'error');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                showToast('🎤 Aucun microphone détecté. Branchez un micro et réessayez.', 'error');
            } else if (name === 'NotReadableError') {
                showToast('🎤 Le microphone est utilisé par une autre application. Fermez-la et réessayez.', 'error');
            } else {
                showToast('🎤 Impossible d\'accéder au microphone.', 'error');
            }
            setIsRecording(false);
            setDictationMode(null);
        }
    }, [showToast]);

    const stopLocalRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        setIsRecording(false);
        setDictationMode(null);
        setDictationTarget(null);
    }, []);

    // Voice dictation uses local recording + bundled Whisper — fully offline
    // and reliable. The same mic logic powers both text fields; the caller
    // says which field the transcription should land in.
    const toggleRecording = useCallback((target: DictationTarget) => {
        if (transcribing) return;             // ignore taps while Whisper runs
        if (isRecording) stopLocalRecording();
        else startLocalRecording(target);
    }, [isRecording, transcribing, startLocalRecording, stopLocalRecording]);

    const addPart = (sp: typeof spareParts[0]) => {
        if (selectedParts.find(p => p.id === sp.id)) return;
        setSelectedParts(prev => [...prev, { id: sp.id, name: sp.name, ref: sp.reference, qty: 1 }]);
        setPartSearch('');
        setPartDropdownOpen(false);
    };

    const removePart = (id: string) => {
        setSelectedParts(prev => prev.filter(p => p.id !== id));
    };

    if (submitted) {
        return (
            <>
                <Header title="Rapport envoyé" subtitle="Intervention clôturée" />
                <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                    <div style={{
                        maxWidth: 480, margin: '60px auto', textAlign: 'center',
                        background: 'var(--surface)', borderRadius: 24, padding: '48px 32px',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: '50%',
                            background: '#0e7c3f',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 24px',
                            boxShadow: '0 8px 32px rgba(34, 197, 94, 0.3)',
                        }}>
                            <CheckCircle size={40} color="white" />
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Rapport enregistré !</h2>
                        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
                            L&apos;intervention sur <b>{machine?.code}</b> a été clôturée avec succès.
                        </p>

                        {/* T5 — schedule preventive */}
                        {!planScheduled ? (
                            <div style={{
                                marginBottom: 20, padding: '16px 20px', borderRadius: 14,
                                background: '#fff7ed', border: '1px solid #fed7aa', textAlign: 'left',
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#9a3412', marginBottom: 6 }}>
                                    🔁 Planifier un préventif récurrent ?
                                </div>
                                <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 10, opacity: 0.85 }}>
                                    Si la panne risque de se reproduire, créez un contrôle préventif sur cette machine.
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, color: '#9a3412' }}>Fréquence :</span>
                                    {[15, 30, 60, 90].map(d => (
                                        <button key={d} type="button" onClick={() => setPlanFrequency(d)} style={{
                                            padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                            border: '1px solid ' + (planFrequency === d ? '#ea580c' : '#fed7aa'),
                                            background: planFrequency === d ? '#ea580c' : 'white',
                                            color: planFrequency === d ? 'white' : '#9a3412',
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}>{d} j</button>
                                    ))}
                                    <button onClick={schedulePreventive} disabled={planSubmitting} style={{
                                        marginLeft: 'auto', padding: '7px 14px', borderRadius: 9, border: 'none',
                                        background: '#c2410c', color: 'white', fontWeight: 700, fontSize: 12.5,
                                        cursor: planSubmitting ? 'wait' : 'pointer', opacity: planSubmitting ? 0.7 : 1,
                                        fontFamily: 'inherit',
                                    }}>{planSubmitting ? '...' : 'Planifier'}</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                marginBottom: 20, padding: '12px 16px', borderRadius: 12,
                                background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', fontSize: 13, fontWeight: 600,
                            }}>✅ Préventif planifié — il apparaîtra dans Plans préventifs.</div>
                        )}

                        <Link
                            href="/technician/dashboard"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '14px 28px', borderRadius: 14,
                                background: '#b45309',
                                color: 'white', fontWeight: 700, fontSize: 15,
                                textDecoration: 'none', boxShadow: '0 4px 16px rgba(249,115,22,0.3)',
                            }}
                        >
                            Retour aux interventions
                        </Link>
                    </div>
                </main>
            </>
        );
    }

    return (
        <>
            <Header title="Rapport d'intervention" subtitle={`${machine?.code} — ${machine?.name}`} />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                <Link
                    href="/technician/dashboard"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 14, color: 'var(--primary)', textDecoration: 'none',
                        fontWeight: 500, marginBottom: 20,
                    }}
                >
                    <ArrowLeft size={16} /> Retour
                </Link>

                <div style={{ maxWidth: 640, margin: '0 auto' }}>
                    {/* Info card */}
                    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <ClipboardList size={24} color="#f97316" />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{intervention?.description}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {intervention?.interventionType} · {intervention?.downtimeHours}h d&apos;arrêt
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Timer card — measure the actual intervention time ── */}
                    <div data-tour="rapport-chrono" className="card" style={{ padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 14,
                            background: timerRunning ? '#0e7c3f' : 'var(--surface-hover)',
                            color: timerRunning ? 'white' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            animation: timerRunning ? 'pulse-soft 1.5s infinite' : 'none',
                        }}>
                            {timerRunning ? <Pause size={26} /> : <Play size={26} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <div className="section-eyebrow" style={{ marginBottom: 6 }}>
                                Temps d&apos;intervention
                            </div>
                            <div style={{ fontFamily: 'ui-monospace, "JetBrains Mono", "Courier New", monospace', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
                                {HHMMSS(elapsedMs)}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                {elapsedMs > 0
                                    ? `≈ ${(elapsedMs / 3600000).toFixed(2)} h — utilisée comme durée d'arrêt`
                                    : 'Démarrez le chrono à votre arrivée sur la machine'}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {!timerRunning ? (
                                <button onClick={startTimer} style={{
                                    padding: '10px 18px', borderRadius: 12, border: 'none',
                                    background: '#0e7c3f', color: 'white',
                                    fontWeight: 700, cursor: 'pointer', fontSize: 13.5,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}><Play size={15} /> Démarrer</button>
                            ) : (
                                <button onClick={pauseTimer} style={{
                                    padding: '10px 18px', borderRadius: 12, border: 'none',
                                    background: '#b45309', color: 'white',
                                    fontWeight: 700, cursor: 'pointer', fontSize: 13.5,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}><Pause size={15} /> Mettre en pause</button>
                            )}
                            {elapsedMs > 0 && (
                                <button onClick={resetTimer} style={{
                                    padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)',
                                    background: 'var(--surface)', color: 'var(--text-secondary)',
                                    fontWeight: 700, cursor: 'pointer', fontSize: 13.5,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}><RotateCcw size={15} /> Réinitialiser</button>
                            )}
                        </div>
                    </div>

                    {/* T8 — "Photo avant" prompt — once captured, fades into the gallery below. */}
                    {!hasBefore && (
                        <div data-tour="rapport-photo-avant" style={{
                            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                            padding: '14px 16px', borderRadius: 14, marginBottom: 24,
                            background: '#eff6ff', border: '1px dashed #93c5fd',
                        }}>
                            <Camera size={20} color="#2563eb" />
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1d4ed8' }}>📸 Photo « avant »</div>
                                <div style={{ fontSize: 12, color: '#1d4ed8', opacity: 0.8 }}>
                                    Capturez l&apos;état de la machine avant d&apos;intervenir — utile pour l&apos;analyse de cause racine.
                                </div>
                            </div>
                            <button onClick={() => setCameraMode({ kind: 'photo', phase: 'before' })} style={{
                                padding: '9px 16px', borderRadius: 10, border: 'none',
                                background: '#2563eb', color: 'white', fontWeight: 700, fontSize: 13,
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                            }}>
                                <Camera size={14} /> Prendre la photo
                            </button>
                        </div>
                    )}

                    {/* Form */}
                    <div data-tour="rapport-form" className="card" style={{ padding: 24 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Rédiger le rapport</h3>

                        <div data-tour="rapport-cause" style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Cause probable
                            </label>
                            <QuickChips phrases={QUICK_CAUSES} onPick={p => setProbableCause(c => appendPhrase(c, p))} />
                            <div style={{ position: 'relative' }}>
                                <textarea
                                    className="input"
                                    style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit', paddingRight: 56 }}
                                    value={probableCause}
                                    onChange={(e) => setProbableCause(e.target.value)}
                                    placeholder="Décrivez la cause probable de la panne..."
                                />
                                <button
                                    onClick={() => toggleRecording('cause')}
                                    disabled={transcribing}
                                    style={{
                                        position: 'absolute', right: 8, bottom: 8,
                                        width: 38, height: 38, borderRadius: 10,
                                        background: transcribing ? '#94a3b8'
                                            : (isRecording && dictationTarget === 'cause')
                                                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                                : '#b45309',
                                        border: 'none', cursor: transcribing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white',
                                        boxShadow: (isRecording && dictationTarget === 'cause')
                                            ? '0 0 14px rgba(239,68,68,0.4)'
                                            : '0 3px 8px rgba(249,115,22,0.25)',
                                        animation: (isRecording && dictationTarget === 'cause') ? 'pulse-soft 1s infinite' : 'none',
                                        opacity: transcribing ? 0.7 : 1,
                                    }}
                                    title={(isRecording && dictationTarget === 'cause') ? 'Arrêter la dictée' : 'Dictée vocale — cause probable'}
                                >
                                    {(isRecording && dictationTarget === 'cause') ? <MicOff size={18} /> : <Mic size={18} />}
                                </button>
                            </div>
                        </div>

                        <div data-tour="rapport-action" style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Action réalisée
                            </label>
                            <QuickChips phrases={QUICK_ACTIONS} onPick={p => setActionDone(c => appendPhrase(c, p))} />
                            <div style={{ position: 'relative' }}>
                                <textarea
                                    className="input"
                                    style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit', paddingRight: 56 }}
                                    value={actionDone}
                                    onChange={(e) => setActionDone(e.target.value)}
                                    placeholder="Décrivez ce que vous avez fait pour résoudre le problème..."
                                />
                                {/* Voice button */}
                                <button
                                    onClick={() => toggleRecording('action')}
                                    disabled={transcribing}
                                    style={{
                                        position: 'absolute', right: 8, bottom: 8,
                                        width: 44, height: 44, borderRadius: 12,
                                        background: transcribing ? '#94a3b8'
                                            : (isRecording && dictationTarget === 'action')
                                                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                                : '#b45309',
                                        border: 'none', cursor: transcribing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white',
                                        boxShadow: (isRecording && dictationTarget === 'action') ? '0 0 20px rgba(239,68,68,0.4)' : '0 4px 12px rgba(249,115,22,0.3)',
                                        transition: 'all 0.2s',
                                        animation: (isRecording && dictationTarget === 'action') ? 'pulse-soft 1s infinite' : 'none',
                                        opacity: transcribing ? 0.7 : 1,
                                    }}
                                    title={transcribing ? 'Transcription en cours...' : (isRecording && dictationTarget === 'action') ? 'Arrêter la dictée' : 'Dictée vocale — action réalisée'}
                                >
                                    {(isRecording && dictationTarget === 'action') ? <MicOff size={22} /> : <Mic size={22} />}
                                </button>
                            </div>
                            {/* Speech-to-text active indicator */}
                            {isRecording && dictationMode === 'speech' && (
                                <div style={{ fontSize: 12, color: '#f97316', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'pulse-soft 1s infinite' }} />
                                    🎤 Dictée vocale active — parlez, le texte apparaîtra automatiquement...
                                </div>
                            )}
                            {/* Local recording mode indicator */}
                            {isRecording && dictationMode === 'recording' && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                                    padding: '10px 14px', borderRadius: 10,
                                    background: '#fef2f2', border: '1px solid #fca5a5',
                                }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse-soft 1s infinite' }} />
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>🎙️ Mémo audio (hors-ligne)</span>
                                        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>Connexion requise pour la transcription — le mémo sera joint au rapport</div>
                                    </div>
                                    <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#dc2626', marginLeft: 'auto' }}>
                                        {fmtRecordingTime(recordingSeconds)}
                                    </span>
                                </div>
                            )}
                            {/* Transcribing progress indicator */}
                            {transcribing && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                                    padding: '10px 14px', borderRadius: 10,
                                    background: '#eff6ff', border: '1px solid #bfdbfe',
                                }}>
                                    <div style={{
                                        width: 16, height: 16, border: '2px solid #3b82f6',
                                        borderTopColor: 'transparent', borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite', flexShrink: 0,
                                    }} />
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>🧠 {transcribeMsg || 'Transcription...'}</span>
                                        <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>Le texte va apparaître automatiquement dans la description</div>
                                    </div>
                                </div>
                            )}
                            {/* Audio memo playback */}
                            {audioMemo && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                                    padding: '10px 14px', borderRadius: 10,
                                    background: '#f0fdf4', border: '1px solid #86efac',
                                }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✅ Mémo vocal joint</span>
                                    <audio controls src={audioMemo} style={{ flex: 1, height: 32 }} />
                                    <button onClick={() => { if (audioMemo) URL.revokeObjectURL(audioMemo); setAudioMemo(null); }} style={{
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4,
                                    }}><X size={14} /></button>
                                </div>
                            )}
                        </div>

                        {/* ── Photo / video attachments — proof of work or before/after ── */}
                        <div data-tour="rapport-attachments" style={{ marginBottom: 24 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Photos / vidéos jointes
                            </label>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: attachments.length ? 12 : 0 }}>
                                <button type="button" onClick={() => setCameraMode({ kind: 'photo', phase: 'after' })} style={{
                                    padding: '10px 16px', borderRadius: 10,
                                    background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                }}>
                                    <Camera size={15} /> Prendre une photo
                                </button>
                                <button type="button" onClick={() => setCameraMode({ kind: 'video', phase: 'after' })} style={{
                                    padding: '10px 16px', borderRadius: 10,
                                    background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                }}>
                                    <ImageIcon size={15} /> Vidéo courte
                                </button>
                                {attachments.length > 0 && (
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
                                        {attachments.length} pièce{attachments.length > 1 ? 's' : ''} jointe{attachments.length > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            {attachments.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                                    {attachments.map((a, i) => (
                                        <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1', background: '#000' }}>
                                            {a.type === 'photo' ? (
                                                <img src={a.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <video src={a.dataUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
                                            )}
                                            {a.phase && (
                                                <span style={{
                                                    position: 'absolute', top: 4, left: 4,
                                                    padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 800,
                                                    background: a.phase === 'before' ? 'rgba(37,99,235,0.9)' : 'rgba(22,163,74,0.9)',
                                                    color: 'white', letterSpacing: '0.04em', textTransform: 'uppercase',
                                                }}>{a.phase === 'before' ? 'Avant' : 'Après'}</span>
                                            )}
                                            <button type="button" onClick={() => removeAttachment(i)} title="Retirer"
                                                style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(239,68,68,0.85)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Searchable Spare Parts Combobox — NO manual text input */}
                        <div data-tour="rapport-parts" style={{ marginBottom: 24 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Pièces utilisées
                            </label>

                            {/* Selected parts chips */}
                            {selectedParts.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                    {selectedParts.map(p => (
                                        <div key={p.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '4px 10px', borderRadius: 8,
                                            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                                            fontSize: 12, fontWeight: 600, color: '#f97316',
                                        }}>
                                            {p.name} ({p.ref})
                                            <button onClick={() => removePart(p.id)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                padding: 0, color: '#f97316', display: 'flex',
                                            }}>
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Searchable input */}
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="input"
                                    style={{ paddingLeft: 34, fontSize: 14 }}
                                    placeholder="🔍 Rechercher une pièce dans l'inventaire..."
                                    value={partSearch}
                                    onChange={e => { setPartSearch(e.target.value); setPartDropdownOpen(true); }}
                                    onFocus={() => setPartDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setPartDropdownOpen(false), 200)}
                                />
                                {partDropdownOpen && partSearch.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        borderRadius: 10, maxHeight: 200, overflowY: 'auto',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
                                    }}>
                                        {filteredParts.length === 0 && (
                                            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>Aucune pièce trouvée</div>
                                        )}
                                        {filteredParts.map(sp => (
                                            <button key={sp.id} onMouseDown={() => addPart(sp)} style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 14px', border: 'none', background: 'transparent',
                                                cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{sp.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sp.reference}</div>
                                                </div>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                                    background: sp.quantity > 5 ? 'rgba(34,197,94,0.1)' : sp.quantity > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                                                    color: sp.quantity > 5 ? '#22c55e' : sp.quantity > 0 ? '#f59e0b' : '#ef4444',
                                                }}>
                                                    Stock: {sp.quantity}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            data-tour="rapport-save"
                            style={{
                                width: '100%', padding: '16px',
                                borderRadius: 14,
                                background: '#0e7c3f',
                                border: 'none', color: 'white', fontWeight: 700, fontSize: 16,
                                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                boxShadow: '0 8px 24px rgba(34, 197, 94, 0.3)',
                                transition: 'transform 0.2s',
                            }}
                        >
                            <Save size={20} /> {submitting ? 'Enregistrement…' : 'Clôturer l\'intervention'}
                        </button>
                    </div>
                </div>

                {/* Camera capture overlay — photo or short video */}
                {cameraMode && (
                    <CameraCapture
                        mode={cameraMode.kind}
                        onCapture={cameraMode.kind === 'photo' ? handlePhotoCaptured : handleVideoCaptured}
                        onClose={() => setCameraMode(null)}
                    />
                )}
            </main>
        </>
    );
}

export default function TechnicianReport() {
    return (
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Chargement...</div>}>
            <ReportFormContent />
        </Suspense>
    );
}
