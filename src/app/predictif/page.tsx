'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { calculateMTBF } from '@/lib/calculations';
import { useMemo } from 'react';
import Link from 'next/link';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Radar, HeartPulse, AlertTriangle, CalendarClock, Info, CalendarPlus } from 'lucide-react';

const HOURS_PER_DAY = 8;   // operating hours/day — matches the MTBF model in lib/calculations
const DAY_MS = 86400000;

type Risk = 'critical' | 'warning' | 'ok';
const riskCfg: Record<Risk, { label: string; color: string; bg: string }> = {
    critical: { label: 'Risque élevé', color: '#dc2626', bg: '#fef2f2' },
    warning: { label: 'À surveiller', color: '#d97706', bg: '#fffbeb' },
    ok: { label: 'Sain', color: '#16a34a', bg: '#f0fdf4' },
};

export default function PredictifPage() {
    const { machines, interventions } = useData();

    /** When the machine has no recorded failure yet, we still need an MTBF
     *  baseline to give an honest prediction. Use the cohort average (peers
     *  of the same type), fall back to a 2000 h industry baseline. The
     *  confidence flag marks predictions made without real history so the
     *  user knows when to trust them. */
    const rows = useMemo(() => {
        const today = Date.now();
        // Cohort baseline by machine type — average MTBF of peers with history.
        const cohortMtbf = new Map<string, number>();
        machines.forEach(m => {
            const peers = machines.filter(x => x.type === m.type && calculateMTBF(x.id) < 999);
            if (peers.length === 0) return;
            const avg = peers.reduce((s, p) => s + calculateMTBF(p.id), 0) / peers.length;
            cohortMtbf.set(m.type, avg);
        });
        const INDUSTRY_BASELINE_H = 2000;   // 2000 h ≈ 250 jours à 8 h/j

        return machines.map(m => {
            const corr = interventions
                .filter(i => i.machineId === m.id && i.interventionType === 'corrective')
                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
            const realMtbf = calculateMTBF(m.id);             // hours; 999 = no completed failure
            const broken = m.status === 'en panne';
            const hasHistory = corr.length > 0 && realMtbf < 999;
            // Pick the MTBF actually used in the prediction.
            const cohort = cohortMtbf.get(m.type);
            const mtbf = hasHistory
                ? realMtbf
                : (cohort ?? INDUSTRY_BASELINE_H);
            const confidence: 'high' | 'medium' | 'low' = hasHistory ? 'high'
                : cohort != null ? 'medium' : 'low';
            // Anchor point: last failure if we have one, else install date.
            const anchor = corr.length
                ? new Date(corr[0].startDate).getTime()
                : new Date(m.installationDate).getTime();

            let health: number, rulDays: number, predicted: number | null, lastFailure: number | null;
            if (broken) {
                lastFailure = anchor; health = 0; rulDays = 0; predicted = today;
            } else {
                lastFailure = hasHistory ? anchor : null;
                const elapsedHours = Math.max(0, (today - anchor) / DAY_MS) * HOURS_PER_DAY;
                health = Math.max(0, Math.min(100, Math.round(100 * (1 - elapsedHours / mtbf))));
                rulDays = Math.round((mtbf - elapsedHours) / HOURS_PER_DAY);
                predicted = today + rulDays * DAY_MS;
            }

            let risk: Risk = 'ok';
            if (broken || (health <= 25 || rulDays <= 7)) risk = 'critical';
            else if (health <= 55 || rulDays <= 30) risk = 'warning';

            return { m, mtbf, hasHistory, broken, health, rulDays, predicted, lastFailure, risk, breakdowns: corr.length, confidence };
        }).sort((a, b) => {
            const order = { critical: 0, warning: 1, ok: 2 };
            if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
            return a.health - b.health;
        });
    }, [machines, interventions]);

    const atRisk = rows.filter(r => r.risk !== 'ok').length;
    const avgHealth = rows.length ? Math.round(rows.reduce((s, r) => s + r.health, 0) / rows.length) : 0;
    const nextFail = rows.filter(r => r.risk !== 'ok' && r.predicted).sort((a, b) => a.predicted! - b.predicted!)[0];
    const fmtDate = (ms: number | null) => ms ? new Date(ms).toLocaleDateString('fr-FR') : '—';

    const chartData = rows.map(r => ({ code: r.m.code, health: r.health, color: riskCfg[r.risk].color }));

    const kpi = (label: string, value: string | number, color: string, icon: React.ReactNode) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 170 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    const action = (r: typeof rows[number]) =>
        r.risk === 'critical'
            ? (r.broken ? 'Réparation en cours requise' : `Planifier une intervention sans délai`)
            : r.risk === 'warning'
                ? `Planifier un préventif avant le ${fmtDate(r.predicted)}`
                : 'Surveillance normale';

    return (
        <>
            <Header title="Maintenance prédictive" subtitle="Estimation de la durée de vie restante avant panne" />
            <main style={{ padding: '24px 32px' }}>
                {/* Model note */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', borderRadius: 12, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', marginBottom: 20 }}>
                    <Info size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--primary)', fontWeight: 500, lineHeight: 1.55 }}>
                        <b>Formule :</b> Santé = 100 × (1 − heures_écoulées / MTBF) · RUL = (MTBF − heures_écoulées) ÷ 8 h/j · Date prévue = aujourd&apos;hui + RUL.<br />
                        <b>Source du MTBF :</b> ★★★ historique de la machine si pannes connues · ★★ moyenne des machines du même type · ★ baseline industrielle 2000 h sinon. Toutes les machines reçoivent maintenant une prédiction.
                    </span>
                </div>

                {rows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <Radar size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune machine à analyser.</p>
                    </div>
                ) : (
                    <>
                        {/* KPIs */}
                        <div data-tour="pred-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                            {kpi('Machines à risque', atRisk, atRisk ? '#dc2626' : '#16a34a', <AlertTriangle size={13} />)}
                            {kpi('Santé moyenne du parc', `${avgHealth}%`, avgHealth >= 70 ? '#16a34a' : avgHealth >= 45 ? '#d97706' : '#dc2626', <HeartPulse size={13} />)}
                            {kpi('Prochaine panne estimée', nextFail ? `${nextFail.m.code} · ${fmtDate(nextFail.predicted)}` : '—', '#3b82f6', <CalendarClock size={13} />)}
                        </div>

                        {/* Health chart */}
                        <div data-tour="pred-chart" className="card" style={{ padding: 0, marginBottom: 22 }}>
                            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Radar size={18} color="#3b82f6" />
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Indice de santé par machine</h3>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>100 % = sain · 0 % = panne imminente</span>
                            </div>
                            <div className="card-body" style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                                        <Tooltip formatter={(v) => [`${v}%`, 'Santé']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }} />
                                        <ReferenceLine y={55} stroke="#d97706" strokeDasharray="5 5" />
                                        <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="5 5" />
                                        <Bar dataKey="health" radius={[6, 6, 0, 0]}>
                                            {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Predictions table */}
                        <div data-tour="pred-table" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Prévisions par machine</h3></div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead><tr>
                                        <th>Machine</th><th>Santé</th><th>Durée de vie restante</th><th>Panne estimée</th><th>Pannes passées</th><th>Risque</th><th>Action recommandée</th>
                                    </tr></thead>
                                    <tbody>
                                        {rows.map(r => {
                                            const cfg = riskCfg[r.risk];
                                            return (
                                                <tr key={r.m.id} data-tour="pred-row">
                                                    <td>
                                                        <Link data-tour="pred-row-link" href={`/machines/${r.m.id}`} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{r.m.code}</Link>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.m.name}</div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 70, height: 7, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                                                <div style={{ width: `${r.health}%`, height: '100%', background: cfg.color }} />
                                                            </div>
                                                            <span style={{ fontSize: 12.5, fontWeight: 700, color: cfg.color }}>{r.health}%</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ fontWeight: 600, fontSize: 13 }}>
                                                        {r.rulDays <= 0 ? <span style={{ color: '#dc2626' }}>Échéance dépassée</span> : `~ ${r.rulDays} j`}
                                                    </td>
                                                    <td style={{ fontSize: 13 }}>
                                                        {fmtDate(r.predicted)}
                                                        <div style={{ fontSize: 10, marginTop: 2, color: r.confidence === 'high' ? '#16a34a' : r.confidence === 'medium' ? '#d97706' : '#94a3b8' }}>
                                                            Confiance : {r.confidence === 'high' ? '★★★ historique réel' : r.confidence === 'medium' ? '★★ moyenne du type' : '★ baseline 2000 h'}
                                                        </div>
                                                    </td>
                                                    <td style={{ fontSize: 13 }}>{r.breakdowns}</td>
                                                    <td>
                                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                                                            {cfg.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span>{action(r)}</span>
                                                            {r.risk !== 'ok' && (
                                                                <Link href={`/maintenance-plans?machineId=${r.m.id}&autoopen=1`} title="Planifier un entretien" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 7, background: 'var(--primary-lighter)', color: 'var(--primary)', textDecoration: 'none' }}>
                                                                    <CalendarPlus size={12} /> Planifier
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
