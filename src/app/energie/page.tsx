'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { settingsDb } from '@/lib/db';
import { useToast } from '@/components/ui/Toast';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Zap, Leaf, Coins, TrendingUp, Info, Save, Loader2, Power } from 'lucide-react';
import type { Machine, MachineType } from '@/lib/types';

// ── Energy model ────────────────────────────────────────────
// kWh = rated power (kW) × operating hours × load factor.
// A machine that is down draws nothing — downtime also saves energy.
const WORKING_DAYS_PER_MONTH = 26;
const CO2_PER_KWH = 0.61;            // Moroccan grid average, kg CO₂ / kWh
const DEFAULT_TARIFF = 1.2;          // MAD / kWh — industrial tariff
const DEFAULT_HOURS = 16;            // 2-shift plant

const loadFactor: Record<Machine['status'], number> = {
    'opérationnelle': 0.75,
    'en maintenance': 0,
    'en panne': 0,
    'arrêtée': 0,
};

const stageColor: Record<MachineType, string> = {
    'Réception': '#0ea5e9', 'Préparation': '#8b5cf6', 'Production': '#3b82f6',
    'Remplissage': '#f59e0b', 'Conditionnement': '#ec4899', 'Expédition': '#10b981',
    'Utilités': '#64748b',
};

/** Rated power in kW — falls back to an estimate from the electrical data. */
function ratedPower(m: Machine): number {
    if (m.power && m.power > 0) return m.power;
    if (m.voltage && m.amperage) {
        // 3-phase above 300 V, single-phase otherwise; cosφ ≈ 0.85
        const k = m.voltage >= 300 ? Math.sqrt(3) : 1;
        return Math.round((k * m.voltage * m.amperage * 0.85) / 1000 * 10) / 10;
    }
    return 0;
}

const iS: React.CSSProperties = { width: 110, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };

