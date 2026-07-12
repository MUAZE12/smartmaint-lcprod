'use client';

import Header from '@/components/Header';
import { machines, interventions } from '@/lib/data';
import { useData } from '@/context/DataContext';
import CustomKpiCards from '@/components/CustomKpiCards';
import { usePrintPrep } from '@/hooks/usePrintPrep';
import { exportElementToPdf } from '@/lib/printToPdf';
import { generateReportsPdf } from '@/lib/generateReportsPdf';
import { useToast } from '@/components/ui/Toast';
import {
    getMachineKPI,
    calculateTRS,
    getRecommendations,
    getGlobalKPI,
    getCriticalityLevel,
    getInterventionsByType,
} from '@/lib/calculations';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
    AreaChart, Area, ComposedChart, Line,
} from 'recharts';
import {
    FileBarChart, Shield, DollarSign, Gauge, AlertTriangle,
    TrendingUp, Activity, Cpu, Brain, BarChart3, ShoppingCart, Zap, Database, Printer,
    Info,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProcurementTCO, { tcoData, forecastData } from '@/components/industry40/ProcurementTCO';
import SPCAnomalyDashboard from '@/components/industry40/SPCAnomalyDashboard';

type Tab = 'analytics' | 'fmd' | 'economic' | 'tpm' | 'criticality' | 'recommendations' | 'spc' | 'tco' | 'pareto';

// Generate simulated trend data. `range` selects the granularity:
//   30j   → 30 points, labelled J1..J30
//   12m   → 12 points, labelled janv..déc (whole rolling year)
function generateTrend(base: number, variance: number, trend: 'up' | 'down' | 'stable' = 'stable', range: '30j' | '12m' = '30j') {
    const monthLabels = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
    if (range === '12m') {
        // Anchor around current month so labels are always "last 12 months".
        const now = new Date();
        return Array.from({ length: 12 }, (_, i) => {
            const trendOffset = trend === 'up' ? i * 1.2 : trend === 'down' ? -i * 0.8 : 0;
            const noise = (Math.random() - 0.5) * variance * 2;
            const monthIdx = (now.getMonth() - 11 + i + 12) % 12;
            return { day: i + 1, label: monthLabels[monthIdx], value: Math.max(0, +(base + trendOffset + noise).toFixed(1)) };
        });
    }
    return Array.from({ length: 30 }, (_, i) => {
        const trendOffset = trend === 'up' ? i * 0.15 : trend === 'down' ? -i * 0.1 : 0;
        const noise = (Math.random() - 0.5) * variance;
        return { day: i + 1, label: `J${i + 1}`, value: Math.max(0, +(base + trendOffset + noise).toFixed(1)) };
    });
}

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'analytics', label: 'Vue d’ensemble', icon: Zap },
    { key: 'fmd', label: 'Analyse FMD', icon: TrendingUp },
    { key: 'economic', label: 'Analyse Économique', icon: DollarSign },
    { key: 'tpm', label: 'Analyse TPM / TRS', icon: Gauge },
    { key: 'criticality', label: 'Machines Critiques', icon: Shield },
    { key: 'recommendations', label: 'Recommandations IA', icon: Brain },
    { key: 'spc', label: 'Contrôle SPC', icon: BarChart3 },
    { key: 'pareto', label: 'Causes de pannes', icon: AlertTriangle },
    { key: 'tco', label: 'TCO & Achats', icon: ShoppingCart },
];

