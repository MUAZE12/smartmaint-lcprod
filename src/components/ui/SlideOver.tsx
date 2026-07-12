'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SlideOverProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;
}

// Portaled to document.body so it escapes any parent stacking context
// (Header has its own zIndex 40 — without portaling, the slide-over panel
// would be trapped inside it and a fixed-position FAB at zIndex 50 could
// paint on top of the panel).
export default function SlideOver({ isOpen, onClose, title, subtitle, children, footer, width = 560 }: SlideOverProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!mounted) return null;

    return createPortal(
        <>
            {/* Overlay */}
            <div
                ref={overlayRef}
                onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9990,
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(3px)',
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease',
                }}
            />

            {/* Panel */}
            <div
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0,
                    width, maxWidth: '90vw',
                    zIndex: 9991,
                    background: 'var(--surface)',
                    boxShadow: '-12px 0 40px -8px rgba(11, 18, 32, 0.20), -1px 0 0 rgba(11, 18, 32, 0.06)',
                    display: 'flex', flexDirection: 'column',
                    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                    borderLeft: '1px solid var(--border)',
                }}
            >
                {/* Header */}
                <div data-tour="modal-header" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
                    flexShrink: 0,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.005em', lineHeight: 1.3 }}>{title}</h2>
                        {subtitle && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{subtitle}</p>}
                    </div>
                    <button
                        data-tour="modal-close"
                        onClick={onClose}
                        style={{
                            width: 30, height: 30, borderRadius: 7,
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)',
                            transition: 'background 0.12s ease, color 0.12s ease',
                            marginLeft: 12,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div data-tour="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
                    {children}
                </div>

                {/* Sticky Footer */}
                {footer && (
                    <div data-tour="modal-footer" style={{
                        padding: '12px 20px',
                        borderTop: '1px solid var(--border-light)',
                        display: 'flex', justifyContent: 'flex-end', gap: 8,
                        flexShrink: 0,
                        background: 'var(--surface)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </>,
        document.body,
    );
}
