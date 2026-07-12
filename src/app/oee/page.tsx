'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { calculateTRS } from '@/lib/calculations';
import type { TRSData, ProductionBatch } from '@/lib/types';
import { useMemo, useState } from 'react';

// Batch-derived TRS fallback — when a machine has no `production_metrics`
// rows yet, synthesize availability / performance / quality from finished
// production_batches. Empirical, not accounting-grade, but far better than
// showing "Pas de mesure" on 90 % of the fleet.
function trsFromBatches(machineId: string, batches: ProductionBatch[]): TRSData | null {
    const mine = batches.filter(b => b.machineId === machineId && b.endedAt);
    if (mine.length === 0) return null;

    let plannedHours = 0, actualHours = 0;
    let planned = 0, produced = 0;
    for (const b of mine) {
        const startedMs = new Date(b.startedAt).getTime();
        const endedMs = new Date(b.endedAt as string).getTime();
        const durationH = Math.max(0, (endedMs - startedMs) / 3_600_000);
        actualHours += durationH;
        // Expected duration assuming 60 units/hour reference — same reference
        // divides out of the performance ratio so the absolute number matters
        // less than being consistent across machines.
        plannedHours += b.plannedQty > 0 ? b.plannedQty / 60 : durationH;
        planned += b.plannedQty;
        produced += b.actualQty;
    }
    if (actualHours === 0 || planned === 0) return null;

    const availability = actualHours > 0 ? Math.min(1, plannedHours / actualHours) : 0;
    const performance = plannedHours > 0 ? Math.min(1, (produced / 60) / plannedHours) : 0;
    const quality = planned > 0 ? Math.min(1, produced / planned) : 0;
    const trs = availability * performance * quality;

    return {
        machineId,
        machineName: '',
        availability: Math.round(availability * 1000) / 10,
        performance: Math.round(performance * 1000) / 10,
        quality: Math.round(quality * 1000) / 10,
        trs: Math.round(trs * 1000) / 10,
    };
}
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Gauge, Clock, Zap, ShieldCheck, Info, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const VERDICTS: { label: string; color: string }[] = [
    { label: 'Classe mondiale', color: '#16a34a' },
    { label: 'Acceptable', color: '#d97706' },
    { label: 'À améliorer', color: '#dc2626' },
];

// TRS verdict thresholds (norme classe mondiale ≈ 85 %)
function verdict(trs: number): { label: string; color: string; bg: string } {
    if (trs >= 85) return { label: 'Classe mondiale', color: '#16a34a', bg: '#f0fdf4' };
    if (trs >= 65) return { label: 'Acceptable', color: '#d97706', bg: '#fffbeb' };
    return { label: 'À améliorer', color: '#dc2626', bg: '#fef2f2' };
}