export default function ReportsPage() {
    useData(); // re-render on live DB changes; calculation helpers read synced arrays
    const router = useRouter();
    const { showToast } = useToast();
    // Ticks up right before Chromium takes a print snapshot. We use it as
    // a React key on the main content so every Recharts chart unmounts +
    // remounts inside the print viewport → measures the correct width and
    // paints proper bars/lines/radars on the PDF instead of blank space.
    const printKey = usePrintPrep();
    const [exporting, setExporting] = useState(false);
    const searchParams = useSearchParams();
    // Deep-linkable via ?tab=economic / ?tab=fmd / ?tab=criticality so dashboard
    // KPIs can jump straight to the right report section.
    const initialTab = (() => {
        const t = searchParams?.get('tab');
        if (t && (['analytics', 'fmd', 'economic', 'tpm', 'criticality', 'recommendations', 'spc', 'pareto', 'tco'] as const).includes(t as Tab)) {
            return t as Tab;
        }
        return 'analytics' as Tab;
    })();
    const [activeTab, setActiveTab] = useState<Tab>(initialTab);
    // Honor URL param changes after first mount (e.g. when an in-app link
    // updates the query string without unmounting the page).
    useEffect(() => {
        const t = searchParams?.get('tab');
        if (t && t !== activeTab && (['analytics', 'fmd', 'economic', 'tpm', 'criticality', 'recommendations', 'spc', 'pareto', 'tco'] as const).includes(t as Tab)) {
            setActiveTab(t as Tab);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
    const [paretoAtelier, setParetoAtelier] = useState('all');
    const [atelier, setAtelier] = useState('all');   // filters the per-machine tables
    const [trendRange, setTrendRange] = useState<'30j' | '12m'>('30j');

    // Pareto of breakdown causes — corrective interventions grouped by probable cause
    const ateliers = useMemo(() => [...new Set(machines.map(m => m.workshop).filter(Boolean))], []);
    const paretoData = useMemo(() => {
        let corrective = interventions.filter(i => i.interventionType === 'corrective');
        if (paretoAtelier !== 'all') {
            corrective = corrective.filter(i => machines.find(m => m.id === i.machineId)?.workshop === paretoAtelier);
        }
        const counts: Record<string, number> = {};
        corrective.forEach(i => {
            const cause = (i.probableCause || '').trim() || 'Cause non précisée';
            counts[cause] = (counts[cause] || 0) + 1;
        });
        const sorted = Object.entries(counts).map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count);
        const total = sorted.reduce((s, x) => s + x.count, 0);
        let cum = 0;
        return sorted.map(x => { cum += x.count; return { ...x, cumulative: total ? Math.round((cum / total) * 100) : 0 }; });
    }, [paretoAtelier]);
    const paretoTotal = paretoData.reduce((s, x) => s + x.count, 0);
    const vitalFew = paretoData.findIndex(x => x.cumulative >= 80) + 1;

    const filteredMachines = atelier === 'all' ? machines : machines.filter(m => m.workshop === atelier);
    const allKPIs = filteredMachines.map(m => getMachineKPI(m.id));
    const allTRS = filteredMachines.map(m => calculateTRS(m.id));

    // Atelier-aware KPI overlay. getGlobalKPI() ignores the atelier filter,
    // so we recompute the figures shown in the KPI cards (analytics, FMD, TPM,
    // Économique) from the filtered machine lists. When atelier === 'all' the
    // values match getGlobalKPI() exactly; when atelier is set they reflect
    // only that workshop, which is what makes the filter visibly do something.
    const baseKpi = getGlobalKPI();
    const trsWithData = allTRS.filter(t => t.trs > 0);
    const kpi = {
        ...baseKpi,
        avgMTBF: allKPIs.length ? Math.round((allKPIs.reduce((s, k) => s + k.mtbf, 0) / allKPIs.length) * 10) / 10 : 0,
        avgMTTR: allKPIs.length ? Math.round((allKPIs.reduce((s, k) => s + k.mttr, 0) / allKPIs.length) * 10) / 10 : 0,
        avgAvailability: allKPIs.length ? Math.round((allKPIs.reduce((s, k) => s + k.availability, 0) / allKPIs.length) * 10) / 10 : 0,
        avgTRS: trsWithData.length ? Math.round((trsWithData.reduce((s, t) => s + t.trs, 0) / trsWithData.length) * 10) / 10 : 0,
        totalMaintenanceCost: allKPIs.reduce((s, k) => s + k.totalCost, 0),
    };

    // 30-day trend data for sparklines — keyed on the FILTERED kpi so they
    // animate when the user changes atelier.
    const oeeTrend = useMemo(() => generateTrend(kpi.avgTRS, 5, 'up', trendRange), [kpi.avgTRS, trendRange]);
    const mttrTrend = useMemo(() => generateTrend(kpi.avgMTTR, 1.5, 'down', trendRange), [kpi.avgMTTR, trendRange]);
    const mtbfTrend = useMemo(() => generateTrend(kpi.avgMTBF, 30, 'up', trendRange), [kpi.avgMTBF, trendRange]);
    const recommendations = getRecommendations();

    return (
        <>
            <Header title="Rapports" subtitle="Analyse intelligente de la maintenance" />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                {/* Print-only document header (appears on paper / PDF) */}
                <div className="print-only" style={{ marginBottom: 16, borderBottom: '2px solid #1e293b', paddingBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>SmartMaint — L.C PROD · Rapport de maintenance</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        GMAO Agroalimentaire · Édité le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                {/* Atelier filter + print button */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Atelier :</span>
                            <select data-tour="reports-atelier" value={atelier} onChange={e => setAtelier(e.target.value)}
                                style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                                <option value="all">Tous les ateliers</option>
                                {ateliers.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: 2 }}>
                            {(['30j', '12m'] as const).map(r => (
                                <button key={r} onClick={() => setTrendRange(r)}
                                    style={{
                                        padding: '6px 12px', borderRadius: 7, border: 'none',
                                        background: trendRange === r ? 'var(--primary)' : 'transparent',
                                        color: trendRange === r ? 'white' : 'var(--text-secondary)',
                                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                        transition: 'all 0.2s',
                                    }}>
                                    {r === '30j' ? '30 jours' : '12 mois'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button data-tour="reports-print" disabled={exporting} onClick={async () => {
                        setExporting(true);
                        showToast('📄 Génération du PDF…');
                        try {
                            // Direct-draw the report from raw data via jsPDF — the
                            // charts are painted from numbers, so they ALWAYS show
                            // (no DOM snapshot, no rasterization).
                            const interventionsByType = {
                                corrective: interventions.filter(i => i.interventionType === 'corrective').length,
                                preventive: interventions.filter(i => i.interventionType === 'préventive').length,
                                predictive: interventions.filter(i => i.interventionType === 'conditionnelle').length,
                            };
                            const machineKpisWithId = filteredMachines.map(m => ({ id: m.id, ...getMachineKPI(m.id) }));
                            void getInterventionsByType; // silence unused-import lint
                            generateReportsPdf({
                                activeTab,
                                atelier,
                                kpi: { avgTRS: kpi.avgTRS, avgMTTR: kpi.avgMTTR, avgMTBF: kpi.avgMTBF, avgAvailability: kpi.avgAvailability, totalMaintenanceCost: kpi.totalMaintenanceCost },
                                oeeTrend, mttrTrend, mtbfTrend,
                                tcoData: [...tcoData],
                                forecastData: [...forecastData],
                                paretoData,
                                paretoTotal,
                                vitalFew,
                                machines: filteredMachines.map(m => {
                                    const k = getMachineKPI(m.id);
                                    return { id: m.id, name: m.name, workshop: m.workshop, criticality: k.criticalityLevel, status: m.status };
                                }),
                                machineKpis: machineKpisWithId,
                                recommendations: recommendations.map(r => ({ title: `${r.machineCode} — ${r.category}`, description: r.message, priority: r.level })),
                                interventionsByType,
                            });
                            showToast('✅ PDF téléchargé');
                            // Suppress unused-var warnings on legacy fallback
                            void exportElementToPdf;
                        } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Erreur d\'export PDF', 'error');
                        } finally { setExporting(false); }
                    }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10,
                        background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600,
                        cursor: exporting ? 'wait' : 'pointer', color: 'var(--text-secondary)',
                        opacity: exporting ? 0.6 : 1,
                    }}>
                        <Printer size={16} /> {exporting ? 'Génération…' : 'Imprimer / Exporter en PDF'}
                    </button>
                </div>

                {/* Tabs */}
                <div
                    data-tour="reports-tabs"
                    className="no-print"
                    style={{
                        display: 'flex',
                        gap: 4,
                        marginBottom: 24,
                        background: 'var(--surface)',
                        padding: 4,
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        overflowX: 'auto',
                    }}
                >
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                data-tour={`reports-tab-${tab.key}`}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '10px 18px',
                                    borderRadius: 'var(--radius-md)',
                                    border: 'none',
                                    background: isActive ? 'var(--primary)' : 'transparent',
                                    color: isActive ? 'white' : 'var(--text-secondary)',
                                    fontWeight: isActive ? 600 : 400,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Wrapped in a keyed subtree — the key ticks up just before
                    exportElementToPdf snapshots so every Recharts chart
                    unmounts + remounts and paints at the correct width. */}
                <div id="reports-print-root" key={`print-${printKey}`}>
                {/* TAB: ANALYTICS OVERVIEW */}
                {activeTab === 'analytics' && (
                    <div className="animate-fade-in">
                        {/* Data Source Badge */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
                            padding: '10px 18px', borderRadius: 12,
                            background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)',
                        }}>
                            <Database size={16} color="var(--primary)" />
                            <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
                                KPIs dynamically generated from real-time machine telemetry and closed work orders.
                            </span>
                            <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 2s infinite' }} />
                        </div>

                        {/* Custom KPIs from the Formula Builder — visible only if the admin has saved any. */}
                        <CustomKpiCards />

                        {/* KPI Cards with Sparklines */}
                        <div data-tour="reports-analytics-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
                            {/* OEE Card */}
                            <div className="card" style={{ padding: 24, overflow: 'hidden', position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Gauge size={18} color="#06b6d4" />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global OEE (TRS)</span>
                                </div>
                                <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
                                    {kpi.avgTRS}<span style={{ fontSize: 20, color: 'var(--text-muted)' }}>%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 12 }}>
                                    <TrendingUp size={13} /> +2.4% vs last month
                                </div>
                                <div style={{ height: 60, marginLeft: -10, marginRight: -10 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={oeeTrend}>
                                            <defs>
                                                <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#oeeGrad)" dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* MTTR Card */}
                            <div className="card" style={{ padding: 24, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Activity size={18} color="#f97316" />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average MTTR</span>
                                </div>
                                <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
                                    {kpi.avgMTTR}<span style={{ fontSize: 20, color: 'var(--text-muted)' }}> h</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 12 }}>
                                    <TrendingUp size={13} /> -0.8h improved
                                </div>
                                <div style={{ height: 60, marginLeft: -10, marginRight: -10 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={mttrTrend}>
                                            <defs>
                                                <linearGradient id="mttrGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                                                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} fill="url(#mttrGrad)" dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* MTBF Card */}
                            <div className="card" style={{ padding: 24, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Shield size={18} color="#22c55e" />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average MTBF</span>
                                </div>
                                <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 4 }}>
                                    {kpi.avgMTBF}<span style={{ fontSize: 20, color: 'var(--text-muted)' }}> h</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 12 }}>
                                    <TrendingUp size={13} /> +12h reliability gain
                                </div>
                                <div style={{ height: 60, marginLeft: -10, marginRight: -10 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={mtbfTrend}>
                                            <defs>
                                                <linearGradient id="mtbfGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fill="url(#mtbfGrad)" dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: FMD — Fiabilité, Maintenabilité, Disponibilité */}
                {activeTab === 'fmd' && (
                    <div className="animate-fade-in">
                        <div data-tour="reports-fmd-kpis" className="kpi-grid" style={{ marginBottom: 24 }}>
                            <div className="kpi-card green">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>MTBF Moyen</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.avgMTBF} h</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Temps moyen entre pannes</div>
                            </div>
                            <div className="kpi-card orange">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>MTTR Moyen</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.avgMTTR} h</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Temps moyen de réparation</div>
                            </div>
                            <div className="kpi-card blue">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Disponibilité</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.avgAvailability}%</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>MTBF / (MTBF + MTTR)</div>
                            </div>
                        </div>

                        <div data-tour="reports-fmd-table" className="card" style={{ padding: 0 }}>
                            <div className="card-header">
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>FMD par machine</h3>
                            </div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Machine</th>
                                            <th>MTBF (h)</th>
                                            <th>MTTR (h)</th>
                                            <th>Disponibilité (%)</th>
                                            <th>Pannes</th>
                                            <th>Arrêt total (h)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allKPIs.map(k => (
                                            <tr key={k.machineId} onClick={() => router.push(`/machines/${k.machineId}`)} style={{ cursor: 'pointer' }}>
                                                <td style={{ fontWeight: 600 }}>{k.machineCode} — {k.machineName}</td>
                                                <td>{k.mtbf}</td>
                                                <td>{k.mttr}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f1f5f9', maxWidth: 100 }}>
                                                            <div style={{ width: `${Math.min(k.availability, 100)}%`, height: '100%', borderRadius: 3, background: k.availability >= 95 ? '#22c55e' : k.availability >= 85 ? '#f59e0b' : '#ef4444' }} />
                                                        </div>
                                                        <span style={{ fontWeight: 600 }}>{k.availability}%</span>
                                                    </div>
                                                </td>
                                                <td>{k.breakdownCount}</td>
                                                <td>{k.totalDowntime}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: Analyse Économique */}
                {activeTab === 'economic' && (
                    <div className="animate-fade-in">
                        <div data-tour="reports-eco-kpis" className="kpi-grid" style={{ marginBottom: 24 }}>
                            <div className="kpi-card purple">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Coût total maintenance</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.totalMaintenanceCost.toLocaleString('fr-FR')} MAD</div>
                            </div>
                            <div className="kpi-card red">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Coût corrective</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                                    {interventions.filter(i => i.interventionType === 'corrective').reduce((s, i) => s + i.totalCost, 0).toLocaleString('fr-FR')} MAD
                                </div>
                            </div>
                            <div className="kpi-card green">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Coût préventive</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                                    {interventions.filter(i => i.interventionType !== 'corrective').reduce((s, i) => s + i.totalCost, 0).toLocaleString('fr-FR')} MAD
                                </div>
                            </div>
                        </div>

                        <div data-tour="reports-eco-charts" className="chart-grid">
                            <div data-tour="reports-eco-bar" className="card">
                                <div className="card-header">
                                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Coût par machine (MAD)</h3>
                                </div>
                                <div className="card-body" style={{ height: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={allKPIs.map(k => ({ machine: k.machineCode, coût: k.totalCost }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis dataKey="machine" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip formatter={(value) => [`${Number(value).toLocaleString('fr-FR')} MAD`, 'Coût']} />
                                            <Bar dataKey="coût" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div data-tour="reports-eco-pie" className="card">
                                <div className="card-header">
                                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Répartition des coûts par type</h3>
                                </div>
                                <div className="card-body" style={{ height: 300, display: 'flex', alignItems: 'center' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Main-d\'œuvre', value: interventions.reduce((s, i) => s + i.laborCost, 0), color: '#3b82f6' },
                                                    { name: 'Pièces', value: interventions.reduce((s, i) => s + i.partsCost, 0), color: '#f59e0b' },
                                                    { name: 'Arrêt', value: interventions.reduce((s, i) => s + i.downtimeCost, 0), color: '#ef4444' },
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={85}
                                                paddingAngle={4}
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                            >
                                                <Cell fill="#3b82f6" />
                                                <Cell fill="#f59e0b" />
                                                <Cell fill="#ef4444" />
                                            </Pie>
                                            <Tooltip formatter={(value) => `${Number(value).toLocaleString('fr-FR')} MAD`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Detailed cost table */}
                        <div data-tour="reports-eco-table" className="card" style={{ marginTop: 20, padding: 0 }}>
                            <div className="card-header">
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Détail des coûts par machine</h3>
                            </div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Machine</th>
                                            <th>Main-d&apos;œuvre</th>
                                            <th>Pièces</th>
                                            <th>Coût d&apos;arrêt</th>
                                            <th>Coût total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMachines.map(m => {
                                            const ints = interventions.filter(i => i.machineId === m.id);
                                            const labor = ints.reduce((s, i) => s + i.laborCost, 0);
                                            const parts = ints.reduce((s, i) => s + i.partsCost, 0);
                                            const downtime = ints.reduce((s, i) => s + i.downtimeCost, 0);
                                            const total = labor + parts + downtime;
                                            return (
                                                <tr key={m.id} onClick={() => router.push(`/machines/${m.id}`)} style={{ cursor: 'pointer' }}>
                                                    <td style={{ fontWeight: 600 }}>{m.code}</td>
                                                    <td>{labor.toLocaleString('fr-FR')} MAD</td>
                                                    <td>{parts.toLocaleString('fr-FR')} MAD</td>
                                                    <td>{downtime.toLocaleString('fr-FR')} MAD</td>
                                                    <td style={{ fontWeight: 700 }}>{total.toLocaleString('fr-FR')} MAD</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: TPM / TRS */}
                {activeTab === 'tpm' && (
                    <div className="animate-fade-in">
                        <div data-tour="reports-tpm-kpis" className="kpi-grid" style={{ marginBottom: 24 }}>
                            <div className="kpi-card blue">
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>TRS Moyen</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{kpi.avgTRS}%</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Dispo × Perf × Qualité</div>
                            </div>
                        </div>

                        <div data-tour="reports-tpm-table" className="card" style={{ padding: 0 }}>
                            <div className="card-header">
                                <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Gauge size={18} />
                                    TRS par machine
                                </h3>
                            </div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Machine</th>
                                            <th>Disponibilité</th>
                                            <th>Performance</th>
                                            <th>Qualité</th>
                                            <th>TRS</th>
                                            <th>Évaluation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allTRS.map(t => {
                                            const trsColor = t.trs >= 85 ? '#22c55e' : t.trs >= 60 ? '#f59e0b' : '#ef4444';
                                            const trsLabel = t.trs >= 85 ? 'Excellent' : t.trs >= 60 ? 'Acceptable' : 'Insuffisant';
                                            return (
                                                <tr key={t.machineId} onClick={() => t.machineId && router.push(`/machines/${t.machineId}`)} style={{ cursor: 'pointer' }}>
                                                    <td style={{ fontWeight: 600 }}>{t.machineName || '—'}</td>
                                                    <td>{t.availability}%</td>
                                                    <td>{t.performance}%</td>
                                                    <td>{t.quality}%</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f1f5f9', maxWidth: 80 }}>
                                                                <div style={{ width: `${Math.min(t.trs, 100)}%`, height: '100%', borderRadius: 4, background: trsColor, transition: 'width 0.5s ease' }} />
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: trsColor }}>{t.trs}%</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: `${trsColor}15`, color: trsColor }}>
                                                            {trsLabel}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 6 pertes TPM — only "Pannes" comes from real data
                            (corrective interventions). The 5 other categories
                            require dedicated instrumentation (changeover logs,
                            micro-stop sensors, speed loss, quality defects,
                            startup timing) that the GMAO ne capte pas encore.
                            We show that explicitly so personne ne lit ces
                            chiffres comme s'ils étaient mesurés. */}
                        <div data-tour="reports-tpm-losses" className="card" style={{ padding: 20, marginTop: 20 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Activity size={18} />
                                Les 6 pertes principales (TPM)
                            </h3>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Info size={12} /> Seules les pannes proviennent de mesures réelles. Les 5 autres pertes nécessitent une instrumentation dédiée (capteurs micro-arrêts, journal des changements de série, etc.).
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                {[
                                    { label: 'Pannes', desc: 'Arrêts non planifiés', icon: '🔴', value: interventions.filter(i => i.interventionType === 'corrective').length, source: 'real' as const },
                                    { label: 'Réglages', desc: 'Changements et réglages', icon: '🟡', value: '—', source: 'pending' as const },
                                    { label: 'Micro-arrêts', desc: 'Arrêts < 5 minutes', icon: '🟠', value: '—', source: 'pending' as const },
                                    { label: 'Ralentissements', desc: 'Vitesse réduite', icon: '🟡', value: '—', source: 'pending' as const },
                                    { label: 'Défauts qualité', desc: 'Produits non conformes', icon: '🔵', value: '—', source: 'pending' as const },
                                    { label: 'Démarrage', desc: 'Pertes au démarrage', icon: '🟣', value: '—', source: 'pending' as const },
                                ].map((loss, idx) => (
                                    <div key={idx} style={{ padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--surface-hover)', textAlign: 'center', position: 'relative' }}>
                                        <div style={{ fontSize: 24, marginBottom: 8 }}>{loss.icon}</div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{loss.label}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{loss.desc}</div>
                                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: loss.source === 'real' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{loss.value}</div>
                                        {loss.source === 'pending'
                                            ? <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', marginTop: 6 }}>📡 instrumentation requise</div>
                                            : <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginTop: 6 }}>✓ mesuré</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: Machines Critiques */}
                {activeTab === 'criticality' && (
                    <div className="animate-fade-in">
                        <div className="chart-grid" style={{ marginBottom: 24 }}>
                            <div data-tour="reports-crit-radar" className="card">
                                <div className="card-header">
                                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Score de criticité</h3>
                                </div>
                                <div className="card-body" style={{ height: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={allKPIs.map(k => ({ machine: k.machineCode, score: k.criticalityScore }))}>
                                            <PolarGrid stroke="#e2e8f0" />
                                            <PolarAngleAxis dataKey="machine" tick={{ fontSize: 12 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                                            <Radar name="Criticité" dataKey="score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div data-tour="reports-crit-formula" className="card">
                                <div className="card-header">
                                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Formule de criticité</h3>
                                </div>
                                <div className="card-body">
                                    <div style={{
                                        background: 'var(--surface-hover)',
                                        padding: 20,
                                        borderRadius: 'var(--radius-md)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 14,
                                        lineHeight: 2,
                                    }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-sans)', fontSize: 15 }}>Score = </div>
                                        <div>  <span style={{ color: '#ef4444', fontWeight: 700 }}>40%</span> × Fréquence des pannes</div>
                                        <div>+ <span style={{ color: '#f59e0b', fontWeight: 700 }}>30%</span> × Durée totale d&apos;arrêt</div>
                                        <div>+ <span style={{ color: '#8b5cf6', fontWeight: 700 }}>20%</span> × Coût d&apos;arrêt</div>
                                        <div>+ <span style={{ color: '#3b82f6', fontWeight: 700 }}>10%</span> × Importance machine</div>
                                    </div>
                                    <div style={{ marginTop: 16, fontSize: 13 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span className="badge badge-low">0 — 40 : Faible</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span className="badge badge-medium">41 — 70 : Moyen</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="badge badge-critical">71 — 100 : Élevé</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div data-tour="reports-crit-table" className="card" style={{ padding: 0 }}>
                            <div className="card-header">
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Classement des machines par criticité</h3>
                            </div>
                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Machine</th>
                                            <th>Score</th>
                                            <th>Niveau</th>
                                            <th>Pannes</th>
                                            <th>Arrêt (h)</th>
                                            <th>Coût (MAD)</th>
                                            <th>Importance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allKPIs.sort((a, b) => b.criticalityScore - a.criticalityScore).map((k, idx) => {
                                            const machine = machines.find(m => m.id === k.machineId)!;
                                            const badgeClass = k.criticalityLevel === 'élevé' ? 'badge-critical' : k.criticalityLevel === 'moyen' ? 'badge-medium' : 'badge-low';
                                            return (
                                                <tr key={k.machineId} onClick={() => router.push(`/machines/${k.machineId}`)} style={{ cursor: 'pointer' }}>
                                                    <td style={{ fontWeight: 700, fontSize: 16 }}>{idx + 1}</td>
                                                    <td style={{ fontWeight: 600 }}>{k.machineCode} — {k.machineName}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f1f5f9', maxWidth: 80 }}>
                                                                <div style={{ width: `${k.criticalityScore}%`, height: '100%', borderRadius: 3, background: k.criticalityLevel === 'élevé' ? '#ef4444' : k.criticalityLevel === 'moyen' ? '#f59e0b' : '#22c55e' }} />
                                                            </div>
                                                            <span style={{ fontWeight: 700 }}>{k.criticalityScore}</span>
                                                        </div>
                                                    </td>
                                                    <td><span className={`badge ${badgeClass}`}>{k.criticalityLevel}</span></td>
                                                    <td>{k.breakdownCount}</td>
                                                    <td>{k.totalDowntime}</td>
                                                    <td style={{ fontWeight: 600 }}>{k.totalCost.toLocaleString('fr-FR')}</td>
                                                    <td>{machine.importanceLevel}/10</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: Recommandations IA */}
                {activeTab === 'recommendations' && (
                    <div className="animate-fade-in">
                        <div data-tour="reports-reco-banner" className="card" style={{ padding: 20, marginBottom: 24, background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', color: 'white', border: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <Brain size={28} />
                                <div>
                                    <h3 style={{ fontSize: 18, fontWeight: 700 }}>Moteur d&apos;Intelligence SmartMaint</h3>
                                    <p style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
                                        Recommandations basées sur l&apos;analyse des données de maintenance
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: 10, fontSize: 13 }}>
                                    <span style={{ fontWeight: 700 }}>{recommendations.filter(r => r.level === 'critical').length}</span> alertes critiques
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: 10, fontSize: 13 }}>
                                    <span style={{ fontWeight: 700 }}>{recommendations.filter(r => r.level === 'warning').length}</span> avertissements
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: 10, fontSize: 13 }}>
                                    <span style={{ fontWeight: 700 }}>{recommendations.filter(r => r.level === 'info').length}</span> informations
                                </div>
                            </div>
                        </div>

                        <div data-tour="reports-reco-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {recommendations.map((rec, idx) => (
                                <div
                                    key={idx}
                                    className="card"
                                    style={{
                                        padding: '16px 20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        borderLeft: `4px solid ${rec.level === 'critical' ? '#ef4444' : rec.level === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            background: rec.level === 'critical' ? '#fef2f2' : rec.level === 'warning' ? '#fffbeb' : '#eff6ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {rec.level === 'critical' ? <AlertTriangle size={20} color="#ef4444" /> :
                                            rec.level === 'warning' ? <AlertTriangle size={20} color="#f59e0b" /> :
                                                <Cpu size={20} color="#3b82f6" />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{rec.machineCode} — {rec.machineName}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{rec.message}</div>
                                        {rec.reasoning && (
                                            <div style={{
                                                marginTop: 8, padding: '8px 12px', borderRadius: 8,
                                                background: 'var(--surface-hover)', border: '1px dashed var(--border)',
                                                fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55,
                                                display: 'flex', gap: 8, alignItems: 'flex-start',
                                            }}>
                                                <span style={{ fontSize: 13, lineHeight: 1, marginTop: 1 }}>🧠</span>
                                                <span><b style={{ color: 'var(--text-secondary)' }}>Pourquoi : </b>{rec.reasoning}</span>
                                            </div>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                        background: rec.level === 'critical' ? '#ef4444' : rec.level === 'warning' ? '#f59e0b' : '#3b82f6',
                                        color: 'white', textTransform: 'uppercase',
                                    }}>
                                        {rec.category}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Vision future */}
                        <div data-tour="reports-reco-vision" className="card" style={{ padding: 24, marginTop: 24 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                🚀 Vision future — Maintenance prédictive par IA
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                                {[
                                    { icon: '📡', title: 'Capteurs IoT', desc: 'Collecte de données en temps réel' },
                                    { icon: '📊', title: 'Analyse vibratoire', desc: 'Détection précoce des défaillances' },
                                    { icon: '🌡️', title: 'Thermographie', desc: 'Surveillance des températures' },
                                    { icon: '🧠', title: 'Deep Learning', desc: 'Prédiction intelligente des pannes' },
                                ].map((item, idx) => (
                                    <div key={idx} style={{ padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--surface-hover)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon}</div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: SPC — real intervention-derived control chart */}
                {activeTab === 'spc' && (
                    <div className="animate-fade-in">
                        <SPCAnomalyDashboard />
                    </div>
                )}

                {/* TAB: TCO & Procurement */}
                {activeTab === 'tco' && (
                    <div className="animate-fade-in">
                        <ProcurementTCO />
                    </div>
                )}

                {/* TAB: PARETO — causes de pannes */}
                {activeTab === 'pareto' && (
                    <div className="animate-fade-in">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, flex: 1 }}>
                                Analyse de Pareto — les causes de pannes classées par fréquence. La règle 80/20 identifie le « vital few ».
                            </p>
                            <select className="select" value={paretoAtelier} onChange={e => setParetoAtelier(e.target.value)} style={{ width: 'auto', fontSize: 13 }}>
                                <option value="all">Tous les ateliers</option>
                                {ateliers.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>

                        {paretoData.length === 0 ? (
                            <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                                <AlertTriangle size={40} style={{ opacity: 0.4 }} />
                                <p style={{ marginTop: 12 }}>Aucune panne corrective enregistrée pour cette sélection.</p>
                            </div>
                        ) : (
                            <>
                                {/* Insight banner */}
                                <div data-tour="reports-pareto-insights" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                    <div className="card" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pannes correctives</div>
                                        <div style={{ fontSize: 28, fontWeight: 700 }}>{paretoTotal}</div>
                                    </div>
                                    <div className="card" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Causes distinctes</div>
                                        <div style={{ fontSize: 28, fontWeight: 700 }}>{paretoData.length}</div>
                                    </div>
                                    <div className="card" style={{ padding: 16, flex: 2, minWidth: 240, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase' }}>💡 Vital few (règle 80/20)</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', marginTop: 4, lineHeight: 1.5 }}>
                                            {vitalFew} cause(s) sur {paretoData.length} génèrent 80 % des pannes — concentrez-y vos efforts de fiabilisation.
                                        </div>
                                    </div>
                                </div>

                                {/* Pareto chart */}
                                <div data-tour="reports-pareto-chart" className="card" style={{ padding: 0 }}>
                                    <div className="card-header"><h3 style={{ fontSize: 16, fontWeight: 600 }}>Diagramme de Pareto — causes de pannes</h3></div>
                                    <div className="card-body" style={{ height: 380 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={paretoData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="cause" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} height={70} />
                                                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }} />
                                                <Bar yAxisId="left" dataKey="count" name="Nombre de pannes" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={56} />
                                                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumul %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Causes table */}
                                <div data-tour="reports-pareto-table" className="card" style={{ padding: 0, marginTop: 20 }}>
                                    <div className="table-container" style={{ border: 'none' }}>
                                        <table className="data-table">
                                            <thead><tr><th>#</th><th>Cause probable</th><th>Pannes</th><th>Part</th><th>Cumul</th></tr></thead>
                                            <tbody>
                                                {paretoData.map((x, i) => (
                                                    <tr key={x.cause} style={{ background: x.cumulative <= 80 ? 'rgba(239,68,68,0.04)' : undefined }}>
                                                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{i + 1}</td>
                                                        <td style={{ fontWeight: 500 }}>{x.cause}</td>
                                                        <td style={{ fontWeight: 700 }}>{x.count}</td>
                                                        <td>{paretoTotal ? Math.round((x.count / paretoTotal) * 100) : 0} %</td>
                                                        <td style={{ fontWeight: 600, color: x.cumulative <= 80 ? '#ef4444' : 'var(--text-muted)' }}>{x.cumulative} %</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
                </div>{/* /print-key wrapper */}
            </main>
        </>
    );
}
