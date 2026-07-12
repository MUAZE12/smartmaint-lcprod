'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    footer?: ReactNode;
}

const sizeMap = {
    sm: 440,
    md: 560,
    lg: 720,
    xl: 900,
};

export default function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!mounted || !isOpen) return null;

    // Portaled to document.body so it always renders above any parent
    // stacking context (e.g. Header z40, page transforms, etc.).
    return createPortal(
        <div
            ref={overlayRef}
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
            data-tour="modal-overlay"
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed', inset: 0, zIndex: 9992,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.2s ease',
                padding: 24,
            }}
        >
            <div
                data-tour="modal-panel"
                style={{
                    background: 'var(--surface)',
                    borderRadius: 14,
                    width: '100%',
                    maxWidth: sizeMap[size],
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 50px -10px rgba(11, 18, 32, 0.30), 0 1px 3px rgba(11, 18, 32, 0.08)',
                    animation: 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                    border: '1px solid var(--border)',
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
                        onClick={onClose}
                        data-tour="modal-close"
                        style={{
                            width: 30, height: 30, borderRadius: 7,
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', transition: 'background 0.12s ease, color 0.12s ease',
                            marginLeft: 12,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div data-tour="modal-body" style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div data-tour="modal-footer" style={{
                        padding: '12px 20px', borderTop: '1px solid var(--border-light)',
                        display: 'flex', justifyContent: 'flex-end', gap: 8,
                        flexShrink: 0,
                        background: 'var(--surface)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>

            <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
        </div>,
        document.body,
    );
}