export default function OeePage() {
    const { machines, productionMetrics, productionBatches } = useData();

    // Include every machine in the table. Priority order for each machine:
    //   1. real `production_metrics` rows (accounting-grade),
    //   2. else synthesize from finished `production_batches`,
    //   3. else "Pas de mesure" — machine still needs instrumentation.
    const rows = useMemo(() => {
        const withMetrics = new Set(productionMetrics.map(p => p.machineId));
        return machines
            .map(m => {
                if (withMetrics.has(m.id)) {
                    return { code: m.code, source: 'metrics' as const, hasData: true, ...calculateTRS(m.id) };
                }
                const fromBatch = trsFromBatches(m.id, productionBatches);
                if (fromBatch) {
                    return { code: m.code, source: 'batches' as const, hasData: true, ...fromBatch, machineName: m.name };
                }
                return { code: m.code, source: 'none' as const, hasData: false, ...calculateTRS(m.id) };
            })
            .sort((a, b) => b.trs - a.trs);
    }, [machines, productionMetrics, productionBatches]);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = rows.find(r => r.machineId === selectedId) ?? rows[0] ?? null;

    // Verdict filter — narrows the chart + table to one performance band.
    const [vFilter, setVFilter] = useState<string | null>(null);
    const shown = vFilter ? rows.filter(r => verdict(r.trs).label === vFilter) : rows;

    const avg = (key: keyof Pick<TRSData, 'availability' | 'performance' | 'quality' | 'trs'>) =>
        rows.length ? Math.round((rows.reduce((s, r) => s + r[key], 0) / rows.length) * 10) / 10 : 0;

    const kpi = (label: string, value: number, icon: React.ReactNode, color: string) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}<span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 2, fontWeight: 500 }}>%</span></div>
        </div>
    );

    // Loss cascade for the selected machine (Temps planifié 100 % → TRS).
    const cascade = useMemo(() => {
        if (!selected) return [];
        const a = selected.availability / 100, p = selected.performance / 100, q = selected.quality / 100;
        return [
            { label: 'Pertes de disponibilité', pct: (1 - a) * 100, color: '#f59e0b' },
            { label: 'Pertes de performance', pct: (a - a * p) * 100, color: '#8b5cf6' },
            { label: 'Pertes de qualité', pct: (a * p - a * p * q) * 100, color: '#ef4444' },
            { label: 'TRS — temps utile', pct: a * p * q * 100, color: '#22c55e' },
        ];
    }, [selected]);

    return (
        <>
            <Header title="TRS / OEE" subtitle="Taux de rendement synthétique — Disponibilité × Performance × Qualité" />
            <main style={{ padding: '24px 32px' }}>
                {rows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <Gauge size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune donnée de production. Saisissez des métriques de production pour calculer le TRS.</p>
                    </div>
                ) : (
                    <>
                        {/* KPI row */}
                        <div data-tour="oee-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                            {kpi('TRS moyen', avg('trs'), <Gauge size={13} />, verdict(avg('trs')).color)}
                            {kpi('Disponibilité', avg('availability'), <Clock size={13} />, '#f59e0b')}
                            {kpi('Performance', avg('performance'), <Zap size={13} />, '#8b5cf6')}
                            {kpi('Qualité', avg('quality'), <ShieldCheck size={13} />, '#22c55e')}
                        </div>

                        {/* Verdict filter */}
                        <div data-tour="oee-verdicts" style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filtrer :</span>
                            {VERDICTS.map(v => {
                                const active = vFilter === v.label;
                                const n = rows.filter(r => verdict(r.trs).label === v.label).length;
                                return (
                                    <button key={v.label} data-tour="oee-verdict-chip" data-label={v.label} onClick={() => setVFilter(active ? null : v.label)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 100, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                                            background: active ? v.color : 'var(--surface-hover)', color: active ? 'white' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? v.color : 'var(--border)'}` }}>
                                        {v.label}
                                        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>{n}</span>
                                    </button>
                                );
                            })}
                            {vFilter && (
                                <button onClick={() => setVFilter(null)} style={{ padding: '6px 12px', borderRadius: 100, background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                                    ✕ Tous
                                </button>
                            )}
                        </div>

                        {/* TRS by machine — bar chart */}
                        <div data-tour="oee-chart" className="card" style={{ padding: 0, marginBottom: 22 }}>
                            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Gauge size={18} color="#3b82f6" />
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>TRS par machine</h3>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    ─ ─ seuil classe mondiale (85 %)
                                </span>
                            </div>
                            <div className="card-body" style={{ height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={shown} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                        <Tooltip formatter={(v) => [`${v}%`, 'TRS']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }} />
                                        <ReferenceLine y={85} stroke="#16a34a" strokeDasharray="5 5" />
                                        <Bar dataKey="trs" radius={[6, 6, 0, 0]} cursor="pointer"
                                            onClick={(d) => {
                                                const id = (d as unknown as { payload?: { machineId?: string } })?.payload?.machineId;
                                                if (id) setSelectedId(id);
                                            }}>
                                            {shown.map(r => <Cell key={r.machineId} fill={verdict(r.trs).color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22 }}>
                            {/* Detail table */}
                            <div data-tour="oee-table" className="card" style={{ padding: 0 }}>
                                <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Détail par machine</h3></div>
                                <div className="table-container" style={{ border: 'none' }}>
                                    <table className="data-table">
                                        <thead><tr>
                                            <th>Machine</th><th>Dispo.</th><th>Perf.</th><th>Qualité</th><th>TRS</th><th>Verdict</th>
                                        </tr></thead>
                                        <tbody>
                                            {shown.map(r => {
                                                const v = verdict(r.trs);
                                                const isSel = selected?.machineId === r.machineId;
                                                const noData = !r.hasData;
                                                const estimated = r.source === 'batches';
                                                return (
                                                    <tr key={r.machineId} onClick={() => setSelectedId(r.machineId)}
                                                        style={{ cursor: 'pointer', background: isSel ? 'var(--surface-hover)' : undefined, opacity: noData ? 0.6 : 1 }}>
                                                        <td>
                                                            <span style={{ fontWeight: 700 }}>{r.code}</span>
                                                            {estimated && (
                                                                <span title="Calculé à partir des lots de production — pas de métriques dédiées"
                                                                    style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'rgba(139,92,246,0.15)', color: '#7c3aed' }}>
                                                                    ~ estimé
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>{noData ? '—' : `${r.availability}%`}</td>
                                                        <td>{noData ? '—' : `${r.performance}%`}</td>
                                                        <td>{noData ? '—' : `${r.quality}%`}</td>
                                                        <td><span style={{ fontWeight: 800, color: noData ? 'var(--text-muted)' : v.color }}>{noData ? '—' : `${r.trs}%`}</span></td>
                                                        <td>
                                                            {noData ? (
                                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'var(--surface-hover)', color: 'var(--text-muted)' }} title="Aucune métrique de production saisie">Pas de mesure</span>
                                                            ) : (
                                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: v.bg, color: v.color }}>
                                                                    {v.label}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Loss cascade for the selected machine */}
                            <div data-tour="oee-cascade" className="card" style={{ padding: 0 }}>
                                <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Cascade des pertes</h3>
                                    {selected && (
                                        <Link href={`/machines/${selected.machineId}`} title="Ouvrir la fiche machine"
                                            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: '#3b82f6', textDecoration: 'none' }}>
                                            {selected.code} <ExternalLink size={13} />
                                        </Link>
                                    )}
                                </div>
                                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                                        <Info size={13} /> Du temps planifié (100 %) jusqu&apos;au temps réellement utile.
                                    </p>
                                    {/* Stacked cascade bar */}
                                    <div style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                        {cascade.map((c, i) => c.pct > 0.05 && (
                                            <div key={i} title={`${c.label}: ${c.pct.toFixed(1)}%`}
                                                style={{ width: `${c.pct}%`, background: c.color }} />
                                        ))}
                                    </div>
                                    {cascade.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 13, flex: 1 }}>{c.label}</span>
                                            <span style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{c.pct.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
