'use client';

// ============================================================
// ARMachineOverlay — AR-style QR scan.
//
// Uses the same jsQR + camera pipeline as QRScanner, but instead of
// jumping to the machine card, it OVERLAYS the machine's last 3
// interventions + criticality directly on top of the video feed.
//
// Feels like the future. Actual overlay is a CSS-positioned div —
// no WebGL, no ARKit — but it's plenty for a plant floor.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Camera as CameraIcon, Wrench } from 'lucide-react';
import jsQR from 'jsqr';

interface MachineSummary {
    code: string;
    name: string;
    status: string;
    criticalityLevel: 'faible' | 'moyen' | 'élevé';
    lastInterventions: Array<{
        date: string;
        type: 'corrective' | 'préventive' | 'conditionnelle' | 'améliorative';
        description: string;
    }>;
}

interface Props {
    /** Called with the machine code once a QR is scanned; you return the summary or null. */
    lookup: (code: string) => Promise<MachineSummary | null>;
    onClose: () => void;
}

export default function ARMachineOverlay({ lookup, onClose }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const [status, setStatus] = useState<'starting' | 'scanning' | 'found' | 'error'>('starting');
    const [error, setError] = useState<string>('');
    const [machine, setMachine] = useState<MachineSummary | null>(null);

    useEffect(() => {
        let stream: MediaStream | null = null;

        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setStatus('scanning');
                    scanLoop();
                }
            } catch (e) {
                setStatus('error');
                setError(e instanceof Error ? e.message : 'Caméra indisponible');
            }
        };

        const scanLoop = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return;
            if (video.readyState !== video.HAVE_ENOUGH_DATA) {
                rafRef.current = requestAnimationFrame(scanLoop);
                return;
            }
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (code) {
                setStatus('found');
                void lookup(code.data).then(res => {
                    if (res) setMachine(res); else scanAgain();
                });
                return;
            }
            rafRef.current = requestAnimationFrame(scanLoop);
        };

        const scanAgain = () => {
            setMachine(null);
            setStatus('scanning');
            rafRef.current = requestAnimationFrame(scanLoop);
        };

        void start();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            stream?.getTracks().forEach(t => t.stop());
        };
    }, [lookup]);

    const critColor =
        machine?.criticalityLevel === 'élevé'  ? '#dc2626' :
        machine?.criticalityLevel === 'moyen' ? '#f59e0b' : '#10b981';

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#000',
            display: 'flex', flexDirection: 'column', zIndex: 9995,
        }}>
            <video ref={videoRef} playsInline muted style={{
                width: '100%', height: '100%', objectFit: 'cover',
            }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Reticule / crosshair */}
            {status === 'scanning' && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: 260, height: 260, border: '3px solid rgba(59,130,246,0.9)', borderRadius: 24,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                }} />
            )}

            {/* Overlay card — the AR "hit test" */}
            {machine && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: 'min(360px, 92vw)',
                    background: 'rgba(15,23,42,0.94)', color: 'white',
                    padding: 20, borderRadius: 18,
                    boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
                    border: '2px solid ' + critColor,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{
                            padding: '3px 10px', borderRadius: 100, background: critColor,
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>{machine.criticalityLevel}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{machine.status}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{machine.code}</div>
                    <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 12 }}>{machine.name}</div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: '0.06em' }}>3 DERNIÈRES INTERVENTIONS</div>
                        {machine.lastInterventions.length === 0 ? (
                            <div style={{ fontSize: 12, opacity: 0.6, fontStyle: 'italic' }}>Aucun historique</div>
                        ) : machine.lastInterventions.slice(0, 3).map((it, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{ opacity: 0.6, fontSize: 11, minWidth: 60 }}>{new Date(it.date).toLocaleDateString('fr-FR')}</div>
                                <div style={{ fontSize: 12.5, flex: 1 }}>{it.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Chrome */}
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
                <button onClick={onClose} aria-label="Fermer" style={{
                    background: 'rgba(15,23,42,0.7)', color: 'white', border: 'none',
                    padding: '10px 12px', borderRadius: 100, cursor: 'pointer',
                }}><X size={18} /></button>
            </div>
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15,23,42,0.7)', color: 'white', padding: '8px 12px', borderRadius: 100, fontSize: 12.5, fontWeight: 700 }}>
                {status === 'error' ? <AlertTriangle size={14} color="#f87171" /> : status === 'found' ? <Wrench size={14} color="#10b981" /> : <CameraIcon size={14} />}
                {status === 'error' ? error : status === 'found' ? 'Machine identifiée' : 'Visez le QR de la machine'}
            </div>
        </div>
    );
}
