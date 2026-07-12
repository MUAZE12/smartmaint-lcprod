'use client';

// ============================================================
// QRScanner — a real camera QR scanner.
// ------------------------------------------------------------
// Opens the camera, decodes QR codes from the live frames with
// jsQR, and validates the result against the machine database:
//   • a QR that resolves to a known machine  → onMatch(machine)
//   • anything else (unknown code, random QR) → rejected banner
// Also accepts a still image ("Importer une image") — reliable
// when the webcam is too poor to read a phone screen.
// The decoder is loaded lazily so it never enters the server bundle.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Crosshair, ImageUp, RefreshCw } from 'lucide-react';
import type { Machine } from '@/lib/types';

export interface QRScannerStrings {
    title: string;
    hint: string;
    searching: string;
    rejected: string;
    matched: string;
    noCode: string;
    importImage: string;
    cameraDenied: string;
    cameraMissing: string;
}

const FR_STRINGS: QRScannerStrings = {
    title: 'Scanner le QR Code',
    hint: 'Placez le QR Code de la machine dans le cadre',
    searching: 'Recherche du QR Code…',
    rejected: 'QR Code non reconnu — aucune machine correspondante',
    matched: 'Machine identifiée',
    noCode: 'Aucun QR Code détecté dans l\'image',
    importImage: 'Importer une image',
    cameraDenied: 'Accès à la caméra refusé. Autorisez la caméra pour cette application, puis réessayez.',
    cameraMissing: 'Caméra introuvable ou utilisée par un autre programme.',
};

type JsQR = (data: Uint8ClampedArray, width: number, height: number,
    opts?: { inversionAttempts?: string }) => { data: string } | null;

/**
 * Resolve a decoded QR string to a machine. Accepts the app's own
 * `SMARTMAINT-LCPROD|CODE|NAME|WORKSHOP` payload, a bare machine code,
 * or a machine id. Returns null for anything that isn't a known machine.
 */
export function matchMachineFromQR(text: string, machines: Machine[]): Machine | null {
    const raw = (text || '').trim();
    if (!raw) return null;
    let candidate = raw;
    if (raw.includes('|')) {
        const parts = raw.split('|').map(p => p.trim());
        candidate = parts[0].toUpperCase().startsWith('SMARTMAINT') ? (parts[1] ?? '') : parts[0];
    }
    const c = candidate.trim().toLowerCase();
    if (!c) return null;
    return machines.find(m => m.code.toLowerCase() === c || m.id.toLowerCase() === c) ?? null;
}

interface Props {
    machines: Machine[];
    onMatch: (machine: Machine) => void;
    onClose: () => void;
    strings?: Partial<QRScannerStrings>;
    /** Accent colour for the framing brackets. */
    accent?: string;
}

