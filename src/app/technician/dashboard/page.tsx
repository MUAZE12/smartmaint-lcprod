'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { interventionsDb, sparePartsDb } from '@/lib/db';
import type { Intervention } from '@/lib/types';
import {
    ScanLine, Zap, Play, Square, Mic, MicOff, CheckCircle, Clock,
    Wrench, ChevronRight, X, AlertTriangle, MapPin, Shield, Lock,
    ThumbsUp, Flag,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { transcribeBlob, getActiveModel } from '@/lib/transcription';

interface TimerState { [key: string]: { running: boolean; seconds: number } }

// Urgency config for Kanban cards
const urgencyConfig: Record<string, { label: string; color: string; bg: string; border: string; cssClass: string }> = {
    critique: { label: 'Critique', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5', cssClass: 'urgency-critical' },
    haute: { label: 'Haute', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', cssClass: 'urgency-high' },
    normale: { label: 'Normale', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd', cssClass: 'urgency-normal' },
};

// Safety requirements per machine
const safetyRequirements: Record<string, { icon: string; label: string }[]> = {
    'mach-001': [{ icon: '⚡', label: 'Consignation électrique requise' }],
    'mach-002': [{ icon: '⚡', label: 'Consignation électrique requise' }, { icon: '🔒', label: 'Lockout/Tagout' }],
    'mach-003': [{ icon: '🧤', label: 'Gants chimiques obligatoires' }, { icon: '🌡️', label: 'Risque brûlure thermique' }],
    'mach-004': [{ icon: '🔒', label: 'Lockout/Tagout' }],
    'mach-005': [{ icon: '✋', label: 'Protection des mains' }],
};

// Assign urgency levels to interventions
function getUrgency(int: Intervention): string {
    if (int.interventionType === 'corrective') return int.downtimeHours >= 6 ? 'critique' : 'haute';
    return 'normale';
}

export default function TechnicianDashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();
    // Subscribe to the live Supabase snapshot — admin-created interventions
    // and stock changes propagate to this dashboard in real time without
    // needing a refresh.
    const { machines, interventions, spareParts, technicians } = useData();

    // Resolve the logged-in technician's id from the live techs table.
    // Match by email first, then by display name; fall back to the legacy
    // tech-001 id so demo seeds still work.
    const techId = (() => {
        const e = user?.email?.toLowerCase();
        if (e) {
            const byEmail = technicians.find(t => t.email && t.email.toLowerCase() === e);
            if (byEmail) return byEmail.id;
        }
        const n = user?.name?.toLowerCase();
        if (n) {
            const byName = technicians.find(t => t.fullName && t.fullName.toLowerCase() === n);
            if (byName) return byName.id;
        }
        return 'tech-001';
    })();
    const myInterventions = interventions.filter(i => i.technicianId === techId || i.technicianId === null);
    const pending = myInterventions.filter(i => i.status === 'en cours' || i.status === 'planifiée');
    const done = myInterventions.filter(i => i.status === 'terminée' || i.status === 'clôturée');

    const [isQuickOpen, setIsQuickOpen] = useState(false);
    // Quick-intervention form. `parts` is the committed list of pieces
    // already added; `partId` + `quantity` is the current draft row in the
    // picker. Submit aggregates the whole list, deducts inventory per item.
    const [quickForm, setQuickForm] = useState<{
        machineId: string;
        description: string;
        partId: string;
        quantity: number;
        parts: { partId: string; quantity: number }[];
    }>({ machineId: '', description: '', partId: '', quantity: 1, parts: [] });
    const [quantityError, setQuantityError] = useState('');

    // Searchable spare parts combobox state
    const [partSearch, setPartSearch] = useState('');
    const [partDropdownOpen, setPartDropdownOpen] = useState(false);
    const filteredParts = spareParts.filter(sp =>
        sp.name.toLowerCase().includes(partSearch.toLowerCase()) ||
        sp.reference.toLowerCase().includes(partSearch.toLowerCase())
    );

    // Modal stopwatch — auto-starts on open
    const [modalTimer, setModalTimer] = useState({ running: false, seconds: 0 });
    const modalTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isQuickOpen && modalTimer.seconds === 0) {
            setModalTimer({ running: true, seconds: 0 });
        }
    }, [isQuickOpen]);

    useEffect(() => {
        if (modalTimer.running) {
            modalTimerRef.current = setInterval(() => {
                setModalTimer(prev => ({ ...prev, seconds: prev.seconds + 1 }));
            }, 1000);
        }
        return () => { if (modalTimerRef.current) clearInterval(modalTimerRef.current); };
    }, [modalTimer.running]);

    // Timers
    const [timers, setTimers] = useState<TimerState>({});
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const hasRunning = Object.values(timers).some(t => t.running);
        if (hasRunning) {
            timerRef.current = setInterval(() => {
                setTimers(prev => {
                    const next = { ...prev };
                    for (const key in next) {
                        if (next[key].running) next[key] = { ...next[key], seconds: next[key].seconds + 1 };
                    }
                    return next;
                });
            }, 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [timers]);

    const toggleTimer = (id: string) => {
        setTimers(prev => {
            const cur = prev[id] || { running: false, seconds: 0 };
            return { ...prev, [id]: { ...cur, running: !cur.running } };
        });
    };

    const fmtTime = (s: number) => {
        const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // ====== HYBRID VOICE DICTATION ======
    // 1) Try Web Speech API (works online — Chrome sends audio to Google)
    // 2) Auto-fallback to local audio recording via MediaRecorder (works offline)
    const [dictating, setDictating] = useState(false);
    const [dictationMode, setDictationMode] = useState<'speech' | 'recording' | null>(null);
    const [audioMemo, setAudioMemo] = useState<string | null>(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [transcribing, setTranscribing] = useState(false);
    const [transcribeMsg, setTranscribeMsg] = useState('');
    const recognitionRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const [showQuickPhrases, setShowQuickPhrases] = useState(false);

    // Quick maintenance phrases for fast insertion (works offline)
    const quickPhrases = [
        'Fuite d\'huile carter inférieur',
        'Bruit anormal moteur principal',
        'Vibration excessive arbre de transmission',
        'Courroie usée à remplacer',
        'Roulement HS côté commande',
        'Surchauffe moteur électrique',
        'Blocage mécanique axe principal',
        'Capteur de position défaillant',
        'Fuite pneumatique circuit principal',
        'Usure plaquettes de frein',
    ];

    const insertQuickPhrase = (phrase: string) => {
        setQuickForm(f => ({
            ...f,
            description: f.description ? f.description + '. ' + phrase : phrase
        }));
        setShowQuickPhrases(false);
    };

    // Start local audio recording (MediaRecorder — works 100% offline)
    const startLocalRecording = useCallback(async () => {
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
                setTranscribing(true);
                setTranscribeMsg('Démarrage...');
                transcribeBlob(blob, (msg) => setTranscribeMsg(msg))
                    .then(text => {
                        if (text) {
                            setQuickForm(f => {
                                const base = (f.description || '').replace(/\[\.\.\.].*/, '').trim();
                                return { ...f, description: base ? base + ' ' + text : text };
                            });
                            showToast(`✅ Transcription OK (${getActiveModel() || 'whisper'}) — texte inséré`);
                        } else {
                            showToast('⚠️ Parole non détectée — parlez plus fort et réessayez', 'info');
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
            setDictating(true);
            setDictationMode('recording');
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
            showToast('🎙️ Enregistrement vocal en cours — parlez puis appuyez pour arrêter');
        } catch (err: any) {
            if (err.name === 'NotAllowedError') {
                showToast('🎤 Accès au microphone refusé. Autorisez dans les paramètres du navigateur.', 'error');
            } else {
                showToast('Microphone introuvable. Vérifiez qu\'un micro est connecté.', 'error');
            }
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
        setDictating(false);
        setDictationMode(null);
    }, [showToast]);

    // Voice dictation uses local recording + bundled Whisper — fully offline
    // and reliable. (The Web Speech API needs Google's servers, which are
    // unreachable on the plant network, so it is not used.)
    const startDictation = useCallback(() => {
        startLocalRecording();
    }, [startLocalRecording]);

    const stopDictation = useCallback(() => {
        if (dictationMode === 'recording') {
            stopLocalRecording();
            return;
        }
        if (recognitionRef.current) {
            const ref = recognitionRef.current;
            recognitionRef.current = null;
            try { ref.stop(); } catch {}
        }
        setDictating(false);
        setDictationMode(null);
    }, [dictationMode, stopLocalRecording]);

    const toggleDictation = useCallback(() => {
        if (dictating) stopDictation();
        else startDictation();
    }, [dictating, startDictation, stopDictation]);

    const fmtRecordingTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // Spare part quantity validation
    const handlePartChange = (partId: string) => {
        setQuickForm(f => ({ ...f, partId, quantity: 1 }));
        setQuantityError('');
    };

    const handleQuantityChange = (qty: number) => {
        setQuickForm(f => ({ ...f, quantity: qty }));
        const selectedPart = spareParts.find(sp => sp.id === quickForm.partId);
        const availableStock = selectedPart?.quantity ?? 0;
        if (qty > availableStock) {
            setQuantityError(`⚠️ Stock insuffisant — seulement ${availableStock} disponible(s) en inventaire.`);
        } else {
            setQuantityError('');
        }
    };

    /** Move the current draft (partId + quantity in the picker) into the
     *  committed `parts` list so the technician can add another piece. */
    const addDraftPart = () => {
        if (!quickForm.partId) return;
        if (quantityError) return;
        // If the same part already exists, just bump the quantity.
        setQuickForm(f => {
            const existing = f.parts.find(p => p.partId === f.partId);
            const parts = existing
                ? f.parts.map(p => p.partId === f.partId ? { ...p, quantity: p.quantity + f.quantity } : p)
                : [...f.parts, { partId: f.partId, quantity: f.quantity }];
            return { ...f, parts, partId: '', quantity: 1 };
        });
        setPartSearch('');
        setQuantityError('');
    };
    const removePart = (partId: string) => setQuickForm(f => ({ ...f, parts: f.parts.filter(p => p.partId !== partId) }));

    const handleQuickSave = async (status: 'terminée' | 'en cours') => {
        if (quantityError) return;
        if (!quickForm.machineId || !quickForm.description.trim()) {
            showToast('Machine et description sont obligatoires', 'error');
            return;
        }
        // Auto-commit a draft row that the user filled but didn't click "+" on,
        // so they don't lose a piece they just typed.
        const allParts = quickForm.partId
            ? (() => {
                const existing = quickForm.parts.find(p => p.partId === quickForm.partId);
                return existing
                    ? quickForm.parts.map(p => p.partId === quickForm.partId ? { ...p, quantity: p.quantity + quickForm.quantity } : p)
                    : [...quickForm.parts, { partId: quickForm.partId, quantity: quickForm.quantity }];
            })()
            : quickForm.parts;
        try {
            // Sum cost across every committed part.
            const partsCost = allParts.reduce((s, p) => {
                const sp = spareParts.find(x => x.id === p.partId);
                return s + (sp ? sp.unitCost * p.quantity : 0);
            }, 0);
            const now = new Date().toISOString();
            await interventionsDb.create({
                machineId: quickForm.machineId,
                technicianId: null,
                interventionType: 'corrective',
                description: quickForm.description,
                probableCause: '',
                actionDone: status === 'terminée' ? quickForm.description : '',
                startDate: now,
                endDate: status === 'terminée' ? now : null,
                downtimeHours: 0, laborCost: 0, partsCost, downtimeCost: 0, totalCost: partsCost,
                status,
            });
            // Deduct every used part from inventory in parallel.
            await Promise.all(allParts.map(p => {
                const sp = spareParts.find(x => x.id === p.partId);
                if (!sp) return Promise.resolve();
                return sparePartsDb.update(sp.id, { quantity: Math.max(0, sp.quantity - p.quantity) });
            }));
            setIsQuickOpen(false);
            showToast(status === 'terminée' ? '✅ Intervention clôturée et enregistrée' : '🔧 Intervention enregistrée dans votre liste');
            setQuickForm({ machineId: '', description: '', partId: '', quantity: 1, parts: [] });
            setPartSearch('');
            setQuantityError('');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error');
        }
    };

    const handleAccept = (intId: string) => {
        showToast('✅ Bon de travail accepté');
        toggleTimer(intId);
    };

    const handleReport = (intId: string) => {
        showToast('📋 Problème signalé à l\'admin', 'info');
    };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };

    return (
        <>
            <Header title="Mes Interventions" subtitle={`Bonjour ${user?.name ?? 'Technicien'} — voici vos bons de travail`} />
            <main style={{ padding: '24px 32px' }}>
                {/* Hero action bar — Intervention Rapide as an inline
                    call-to-action at the top of the content. Replaces the
                    old floating orange FAB that overlapped the WO list. */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 18px',
                    borderRadius: 12,
                    background: 'linear-gradient(180deg, #fbf5e8 0%, #f8eed6 100%)',
                    border: '1px solid #ecd8ab',
                    marginBottom: 20,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#8a5a10', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                            Action rapide
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#4a3808', lineHeight: 1.4 }}>
                            Saisir une intervention hors OT (dépannage éclair, pièce consommée, geste préventif).
                        </div>
                    </div>
                    <button onClick={() => setIsQuickOpen(true)} style={{
                        padding: '11px 20px', borderRadius: 10,
                        background: '#b45309',
                        color: 'white', border: 'none', cursor: 'pointer',
                        fontWeight: 600, fontSize: 14, letterSpacing: '0.005em',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                        transition: 'background 0.15s ease, transform 0.05s ease',
                        fontFamily: 'inherit',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#c2670c'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#b45309'; }}
                        onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)'; }}
                        onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <Zap size={16} /> Intervention rapide
                    </button>
                </div>

                {/* Kanban work orders — section header uses the discreet
                    uppercase eyebrow pattern from the admin dashboard. */}
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Bons de travail en attente
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#fbf1e3', color: '#b45309', letterSpacing: '0' }}>{pending.length}</span>
                </h3>

                <div data-tour="tech-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 40 }}>
                    {pending.map(int => {
                        const machine = machines.find(m => m.id === int.machineId);
                        const timer = timers[int.id];
                        const urgency = getUrgency(int);
                        const urg = urgencyConfig[urgency];
                        const safety = safetyRequirements[int.machineId] || [];

                        return (
                            <div key={int.id} className={`kanban-card ${urg.cssClass}`} style={{ animationDelay: '0.1s' }}>
                                {/* Header: machine code + urgency badge */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 10,
                                            background: `${urg.color}15`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Wrench size={18} color={urg.color} />
                                        </div>
                                        <div>
                                            <span style={{ fontWeight: 700, fontSize: 15 }}>{machine?.code}</span>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{int.interventionType}</div>
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100,
                                        background: urg.bg, color: urg.color, border: `1px solid ${urg.border}`,
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        <Flag size={11} /> {urg.label}
                                    </span>
                                </div>

                                {/* Description */}
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                                    {int.description}
                                </p>

                                {/* Location */}
                                {machine && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        fontSize: 12, color: 'var(--text-muted)', marginBottom: 10,
                                        padding: '6px 10px', background: 'var(--surface-hover)', borderRadius: 8,
                                    }}>
                                        <MapPin size={13} /> {machine.workshop} — {machine.location}
                                    </div>
                                )}

                                {/* Safety requirements */}
                                {safety.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                                        {safety.map((s, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                fontSize: 11, fontWeight: 600, color: '#b45309',
                                                padding: '5px 10px', background: '#fffbeb',
                                                borderRadius: 6, border: '1px solid #fde68a',
                                            }}>
                                                <span style={{ fontSize: 14 }}>{s.icon}</span> {s.label}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Timer */}
                                {timer && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        marginBottom: 12, padding: '8px 12px',
                                        background: timer.running ? '#fef2f2' : 'var(--surface-hover)',
                                        borderRadius: 10, border: `1px solid ${timer.running ? '#fca5a5' : 'var(--border-light)'}`,
                                    }}>
                                        <Clock size={14} color={timer.running ? '#ef4444' : 'var(--text-muted)'} />
                                        <span style={{
                                            fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
                                            color: timer.running ? '#ef4444' : 'var(--text-primary)',
                                        }}>
                                            {fmtTime(timer.seconds)}
                                        </span>
                                        <button onClick={() => toggleTimer(int.id)} style={{
                                            marginLeft: 'auto', padding: '4px 10px', borderRadius: 6,
                                            fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                                            background: timer.running ? '#ef4444' : '#22c55e', color: 'white',
                                        }}>
                                            {timer.running ? <><Square size={10} /> Stop</> : <><Play size={10} /> Go</>}
                                        </button>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button
                                        onClick={() => handleAccept(int.id)}
                                        style={{
                                            flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                            cursor: 'pointer', border: 'none',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            boxShadow: '0 4px 12px rgba(34,197,94,0.2)',
                                            transition: 'transform 0.2s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <ThumbsUp size={14} /> Accepter
                                    </button>
                                    <button
                                        onClick={() => handleReport(int.id)}
                                        style={{
                                            flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                            cursor: 'pointer',
                                            background: 'transparent', color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                    >
                                        <AlertTriangle size={14} /> Signaler
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Completed */}
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle size={20} color="#22c55e" /> Interventions terminées
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#f0fdf4', color: '#22c55e', marginLeft: 4 }}>{done.length}</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {done.map(int => {
                        const machine = machines.find(m => m.id === int.machineId);
                        return (
                            <div key={int.id} className="card" style={{ padding: '14px 20px', opacity: 0.75 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <CheckCircle size={16} color="#22c55e" />
                                    <span style={{ fontWeight: 600 }}>{machine?.code}</span>
                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{int.description}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{int.downtimeHours}h</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* ====== ENHANCED QUICK INTERVENTION MODAL ====== */}
            <Modal isOpen={isQuickOpen} onClose={() => { setIsQuickOpen(false); setQuantityError(''); setModalTimer({ running: false, seconds: 0 }); }} title="" subtitle="" size="md"
                footer={
                    <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        <button onClick={() => handleQuickSave('en cours')} disabled={!!quantityError} style={{
                            flex: 1, padding: '14px', borderRadius: 12,
                            background: quantityError ? 'var(--surface-active)' : 'linear-gradient(135deg, #f97316, #c2410c)',
                            color: quantityError ? 'var(--text-muted)' : 'white', border: 'none', fontWeight: 700, fontSize: 14,
                            cursor: quantityError ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                            ⏸️ Hold Intervention
                        </button>
                        <button onClick={() => handleQuickSave('terminée')} disabled={!!quantityError} style={{
                            flex: 1, padding: '14px', borderRadius: 12,
                            background: quantityError ? 'var(--surface-active)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: quantityError ? 'var(--text-muted)' : 'white', border: 'none', fontWeight: 700, fontSize: 14,
                            cursor: quantityError ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            boxShadow: quantityError ? 'none' : '0 4px 16px rgba(34,197,94,0.3)',
                        }}>
                            ✅ Clôturer &amp; valider
                        </button>
                    </div>
                }>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Machine Header with Active Pulse */}
                    {quickForm.machineId && (() => {
                        const selectedMachine = machines.find(m => m.id === quickForm.machineId);
                        return selectedMachine ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                                borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)',
                            }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #f97316, #c2410c)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Wrench size={20} color="white" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>{selectedMachine.code} — {selectedMachine.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedMachine.workshop} • {selectedMachine.location}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 1.5s infinite' }} />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>En cours</span>
                                </div>
                            </div>
                        ) : null;
                    })()}

                    {/* Auto-starting Stopwatch */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 12,
                        background: modalTimer.running ? 'rgba(249,115,22,0.08)' : 'var(--surface-hover)',
                        border: `1px solid ${modalTimer.running ? 'rgba(249,115,22,0.2)' : 'var(--border)'}`,
                    }}>
                        <Clock size={18} color={modalTimer.running ? '#f97316' : 'var(--text-muted)'} />
                        <span style={{
                            fontFamily: 'monospace', fontSize: 28, fontWeight: 800, letterSpacing: '0.05em',
                            color: modalTimer.running ? '#f97316' : 'var(--text-primary)',
                        }}>
                            {fmtTime(modalTimer.seconds)}
                        </span>
                        <button onClick={() => setModalTimer(prev => ({ ...prev, running: !prev.running }))} style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 4,
                            background: modalTimer.running ? '#f97316' : '#22c55e', color: 'white',
                        }}>
                            {modalTimer.running ? <><Square size={10} /> Pause</> : <><Play size={10} /> Start</>}
                        </button>
                    </div>

                    {/* Machine selector */}
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Machine concernée</label>
                        <select style={inputStyle} value={quickForm.machineId} onChange={e => setQuickForm(f => ({ ...f, machineId: e.target.value }))}>
                            <option value="">Sélectionner</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                        </select>
                    </div>

                    {/* Description with Voice + Quick Phrases */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description du problème</label>
                            <button onClick={() => setShowQuickPhrases(!showQuickPhrases)} style={{
                                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                                background: showQuickPhrases ? '#eff6ff' : 'var(--surface-hover)',
                                color: showQuickPhrases ? '#3b82f6' : 'var(--text-muted)',
                                border: `1px solid ${showQuickPhrases ? '#93c5fd' : 'var(--border)'}`,
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}>⚡ Phrases rapides</button>
                        </div>
                        {/* Quick phrase grid */}
                        {showQuickPhrases && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, animation: 'fadeIn 0.2s ease' }}>
                                {quickPhrases.map((phrase, i) => (
                                    <button key={i} onClick={() => insertQuickPhrase(phrase)} style={{
                                        padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                                        background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                        cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316'; e.currentTarget.style.background = '#fff7ed'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                    >{phrase}</button>
                                ))}
                            </div>
                        )}
                        <div style={{ position: 'relative' }}>
                            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', paddingRight: 56 }} value={quickForm.description} onChange={e => setQuickForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Fuite d'huile carter inférieur" />
                            <button onClick={toggleDictation} disabled={transcribing} style={{
                                position: 'absolute', right: 8, top: 8, width: 42, height: 42, borderRadius: 12,
                                background: transcribing
                                    ? '#9ca3af'
                                    : dictating
                                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                        : 'linear-gradient(135deg, #3b82f6, #1e40af)',
                                border: 'none', cursor: transcribing ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                animation: dictating && !transcribing ? 'pulse-soft 1s infinite' : 'none',
                                boxShadow: transcribing ? 'none' : dictating ? '0 0 16px rgba(239,68,68,0.4)' : '0 4px 12px rgba(59,130,246,0.3)',
                            }}>
                                {dictating ? <MicOff size={20} color="white" /> : <Mic size={20} color="white" />}
                            </button>
                        </div>
                        {/* Dictation status indicator */}
                        {dictating && dictationMode === 'speech' && (
                            <p style={{ fontSize: 12, color: '#3b82f6', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: 'pulse-soft 1s infinite' }} />
                                🎤 Dictée vocale active — parlez, le texte apparaîtra automatiquement...
                            </p>
                        )}
                        {dictating && dictationMode === 'recording' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                                padding: '10px 14px', borderRadius: 10,
                                background: '#fef2f2', border: '1px solid #fca5a5',
                            }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse-soft 1s infinite' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>🎙️ Enregistrement vocal</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#dc2626', marginLeft: 'auto' }}>
                                    {fmtRecordingTime(recordingSeconds)}
                                </span>
                            </div>
                        )}
                        {transcribing && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                                padding: '10px 14px', borderRadius: 10,
                                background: '#eff6ff', border: '1px solid #93c5fd',
                            }}>
                                <span style={{
                                    width: 16, height: 16, borderRadius: '50%',
                                    border: '2px solid #3b82f6', borderTopColor: 'transparent',
                                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                                    🤖 IA en cours — {transcribeMsg}
                                </span>
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

                    {/* Spare Parts - searchable + multi-select. Each picked
                        part lands in `quickForm.parts` so the technician can
                        log every consumable used in one intervention. */}
                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Pièces de rechange utilisées</label>

                        {/* Already-added parts — chips with × delete */}
                        {quickForm.parts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                {quickForm.parts.map(p => {
                                    const sp = spareParts.find(x => x.id === p.partId);
                                    if (!sp) return null;
                                    return (
                                        <span key={p.partId} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '5px 8px 5px 12px', borderRadius: 100,
                                            background: 'rgba(34,197,94,0.12)', color: '#15803d',
                                            fontSize: 12.5, fontWeight: 600,
                                            border: '1px solid rgba(34,197,94,0.25)',
                                        }}>
                                            {sp.name} ({sp.reference}) × {p.quantity}
                                            <button onClick={() => removePart(p.partId)} title="Retirer" style={{
                                                width: 18, height: 18, borderRadius: '50%',
                                                background: 'rgba(15,118,67,0.18)', color: '#15803d', border: 'none',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                            }}><X size={11} /></button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <input
                            style={inputStyle}
                            placeholder="🔍 Rechercher une pièce..."
                            value={partSearch}
                            onChange={e => { setPartSearch(e.target.value); setPartDropdownOpen(true); }}
                            onFocus={() => setPartDropdownOpen(true)}
                        />
                        {quickForm.partId && (
                            <button onClick={() => { setQuickForm(f => ({ ...f, partId: '' })); setPartSearch(''); setQuantityError(''); }} style={{
                                position: 'absolute', right: 10, top: 30, background: 'none', border: 'none',
                                cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
                            }}>
                                <X size={14} />
                            </button>
                        )}
                        {partDropdownOpen && !quickForm.partId && (
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
                                    <button key={sp.id} onClick={() => { handlePartChange(sp.id); setPartSearch(`${sp.name} (${sp.reference})`); setPartDropdownOpen(false); }} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', border: 'none', background: 'transparent',
                                        cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
                                        transition: 'background 0.15s', textAlign: 'left',
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

                    {/* Dynamic quantity input + Ajouter button — the part isn't
                        committed until the technician clicks +, so they can
                        adjust the quantity freely beforehand. */}
                    {quickForm.partId && (
                        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                                Quantité
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="number"
                                    min={1}
                                    style={{
                                        ...inputStyle,
                                        flex: 1,
                                        borderColor: quantityError ? '#ef4444' : 'var(--border)',
                                        boxShadow: quantityError ? '0 0 0 3px rgba(239,68,68,0.15)' : 'none',
                                    }}
                                    value={quickForm.quantity}
                                    onChange={e => handleQuantityChange(+e.target.value)}
                                />
                                <button
                                    onClick={addDraftPart}
                                    disabled={!!quantityError}
                                    style={{
                                        padding: '0 18px', borderRadius: 10,
                                        background: quantityError ? 'var(--surface-hover)' : 'linear-gradient(135deg,#22c55e,#16a34a)',
                                        color: quantityError ? 'var(--text-muted)' : 'white',
                                        border: 'none', fontSize: 13.5, fontWeight: 700,
                                        cursor: quantityError ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        whiteSpace: 'nowrap', fontFamily: 'inherit',
                                    }}
                                >+ Ajouter</button>
                            </div>
                            {quantityError && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    marginTop: 8, fontSize: 13, fontWeight: 700, color: '#ef4444',
                                    padding: '8px 12px', background: 'var(--accent-red-light)', borderRadius: 10,
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    animation: 'fadeIn 0.2s ease',
                                }}>
                                    <AlertTriangle size={15} /> {quantityError}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
}
