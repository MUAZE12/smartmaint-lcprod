'use client';

// ============================================================
// VoiceDictationButton — drop-in microphone for any textarea.
// Records audio with MediaRecorder, transcribes via the bundled
// Whisper model (lib/transcription.ts), then calls onTranscribed
// with the resulting text. Caller decides how to merge it into
// state (usually appending to existing content).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { transcribeBlob } from '@/lib/transcription';

interface VoiceDictationButtonProps {
    /** Called when Whisper returns a non-empty transcription. */
    onTranscribed: (text: string) => void;
    /** Visual size — defaults to 38px. */
    size?: number;
    /** Override default tooltip. */
    title?: string;
    /** Optional inline style for the wrapper button. */
    style?: React.CSSProperties;
}

export default function VoiceDictationButton({
    onTranscribed, size = 38, title, style,
}: VoiceDictationButtonProps) {
    const { showToast } = useToast();
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    // Stop everything on unmount so we don't leave the mic open.
    useEffect(() => () => {
        try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch { /* ignore */ }
        streamRef.current?.getTracks().forEach(t => t.stop());
    }, []);

    const start = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            showToast('🎤 Le microphone n\'est pas disponible.', 'error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
            });
            streamRef.current = stream;
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
            const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
            chunksRef.current = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
                setTranscribing(true);
                transcribeBlob(blob)
                    .then(text => {
                        if (text && text.trim()) {
                            onTranscribed(text.trim());
                            showToast('✅ Transcription insérée');
                        } else {
                            showToast('⚠️ Parole non détectée — parlez plus fort', 'info');
                        }
                    })
                    .catch(() => showToast('⚠️ Erreur de transcription', 'info'))
                    .finally(() => setTranscribing(false));
            };
            recorderRef.current = recorder;
            recorder.start(100);
            setRecording(true);
            showToast('🎙️ Enregistrement — appuyez à nouveau pour arrêter');
        } catch (err) {
            const name = err instanceof Error ? err.name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                showToast('🎤 Accès au microphone refusé.', 'error');
            } else if (name === 'NotFoundError') {
                showToast('🎤 Aucun microphone détecté.', 'error');
            } else {
                showToast('🎤 Impossible d\'accéder au microphone.', 'error');
            }
        }
    }, [onTranscribed, showToast]);

    const stop = useCallback(() => {
        const r = recorderRef.current;
        if (r && r.state !== 'inactive') r.stop();
        setRecording(false);
    }, []);

    const toggle = () => {
        if (transcribing) return;
        if (recording) stop();
        else start();
    };

    const bg = transcribing ? '#94a3b8'
        : recording ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #f97316, #ea580c)';

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={transcribing}
            title={title ?? (recording ? 'Arrêter la dictée' : 'Dictée vocale')}
            style={{
                width: size, height: size, borderRadius: Math.round(size * 0.28),
                background: bg, border: 'none', color: 'white',
                cursor: transcribing ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: recording ? '0 0 14px rgba(239,68,68,0.4)' : '0 3px 8px rgba(249,115,22,0.25)',
                animation: recording ? 'pulse-soft 1s infinite' : 'none',
                opacity: transcribing ? 0.7 : 1,
                fontFamily: 'inherit', flexShrink: 0,
                ...style,
            }}
        >
            {recording ? <MicOff size={Math.round(size * 0.5)} /> : <Mic size={Math.round(size * 0.5)} />}
        </button>
    );
}
