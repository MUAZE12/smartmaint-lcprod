'use client';

// ============================================================
// SPC control chart derived from REAL intervention data.
//
// Before batch 7 this component ran on Math.random() + a hardcoded
// anomaly list — the admin flagged it as fake. Now every value comes
// from the actual `interventions` context :
//   • Selected metric = downtime hours OR parts cost per intervention
//   • Data points = the last 40 interventions on the selected machine
//                   (or all machines if "Tous")
//   • μ (mean), UCL = μ + 3σ, LCL = max(0, μ - 3σ)  ← standard SPC
//   • Anomaly panel = the interventions whose value is out-of-limit,
//                     surfaced with the machine, timestamp, and how
//                     far past the limit they went ("confiance" = %
//                     of the range they exceeded).
//
// Result: no funding needed, no IoT hardware, no fake charts. It
// works the moment there are ≥ 5 interventions in the system.
// ============================================================

import { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Activity, Brain, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { useData } from '@/context/DataContext';

type MetricType = 'downtime' | 'parts_cost';

interface Point {
    time: string;
    label: string;
    value: number;
    machineId: string;
    ucl: number;
    lcl: number;
    mean: number;
    interventionId: string;
}

function computeStats(values: number[]) {
    if (values.length === 0) return { mean: 0, sigma: 0, ucl: 0, lcl: 0 };
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const sigma = Math.sqrt(variance);
    return {
        mean: +mean.toFixed(2),
        sigma: +sigma.toFixed(2),
        ucl: +(mean + 3 * sigma).toFixed(2),
        lcl: +Math.max(0, mean - 3 * sigma).toFixed(2),
    };
}

interface DotProps {
    cx?: number;
    cy?: number;
    payload?: Point;
}
function CustomDot({ cx, cy, payload }: DotProps) {
    if (!cx || !cy || !payload) return null;
    const outOfLimit = payload.value > payload.ucl || payload.value < payload.lcl;
    if (outOfLimit) {
        return <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="white" strokeWidth={2} />;
    }
    return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" />;
}

export default function SPCAnomalyDashboard() {
    const { interventions, machines } = useData();
    const [metric, setMetric] = useState<MetricType>('downtime');
    const [machineFilter, setMachineFilter] = useState<string>('all');

    const data: Point[] = useMemo(() => {
        // Grab the last 40 completed interventions, optionally filtered by machine.
        const source = interventions
            .filter(i => i.status === 'terminée' || i.status === 'clôturée')
            .filter(i => machineFilter === 'all' || i.machineId === machineFilter)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, 40)
            .reverse(); // oldest → newest for the x-axis

        const values = source.map(i => metric === 'downtime' ? (i.downtimeHours || 0) : (i.partsCost || 0));
        const { mean, ucl, lcl } = computeStats(values);

        return source.map((i, idx) => {
            const m = machines.find(x => x.id === i.machineId);
            const d = new Date(i.startDate);
            return {
                time: `T${idx + 1}`,
                label: `${m?.code ?? '?'} · ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`,
                value: metric === 'downtime' ? +(i.downtimeHours || 0).toFixed(2) : +(i.partsCost || 0).toFixed(2),
                machineId: i.machineId,
                interventionId: i.id,
                mean, ucl, lcl,
            };
        });
    }, [interventions, machines, metric, machineFilter]);

    const stats = useMemo(() => {
        if (data.length === 0) return { mean: 0, ucl: 0, lcl: 0 };
        return { mean: data[0].mean, ucl: data[0].ucl, lcl: data[0].lcl };
    }, [data]);

    // Anomalies = points outside UCL/LCL, most severe first. "Confiance" is
    // how far past the limit the point went, normalized by the sigma range.
    const anomalies = useMemo(() => {
        const range = Math.max(1, stats.ucl - stats.lcl);
        return data
            .filter(p => p.value > p.ucl || p.value < p.lcl)
            .map(p => {
                const excess = p.value > p.ucl ? p.value - p.ucl : p.lcl - p.value;
                const confidence = Math.min(99, Math.round(50 + (excess / range) * 50));
                const machine = machines.find(m => m.id === p.machineId);
                return {
                    id: p.interventionId,
                    machineCode: machine?.code ?? '?',
                    machineName: machine?.name ?? '',
                    label: p.label,
                    value: p.value,
                    excess: +excess.toFixed(2),
                    confidence,
                    severity: (confidence >= 90 ? 'critical' : confidence >= 75 ? 'warning' : 'info') as 'critical' | 'warning' | 'info',
                };
            })
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 8);
    }, [data, stats, machines]);

    const metricLabel = metric === 'downtime' ? 'Heures d\'arrêt' : 'Coût pièces (MAD)';
    const enoughData = data.length >= 5;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
            {/* Chart Card */}
            <div className="card" style={{ padding: 0 }}>
                <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={18} color="#3b82f6" /> Carte de contrôle SPC — dérivée des interventions réelles
                    </h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)} style={{
                            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'var(--surface)', color: 'var(--text-primary)',
                            fontSize: 12, fontFamily: 'inherit', outline: 'none',
                        }}>
                            <option value="all">Toutes machines</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', borderRadius: 8, padding: 3 }}>
                            {(['downtime', 'parts_cost'] as MetricType[]).map(m => (
                                <button key={m} data-tour="spc-metric" data-metric={m} onClick={() => setMetric(m)} style={{
                                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    border: 'none', background: metric === m ? 'var(--surface)' : 'transparent',
                                    color: metric === m ? 'var(--text-primary)' : 'var(--text-muted)',
                                    boxShadow: metric === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: 'inherit',
                                }}>
                                    {m === 'downtime' ? '⏱️ Heures d\'arrêt' : '💰 Coût pièces'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="card-body" style={{ height: 340 }}>
                    {!enoughData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8, textAlign: 'center', padding: 20 }}>
                            <Info size={32} style={{ opacity: 0.4 }} />
                            <div style={{ fontSize: 14, fontWeight: 600 }}>Pas assez de données</div>
                            <div style={{ fontSize: 12.5 }}>Il faut au moins 5 interventions terminées {machineFilter !== 'all' ? 'sur cette machine' : 'sur le parc'} pour calculer un contrôle statistique fiable. Actuellement : {data.length}.</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 10))} />
                                {/*
                                    Force the Y-axis domain to include UCL + LCL with a bit of headroom.
                                    Otherwise Recharts auto-scales to just the data values and the UCL /
                                    LCL reference lines can fall outside the visible range (bug flagged
                                    by the admin: UCL = 13.44 not drawn when data topped at 12).
                                */}
                                <YAxis tick={{ fontSize: 11 }} domain={([dataMin, dataMax]) => {
                                    const lo = Math.min(dataMin as number, stats.lcl);
                                    const hi = Math.max(dataMax as number, stats.ucl);
                                    const pad = Math.max(1, (hi - lo) * 0.1);
                                    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
                                }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                                    labelFormatter={(_l, payload) => {
                                        const p = payload && payload[0] && payload[0].payload as Point | undefined;
                                        return p ? p.label : '';
                                    }}
                                    formatter={(v) => [metric === 'downtime' ? `${v} h` : `${v} MAD`, metricLabel]}
                                />
                                <ReferenceLine y={stats.ucl} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'UCL', position: 'right', fontSize: 11, fill: '#ef4444' }} />
                                <ReferenceLine y={stats.lcl} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'LCL', position: 'right', fontSize: 11, fill: '#ef4444' }} />
                                <ReferenceLine y={stats.mean} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'μ', position: 'right', fontSize: 13, fill: '#22c55e', fontWeight: 700 }} />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={<CustomDot />}
                                    activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
                {/* Legend + stats footer */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Hors limites</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 2, background: '#22c55e' }} /> μ = {stats.mean}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 2, background: '#ef4444' }} /> UCL = {stats.ucl} · LCL = {stats.lcl}</span>
                    <span style={{ marginInlineStart: 'auto' }}>Calcul : μ ± 3σ sur les {data.length} dernières interventions.</span>
                </div>
            </div>

            {/* Anomaly Detection Panel — real interventions out of limits */}
            <div className="card" style={{ padding: 0 }}>
                <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                    borderRadius: '16px 16px 0 0',
                    color: 'white',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <Brain size={20} />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Points hors contrôle</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{anomalies.length} intervention(s) au-delà de μ ± 3σ</div>
                    </div>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                    {anomalies.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            {enoughData ? '✅ Aucun point hors contrôle sur cette période — procédé stable.' : 'Ajoutez au moins 5 interventions pour activer la détection.'}
                        </div>
                    ) : anomalies.map(p => (
                        <div key={p.id} style={{
                            padding: '14px 16px', borderRadius: 12,
                            background: 'var(--surface-hover)',
                            borderLeft: `4px solid ${p.severity === 'critical' ? '#ef4444' : p.severity === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                {p.severity === 'critical' ? <AlertTriangle size={14} color="#ef4444" /> : <TrendingUp size={14} color={p.severity === 'warning' ? '#f59e0b' : '#3b82f6'} />}
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.machineCode} — {p.machineName}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                {p.label} · valeur : <b>{p.value}</b>{metric === 'downtime' ? ' h' : ' MAD'} (dépasse la limite de <b>{p.excess}</b>)
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                                <span>Sévérité : {p.severity === 'critical' ? 'Critique' : p.severity === 'warning' ? 'Avertissement' : 'Info'}</span>
                                <span style={{
                                    fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                    background: p.confidence >= 90 ? '#fef2f2' : '#fffbeb',
                                    color: p.confidence >= 90 ? '#ef4444' : '#f59e0b',
                                }}>
                                    {p.confidence}% confiance
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