export default function QRScanner({ machines, onMatch, onClose, strings, accent = '#f97316' }: Props) {
    const s = { ...FR_STRINGS, ...strings };

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const jsqrRef = useRef<JsQR | null>(null);
    const lastScanRef = useRef(0);
    const doneRef = useRef(false);
    const cancelledRef = useRef(false);
    const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [phase, setPhase] = useState<'scanning' | 'matched' | 'rejected'>('scanning');
    const [rejectMsg, setRejectMsg] = useState(s.rejected);
    const [matchedLabel, setMatchedLabel] = useState('');
    const [retryCounter, setRetryCounter] = useState(0);

    const stopCamera = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            try { videoRef.current.srcObject = null; } catch { /* ignore */ }
        }
    }, []);

    const stop = useCallback(() => {
        doneRef.current = true;
        stopCamera();
    }, [stopCamera]);

    const flashRejected = useCallback((msg: string) => {
        setRejectMsg(msg);
        setPhase('rejected');
        if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
        rejectTimerRef.current = setTimeout(() => {
            if (!doneRef.current) setPhase('scanning');
        }, 2600);
    }, []);

    // A decoded string → match a machine, or reject. Kept in a ref so the
    // mount-once camera loop always calls the latest version.
    const handleDecodeRef = useRef<(text: string) => void>(() => { });
    handleDecodeRef.current = (text: string) => {
        const m = matchMachineFromQR(text, machines);
        if (m) {
            doneRef.current = true;
            stopCamera();
            setMatchedLabel(`${m.code} — ${m.name}`);
            setPhase('matched');
            setTimeout(() => onMatch(m), 750);
        } else {
            flashRejected(s.rejected);
        }
    };

    // ── Camera + scan loop (runs each time the user clicks "Réessayer") ──
    useEffect(() => {
        cancelledRef.current = false;
        doneRef.current = false;
        setError(null);
        setCameraReady(false);

        // Start jsQR download in the background. The scan loop already skips
        // frames until jsqrRef.current is set, so we never need to await it.
        if (!jsqrRef.current) {
            import('jsqr').then(mod => {
                jsqrRef.current = ((mod as { default?: unknown }).default ?? mod) as unknown as JsQR;
                console.log('[QRScanner] jsQR loaded');
            }).catch(err => {
                console.warn('[QRScanner] jsQR load failed (upload path retries):', err);
            });
        }

        function tick() {
            if (doneRef.current || cancelledRef.current) return;
            rafRef.current = requestAnimationFrame(tick);
            const now = performance.now();
            if (now - lastScanRef.current < 220) return;   // ~4–5 scans / s
            lastScanRef.current = now;

            const video = videoRef.current, canvas = canvasRef.current, jsQR = jsqrRef.current;
            if (!video || !canvas || !jsQR || video.readyState < 2 || !video.videoWidth) return;

            const scale = Math.min(1, 640 / video.videoWidth);
            const w = Math.round(video.videoWidth * scale);
            const h = Math.round(video.videoHeight * scale);
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, w, h);
            let img: ImageData;
            try { img = ctx.getImageData(0, 0, w, h); } catch { return; }
            const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) handleDecodeRef.current(code.data);
        }

        async function init() {
            console.log('[QRScanner] init start');

            // Permission check first
            if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                console.warn('[QRScanner] getUserMedia unavailable');
                setError(s.cameraMissing);
                return;
            }

            // ONE simple constraint. The browser picks the best available cam.
            // We add a soft hint for `environment` (back camera on phones); on
            // a laptop with one webcam this hint is ignored.
            let stream: MediaStream | null = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false,
                });
            } catch (e) {
                const name = e instanceof DOMException ? e.name : (e instanceof Error ? e.name : '');
                console.warn('[QRScanner] facingMode env failed:', name);
                // Fallback to ANY camera if the hint isn't satisfiable.
                if (name === 'OverconstrainedError' || name === 'NotFoundError' || name === '') {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    } catch (e2) {
                        const n2 = e2 instanceof DOMException ? e2.name : '';
                        console.warn('[QRScanner] plain getUserMedia failed:', n2, e2);
                        setError(n2 === 'NotAllowedError' || n2 === 'SecurityError' ? s.cameraDenied : s.cameraMissing);
                        return;
                    }
                } else if (name === 'NotAllowedError' || name === 'SecurityError') {
                    setError(s.cameraDenied);
                    return;
                } else {
                    setError(s.cameraMissing);
                    return;
                }
            }

            if (!stream) { setError(s.cameraMissing); return; }
            if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) {
                console.warn('[QRScanner] videoRef is null after stream — should not happen');
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            video.srcObject = stream;
            // Fire-and-forget play(); the loadedmetadata handler flips cameraReady.
            video.play().then(
                () => console.log('[QRScanner] video.play() ok'),
                err => console.warn('[QRScanner] video.play() rejected:', err),
            );
            tick();
        }

        init();

        return () => {
            cancelledRef.current = true;
            stop();
            if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retryCounter]);

    // ── Decode a still image (file upload) — bypasses a poor webcam ──
    const decodeImageFile = useCallback(async (file: File) => {
        if (doneRef.current) return;
        let jsQR = jsqrRef.current;
        if (!jsQR) {
            try {
                const mod = await import('jsqr');
                jsQR = ((mod as { default?: unknown }).default ?? mod) as unknown as JsQR;
                jsqrRef.current = jsQR;
            } catch { flashRejected(s.noCode); return; }
        }
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = canvasRef.current;
            if (!canvas || !jsQR) return;
            const scale = Math.min(1, 1100 / Math.max(image.width, image.height));
            const w = Math.max(1, Math.round(image.width * scale));
            const h = Math.max(1, Math.round(image.height * scale));
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(image, 0, 0, w, h);
            let img: ImageData;
            try { img = ctx.getImageData(0, 0, w, h); } catch { return; }
            const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) handleDecodeRef.current(code.data);
            else flashRejected(s.noCode);
        };
        image.onerror = () => { URL.revokeObjectURL(url); flashRejected(s.noCode); };
        image.src = url;
    }, [flashRejected, s.noCode]);

    const uploadBtnStyle: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24,
        padding: '11px 20px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
        color: 'white', fontSize: 14, fontWeight: 600,
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.3s ease',
        }}>
            <button onClick={() => { stop(); onClose(); }} style={{
                position: 'absolute', top: 24, right: 24, width: 44, height: 44, borderRadius: 12,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <X size={20} />
            </button>

            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, marginBottom: 22, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {s.title}
            </div>

            {/* The video element is ALWAYS in the DOM so videoRef is always valid,
                even on the first paint before init() resolves. The error view
                is a sibling overlay shown on top, not a render branch. */}
            <div style={{ position: 'relative', width: 300, height: 300, borderRadius: 20, overflow: 'hidden', background: '#000' }}>
                <video ref={videoRef} playsInline muted autoPlay
                    onLoadedMetadata={() => setCameraReady(true)}
                    onPlaying={() => setCameraReady(true)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

                {/* Loading indicator until the video frame is available */}
                {!error && !cameraReady && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ width: 26, height: 26, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>
                            Initialisation de la caméra…
                        </span>
                    </div>
                )}

                {/* Error overlay — visible + actionable */}
                {error && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 18, textAlign: 'center' }}>
                        <AlertTriangle size={40} color="#fca5a5" />
                        <div style={{ color: '#fecaca', fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{error}</div>
                        <button onClick={() => setRetryCounter(c => c + 1)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10,
                            background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                        }}>
                            <RefreshCw size={14} /> Réessayer
                        </button>
                    </div>
                )}

                {/* Corner brackets */}
                {[
                    { top: -3, left: -3, borderTop: `4px solid ${accent}`, borderLeft: `4px solid ${accent}`, borderRadius: '12px 0 0 0' },
                    { top: -3, right: -3, borderTop: `4px solid ${accent}`, borderRight: `4px solid ${accent}`, borderRadius: '0 12px 0 0' },
                    { bottom: -3, left: -3, borderBottom: `4px solid ${accent}`, borderLeft: `4px solid ${accent}`, borderRadius: '0 0 0 12px' },
                    { bottom: -3, right: -3, borderBottom: `4px solid ${accent}`, borderRight: `4px solid ${accent}`, borderRadius: '0 0 12px 0' },
                ].map((st, i) => (
                    <div key={i} style={{ position: 'absolute', width: 40, height: 40, ...st, pointerEvents: 'none' } as React.CSSProperties} />
                ))}

                {/* Laser scan line */}
                {!error && phase === 'scanning' && cameraReady && (
                    <div style={{
                        position: 'absolute', left: 16, right: 16, height: 3, borderRadius: 100,
                        background: `linear-gradient(90deg, transparent, ${accent} 50%, transparent)`,
                        animation: 'scanLineMove 2s ease-in-out infinite',
                        pointerEvents: 'none',
                    }} />
                )}

                {/* Matched flash */}
                {phase === 'matched' && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.18)',
                        border: '3px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CheckCircle size={64} color="#22c55e" />
                    </div>
                )}
                {/* Rejected flash */}
                {phase === 'rejected' && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.18)',
                        border: '3px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <AlertTriangle size={56} color="#ef4444" />
                    </div>
                )}
                {!error && phase === 'scanning' && cameraReady && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.25, pointerEvents: 'none' }}>
                        <Crosshair size={46} color={accent} />
                    </div>
                )}
            </div>

            <p style={{ color: 'white', fontSize: 16, fontWeight: 600, marginTop: 28, textAlign: 'center', minHeight: 24, maxWidth: 340 }}>
                {phase === 'scanning' && (cameraReady ? s.searching : '')}
                {phase === 'matched' && `✅ ${s.matched} — ${matchedLabel}`}
                {phase === 'rejected' && `❌ ${rejectMsg}`}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 320 }}>
                {s.hint}
            </p>

            {/* Still-image fallback — works even with no webcam */}
            <button onClick={() => fileInputRef.current?.click()} style={uploadBtnStyle}>
                <ImageUp size={17} /> {s.importImage}
            </button>
            <input
                ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) decodeImageFile(f); e.target.value = ''; }}
            />

            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
}
