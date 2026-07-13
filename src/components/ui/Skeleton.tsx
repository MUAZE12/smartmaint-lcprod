'use client';

// Reusable loading skeleton. Shimmer animation defined in globals.css.
// USAGE
//   <Skeleton width={220} height={16} />
//   <Skeleton rounded />
//   <SkeletonRow count={5} />

import type { CSSProperties } from 'react';

interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    rounded?: boolean | number;
    className?: string;
    style?: CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, rounded = 6, className, style }: SkeletonProps) {
    const radius = rounded === true ? 999 : (rounded === false ? 0 : rounded);
    return (
        <div
            className={'sm-skeleton ' + (className ?? '')}
            style={{
                width, height,
                borderRadius: radius,
                background: 'linear-gradient(90deg, var(--surface-hover), var(--surface), var(--surface-hover))',
                backgroundSize: '200% 100%',
                animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
                ...style,
            }}
        />
    );
}

interface SkeletonRowProps { count?: number; height?: number; gap?: number; }
export function SkeletonRow({ count = 3, height = 14, gap = 10 }: SkeletonRowProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} height={height} width={i === count - 1 ? '60%' : '100%'} />
            ))}
        </div>
    );
}

interface SkeletonCardProps { height?: number; }
export function SkeletonCard({ height = 120 }: SkeletonCardProps) {
    return (
        <div style={{
            padding: 16, borderRadius: 14,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 12,
        }}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="70%" height={22} />
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                <Skeleton width={60} height={10} />
                <Skeleton width={80} height={10} />
            </div>
            <div style={{ minHeight: Math.max(0, height - 100) }} />
        </div>
    );
}

interface SkeletonTableProps { rows?: number; cols?: number; }
export function SkeletonTable({ rows = 6, cols = 4 }: SkeletonTableProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} style={{
                    display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: r === 0 ? 'var(--surface-hover)' : 'transparent',
                    border: r === 0 ? 'none' : '1px solid var(--border)',
                }}>
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton key={c} height={14} width={c === 0 ? '80%' : c === cols - 1 ? '40%' : '65%'} />
                    ))}
                </div>
            ))}
        </div>
    );
}
