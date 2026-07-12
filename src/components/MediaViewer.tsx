'use client';

import { X } from 'lucide-react';

interface MediaViewerProps {
    src: string;
    type: 'photo' | 'video';
    onClose: () => void;
}

export default function MediaViewer({ src, type, onClose }: MediaViewerProps) {
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.92)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                cursor: 'pointer',
            }}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 16, right: 16, zIndex: 2,
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(255,255,255,0.15)', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
                <X size={24} />
            </button>

            {/* Media content */}
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh' }}>
                {type === 'photo' ? (
                    <img
                        src={src}
                        alt="صورة ملتقطة"
                        style={{
                            maxWidth: '90vw', maxHeight: '85vh',
                            objectFit: 'contain', borderRadius: 16,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    />
                ) : (
                    <video
                        src={src}
                        controls
                        autoPlay
                        style={{
                            maxWidth: '90vw', maxHeight: '85vh',
                            objectFit: 'contain', borderRadius: 16,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    />
                )}
            </div>
        </div>
    );
}
