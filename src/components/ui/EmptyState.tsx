'use client';

// Empty-state card. Drop in wherever a list, table, or grid has 0 rows.
// Way better than a blank pane — every empty list feels intentional.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    secondary?: ReactNode;
    tone?: 'default' | 'success' | 'warning' | 'info';
    illustration?: 'sparkle' | 'search' | 'plus';
}

const toneStyles: Record<NonNullable<EmptyStateProps['tone']>, { bg: string; ring: string; icon: string }> = {
    default: { bg: 'var(--surface)',              ring: 'var(--border)',    icon: 'var(--text-muted)'      },
    success: { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', ring: '#86efac', icon: '#15803d'      },
    warning: { bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', ring: '#fcd34d', icon: '#b45309'      },
    info:    { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', ring: '#93c5fd', icon: '#1e40af'      },
};

export function EmptyState({
    icon: IconComp = Sparkles,
    title, description, action, secondary,
    tone = 'default',
}: EmptyStateProps) {
    const t = toneStyles[tone];
    return (
        <div style={{
            padding: '48px 24px',
            borderRadius: 16,
            background: t.bg,
            border: `1px dashed ${t.ring}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            gap: 12,
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: `rgba(255,255,255,0.6)`, border: `1px solid ${t.ring}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: t.icon,
            }}>
                <IconComp size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
            {description && (
                <div style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
                    {description}
                </div>
            )}
            {(action || secondary) && (
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {action}
                    {secondary}
                </div>
            )}
        </div>
    );
}
