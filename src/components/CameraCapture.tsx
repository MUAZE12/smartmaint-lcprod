'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Video, X, Square, Circle, RefreshCw } from 'lucide-react';

interface CameraCaptureProps {
    mode: 'photo' | 'video';
    onCapture: (blob: Blob) => void;
    onClose: () => void;
}

export default function CameraCapture({ mode, onCapture, onClose }: CameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [cameraReady, setCameraReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retrying, setRetrying] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Try to get camera with progressive fallback constraints
    const startCamera = useCallback(async () => {
        setError(null);
        setCameraReady(false);
        setRetrying(true);

        // Stop any existing stream first
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        // Progressive constraint fallback list
        const constraintsList: MediaStreamConstraints[] = [
            // Try 1: Ideal back camera with HD
            {
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: mode === 'video',
            },
            // Try 2: Exact back camera, lower res
            {
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
                audio: mode === 'video',
            },
            // Try 3: Any camera, low res
            {
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: mode === 'video',
            },
            // Try 4: Simplest possible — just video:true
            {
                video: true,
                audio: mode === 'video',
            },
        ];

        for (let i = 0; i < constraintsList.length; i++) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraintsList[i]);
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Wait for video to actually start playing
                    await new Promise<void>((resolve) => {
                        const vid = videoRef.current!;
                        const onPlaying = () => {
                            vid.removeEventListener('playing', onPlaying);
                            clearTimeout(playTimeout);
                            resolve();
                        };
                        const playTimeout = setTimeout(() => {
                            vid.removeEventListener('playing', onPlaying);
                            resolve(); // Resolve anyway — some browsers don't fire 'playing'
                        }, 5000);
                        vid.addEventListener('playing', onPlaying);
                        vid.play().catch(() => {
                            clearTimeout(playTimeout);
                            vid.removeEventListener('playing', onPlaying);
                            resolve(); // autoplay might be briefly blocked or interrupted — stream still works
                        });
                    });
                }
                setCameraReady(true);
                setRetrying(false);
                return; // Success — exit loop
            } catch (err: any) {
                console.warn(`Camera attempt ${i + 1} failed:`, err.message);
                // Stop any partial stream
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }
                // If permission denied, don't retry with different constraints
                if (err.name === 'NotAllowedError') {
                    setError('تم رفض الوصول إلى الكاميرا. يرجى السماح بالوصول في إعدادات المتصفح.');
                    setRetrying(false);
                    return;
                }
                // AbortError = "Timeout starting video source" on Windows — wait before retrying
                if (err.name === 'AbortError' || err.name === 'NotReadableError') {
                    await new Promise(r => setTimeout(r, 800));
                }
                // Continue to next constraint set
            }
        }

        // All attempts failed
        setRetrying(false);
        setError('تعذّر تشغيل الكاميرا — قد تكون مستخدمة من قبل تطبيق آخر. أغلق التطبيقات الأخرى التي تستخدم الكاميرا ثم أعد المحاولة.');
    }, [mode]);

    // Start camera on mount
    useEffect(() => {
        let mounted = true;
        const init = async () => {
            if (!mounted) return;
            await startCamera();
        };
        init();
        return () => {
            mounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [startCamera]);

    // Take photo from live video feed
    const takePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) {
                onCapture(blob);
                onClose();
            }
        }, 'image/jpeg', 0.92);
    }, [onCapture, onClose]);

    // Start video recording
    const startRecording = useCallback(() => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm'
                : '';
        const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
        try {
            const recorder = new MediaRecorder(streamRef.current, options);
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
                onCapture(blob);
                onClose();
            };
            mediaRecorderRef.current = recorder;
            recorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err: any) {
            setError('فشل بدء التسجيل: ' + err.message);
        }
    }, [onCapture, onClose]);

    // Stop video recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        setIsRecording(false);
    }, []);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#000', display: 'flex', flexDirection: 'column',
        }}>
            {/* Header bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(8px)', zIndex: 2,
            }}>
                <div style={{ color: 'white', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {mode === 'photo' ? <Camera size={20} /> : <Video size={20} />}
                    {mode === 'photo' ? 'التقاط صورة' : 'تسجيل فيديو'}
                </div>
                {isRecording && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#ef4444', animation: 'pulse-soft 1s infinite',
                        }} />
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 18 }}>
                            {formatTime(recordingTime)}
                        </span>
                    </div>
                )}
                <button onClick={() => {
                    if (isRecording) stopRecording();
                    onClose();
                }} style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none',
                    borderRadius: 10, padding: '8px 16px', color: 'white',
                    cursor: 'pointer', fontWeight: 600, fontSize: 14,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <X size={18} /> إغلاق
                </button>
            </div>

            {/* Camera feed */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {error ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'white', textAlign: 'center', padding: 32,
                    }}>
                        <div>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>خطأ في الكاميرا</div>
                            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>{error}</div>
                            <button onClick={startCamera} style={{
                                padding: '12px 24px', borderRadius: 12,
                                background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                fontWeight: 700, fontSize: 14,
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                            }}>
                                <RefreshCw size={16} /> إعادة المحاولة
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                            }}
                        />
                        {(!cameraReady || retrying) && (
                            <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 16, flexDirection: 'column', gap: 12,
                            }}>
                                <div style={{
                                    width: 40, height: 40, border: '3px solid rgba(255,255,255,0.3)',
                                    borderTopColor: 'white', borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                                جاري تشغيل الكاميرا...
                            </div>
                        )}
                        {/* Corner brackets */}
                        {cameraReady && (
                            <div style={{ position: 'absolute', inset: '15%', pointerEvents: 'none' }}>
                                {['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map(pos => (
                                    <div key={pos} style={{
                                        position: 'absolute',
                                        ...(pos.includes('top') ? { top: 0 } : { bottom: 0 }),
                                        ...(pos.includes('Left') ? { left: 0 } : { right: 0 }),
                                        width: 30, height: 30,
                                        borderColor: 'rgba(255,255,255,0.6)',
                                        borderStyle: 'solid', borderWidth: 0,
                                        ...(pos.includes('top') ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }),
                                        ...(pos.includes('Left') ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }),
                                        borderRadius: pos.includes('top')
                                            ? (pos.includes('Left') ? '8px 0 0 0' : '0 8px 0 0')
                                            : (pos.includes('Left') ? '0 0 0 8px' : '0 0 8px 0'),
                                    }} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom controls */}
            {cameraReady && !error && (
                <div style={{
                    padding: '24px 20px 36px', background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
                    backdropFilter: 'blur(8px)',
                }}>
                    {mode === 'photo' ? (
                        <button onClick={takePhoto} style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'white', border: '4px solid rgba(255,255,255,0.3)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'transform 0.15s',
                            boxShadow: '0 0 20px rgba(255,255,255,0.2)',
                        }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>
                            <Circle size={32} color="#333" fill="#333" />
                        </button>
                    ) : (
                        <button onClick={isRecording ? stopRecording : startRecording} style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: isRecording ? '#ef4444' : 'white',
                            border: `4px solid ${isRecording ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.3)'}`,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                            boxShadow: isRecording ? '0 0 30px rgba(239,68,68,0.4)' : '0 0 20px rgba(255,255,255,0.2)',
                        }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>
                            {isRecording
                                ? <Square size={28} color="white" fill="white" />
                                : <Circle size={32} color="#ef4444" fill="#ef4444" />
                            }
                        </button>
                    )}
                </div>
            )}

            {/* Hidden canvas for photo capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Spinner animation */}
            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