export default function EnergiePage() {
    const { machines } = useData();
    const { showToast } = useToast();
    const [tariff, setTariff] = useState(DEFAULT_TARIFF);
    const [hours, setHours] = useState(DEFAULT_HOURS);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stageFilter, setStageFilter] = useState<MachineType | 'all'>('all');

    useEffect(() => {
        (async () => {
            try {
                const [t, h] = await Promise.all([
                    settingsDb.get('energy_tariff'), settingsDb.get('energy_hours'),
                ]);
                if (t && !isNaN(Number(t))) setTariff(Number(t));
                if (h && !isNaN(Number(h))) setHours(Number(h));
            } catch { /* keep defaults */ }
            setLoaded(true);
        })();
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            await Promise.all([
                settingsDb.set('energy_tariff', String(tariff)),
                settingsDb.set('energy_hours', String(hours)),
            ]);
            showToast('Paramètres énergie enregistrés');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setSaving(false); }
    };

    const rows = useMemo(() => {
        return machines.map(m => {
            const kw = ratedPower(m);
            const lf = loadFactor[m.status] ?? 0;
            const dailyKwh = kw * hours * lf;
            const monthlyKwh = dailyKwh * WORKING_DAYS_PER_MONTH;
            return {
                m, kw, lf,
                dailyKwh, monthlyKwh,
                monthlyCost: monthlyKwh * tariff,
                co2: monthlyKwh * CO2_PER_KWH,
                idle: lf === 0,
            };
        }).sort((a, b) => b.monthlyKwh - a.monthlyKwh);
    }, [machines, hours, tariff]);

    const visible = stageFilter === 'all' ? rows : rows.filter(r => r.m.type === stageFilter);

    const fleetDailyKwh = rows.reduce((s, r) => s + r.dailyKwh, 0);
    const fleetMonthlyKwh = rows.reduce((s, r) => s + r.monthlyKwh, 0);
    const fleetMonthlyCost = fleetMonthlyKwh * tariff;
    const fleetCo2 = fleetMonthlyKwh * CO2_PER_KWH;
    const topConsumer = rows.find(r => r.monthlyKwh > 0);
    const idleCount = rows.filter(r => r.idle).length;
    const noPower = rows.filter(r => r.kw === 0).length;

    // ── Per-stage breakdown ──
    const byStage = useMemo(() => {
        const map = new Map<MachineType, number>();
        rows.forEach(r => map.set(r.m.type, (map.get(r.m.type) ?? 0) + r.monthlyKwh));
        return [...map.entries()]
            .map(([stage, kwh]) => ({ stage, kwh, cost: kwh * tariff }))
            .sort((a, b) => b.kwh - a.kwh);
    }, [rows, tariff]);
    const maxStage = Math.max(1, ...byStage.map(s => s.kwh));

    const stages = [...new Set(machines.map(m => m.type))];
    const chartData = visible.map(r => ({
        code: r.m.code, kwh: Math.round(r.monthlyKwh),
        color: r.idle ? '#cbd5e1' : (stageColor[r.m.type] ?? '#3b82f6'),
    }));

    const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
    const fmtMad = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' MAD';

    const kpi = (label: string, value: string, sub: string, color: string, icon: React.ReactNode) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
        </div>
    );

    return (
        <>
            <Header title="Suivi énergétique" subtitle="Consommation électrique et coût du parc machine" />
            <main style={{ padding: '24px 32px' }}>
                {/* Model note */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 12, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', marginBottom: 20 }}>
                    <Info size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--primary)', fontWeight: 500, lineHeight: 1.5 }}>
                        Estimation : kWh = puissance (kW) × heures de marche × taux de charge.
                        Une machine à l&apos;arrêt ou en panne ne consomme pas — chaque arrêt réduit aussi la facture.
                    </span>
                </div>

                {/* Tariff settings */}
                <div data-tour="energy-tariff" className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' }}>Tarif (MAD / kWh)</label>
                        <input data-tour="energy-tariff-input" style={iS} type="number" step="0.05" min="0" value={tariff}
                            onChange={e => setTariff(Math.max(0, Number(e.target.value)))} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' }}>Heures de marche / jour</label>
                        <input style={iS} type="number" step="1" min="1" max="24" value={hours}
                            onChange={e => setHours(Math.min(24, Math.max(1, Number(e.target.value))))} />
                    </div>
                    <button data-tour="energy-tariff-save" onClick={save} disabled={saving || !loaded} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving || !loaded ? 0.6 : 1 }}>
                        {saving ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={15} />}
                        Enregistrer
                    </button>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto', maxWidth: 240, lineHeight: 1.5 }}>
                        Le tarif et les heures sont partagés avec tous les postes.
                    </span>
                </div>

                {rows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <Zap size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune machine à analyser.</p>
                    </div>
                ) : (
                    <>
                        {/* KPIs */}
                        <div data-tour="energy-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                            {kpi('Conso. quotidienne', `${fmt(fleetDailyKwh)} kWh`, 'parc complet', '#3b82f6', <Zap size={13} />)}
                            {kpi('Conso. mensuelle', `${fmt(fleetMonthlyKwh)} kWh`, `${WORKING_DAYS_PER_MONTH} jours ouvrés`, '#8b5cf6', <TrendingUp size={13} />)}
                            {kpi('Coût mensuel estimé', fmtMad(fleetMonthlyCost), `à ${tariff} MAD/kWh`, '#f59e0b', <Coins size={13} />)}
                            {kpi('Empreinte CO₂', `${fmt(fleetCo2)} kg`, 'CO₂ / mois', '#16a34a', <Leaf size={13} />)}
                        </div>

                        {/* Top consumer + idle banner */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                            {topConsumer && (
                                <div className="card" style={{ padding: '14px 18px', flex: 1, minWidth: 260, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <TrendingUp size={20} color="#f59e0b" />
                                    <div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Plus gros consommateur</div>
                                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{topConsumer.m.code} — {topConsumer.m.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(topConsumer.monthlyKwh)} kWh/mois · {fmtMad(topConsumer.monthlyCost)}</div>
                                    </div>
                                </div>
                            )}
                            <div className="card" style={{ padding: '14px 18px', flex: 1, minWidth: 260, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Power size={20} color={idleCount ? '#16a34a' : 'var(--text-muted)'} />
                                <div>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Machines hors service</div>
                                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{idleCount} machine{idleCount > 1 ? 's' : ''} sans consommation</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        {noPower > 0 ? `${noPower} sans donnée de puissance` : 'Arrêtées, en panne ou en maintenance'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stage filter */}
                        <div data-tour="energy-stages" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            <button onClick={() => setStageFilter('all')} style={{
                                padding: '6px 14px', borderRadius: 100, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                border: `1px solid ${stageFilter === 'all' ? 'var(--primary)' : 'var(--border)'}`,
                                background: stageFilter === 'all' ? 'var(--primary)' : 'var(--surface)',
                                color: stageFilter === 'all' ? 'white' : 'var(--text-secondary)',
                            }}>Tous les ateliers</button>
                            {stages.map(s => (
                                <button key={s} onClick={() => setStageFilter(s)} style={{
                                    padding: '6px 14px', borderRadius: 100, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    border: `1px solid ${stageFilter === s ? (stageColor[s] ?? 'var(--primary)') : 'var(--border)'}`,
                                    background: stageFilter === s ? (stageColor[s] ?? 'var(--primary)') : 'var(--surface)',
                                    color: stageFilter === s ? 'white' : 'var(--text-secondary)',
                                }}>{s}</button>
                            ))}
                        </div>

                        {/* Consumption chart */}
                        <div data-tour="energy-chart" className="card" style={{ padding: 0, marginBottom: 22 }}>
                            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Zap size={18} color="#f59e0b" />
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Consommation mensuelle par machine</h3>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>kWh / mois</span>
                            </div>
                            <div className="card-body" style={{ height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip formatter={(v) => [`${fmt(Number(v))} kWh`, 'Mensuel']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }} />
                                        <Bar dataKey="kwh" radius={[6, 6, 0, 0]}>
                                            {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Per-stage breakdown */}
                        <div data-tour="energy-byStage" className="card" style={{ padding: 0, marginBottom: 22 }}>
                            <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Répartition par atelier</h3></div>
                            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {byStage.map(s => (
                                    <div key={s.stage}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                                            <span style={{ fontWeight: 600 }}>{s.stage}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{fmt(s.kwh)} kWh · {fmtMad(s.cost)}</span>
                                        </div>
                                        <div style={{ height: 9, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                            <div style={{ width: `${(s.kwh / maxStage) * 100}%`, height: '100%', background: stageColor[s.stage] ?? '#3b82f6' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Detail table */}
                        <div data-tour="energy-detail" className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Détail par machine{stageFilter !== 'all' ? ` — ${stageFilter}` : ''}</h3></div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead><tr>
                                        <th>Machine</th><th>Atelier</th><th>Puissance</th><th>État</th>
                                        <th>kWh / jour</th><th>kWh / mois</th><th>Coût / mois</th>
                                    </tr></thead>
                                    <tbody>
                                        {visible.map(r => (
                                            <tr key={r.m.id}>
                                                <td>
                                                    <Link href={`/machines/${r.m.id}`} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{r.m.code}</Link>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.m.name}</div>
                                                </td>
                                                <td style={{ fontSize: 12.5 }}>{r.m.type}</td>
                                                <td style={{ fontSize: 13 }}>{r.kw > 0 ? `${r.kw} kW` : <span style={{ color: '#d97706' }}>donnée manquante</span>}</td>
                                                <td>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: r.idle ? '#f1f5f9' : '#ecfdf5', color: r.idle ? '#64748b' : '#16a34a' }}>
                                                        {r.idle ? 'Hors service' : 'En marche'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 13 }}>{fmt(r.dailyKwh)}</td>
                                                <td style={{ fontSize: 13, fontWeight: 600 }}>{fmt(r.monthlyKwh)}</td>
                                                <td style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>{fmtMad(r.monthlyCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
                <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </main>
        </>
    );
}
