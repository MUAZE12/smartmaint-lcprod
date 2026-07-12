'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

const icons: Record<ToastType, React.ElementType> = {
    success: CheckCircle,
    error: AlertTriangle,
    info: Info,
};

const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', icon: '#22c55e' },
    error: { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444' },
    info: { bg: '#eff6ff', border: '#bfdbfe', icon: '#3b82f6' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    let counter = 0;

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        const id = ++counter;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast container */}
            <div style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 200,
                display: 'flex', flexDirection: 'column', gap: 8,
                pointerEvents: 'none',
            }}>
                {toasts.map((toast) => {
                    const Icon = icons[toast.type];
                    const c = colors[toast.type];
                    return (
                        <div
                            key={toast.id}
                            style={{
                                background: c.bg,
                                border: `1px solid ${c.border}`,
                                borderRadius: 14,
                                padding: '14px 18px',
                                display: 'flex', alignItems: 'center', gap: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                                animation: 'toastIn 0.3s ease',
                                pointerEvents: 'auto',
                                minWidth: 300,
                            }}
                        >
                            <Icon size={20} color={c.icon} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: '#1e293b' }}>{toast.message}</span>
                            <button
                                onClick={() => removeToast(toast.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <style jsx>{`
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
        </ToastContext.Provider>
    );
}
