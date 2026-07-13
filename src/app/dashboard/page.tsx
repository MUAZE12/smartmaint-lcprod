'use client';

import Header from '@/components/Header';
import {
    getGlobalKPI,
    getMonthlyBreakdowns,
    getInterventionsByType,
    getCostByMachine,
    getTop5CriticalMachines,
    getAvailabilityData,
    getCriticalityLevel,
} from '@/lib/calculations';
import { interventions, machines as allMachines } from '@/lib/data';
import { useData } from '@/context/DataContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    AreaChart, Area,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import {
    Cpu, CheckCircle, AlertTriangle, Wrench, Clock, TrendingUp, DollarSign,
    Activity, Gauge, AlertOctagon, FileText, BadgeCheck, CalendarClock, Package, ChevronRight, Filter,
    Maximize2, X, Download,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcut } from '@/lib/shortcuts';
import ConsumablesTracker from '@/components/industry40/ConsumablesTracker';
import ShiftHandoverBoard from '@/components/industry40/ShiftHandoverBoard';

// Muted enterprise KPI accents — icon color pops on soft neutral bg
// so numbers stay dominant (industrial dashboard convention).
const kpiColors = {
    blue:   { bg: '#eef2fb', icon: '#0b3a86' },
    green:  { bg: '#ecf7f0', icon: '#0e7c3f' },
    red:    { bg: '#fbecec', icon: '#b91c1c' },
    orange: { bg: '#fbf1e3', icon: '#b45309' },
    purple: { bg: '#f0edfa', icon: '#5b21b6' },
};

export default function DashboardPage() {
    // Subscribe to every table the dashboard reads from, so the page
    // re-renders the instant data lands (not just on purchaseOrders /
    // maintenancePlans / spareParts changes — that was the lag bug).
    const {
        purchaseOrders, maintenancePlans, spareParts,
        machines: liveMachines, interventions: liveInterventions,
        loading,
    } = useData();

    // While Supabase is still fetching the initial snapshot, render a
    // skeleton screen instead of empty charts. Otherwise the user sees
    // the charts "pop in" once data arrives — that's what reads as lag.
    //
    // Two-stage gate: liveMachines populates first (state update);
    // syncStaticArrays() inside DataContext only runs in the next useEffect,
    // and the calculation helpers below read from those static arrays. We
    // therefore defer the chart render by one extra tick after dataReady
    // flips true — by then DataProvider's child effects have committed
    // and lib/data.{machines,interventions,...} match the live snapshot.
    // ── ALL hooks must be called before any early return (rules of hooks).
    //    Put useState/useEffect/useRouter up here, then gate the JSX below.
    const dataReady = !loading && liveMachines.length > 0;
    const [chartsReady, setChartsReady] = useState(false);
    useEffect(() => {
        if (!dataReady) { setChartsReady(false); return; }
        // Parent (DataProvider) useEffects run before this one — by the time
        // this fires, the static arrays are already populated. setState here
        // forces one more render, which now sees the populated arrays.
        setChartsReady(true);
    }, [dataReady]);
    const router = useRouter();
    // Keyboard shortcuts registered for the lifetime of this page.
    // Press `?` anywhere to see the cheatsheet.
    useShortcut('n', useCallback(() => router.push('/interventions'), [router]),
        { description: 'Nouvelle intervention', scope: 'admin' });
    useShortcut('m', useCallback(() => router.push('/machines'), [router]),
        { description: 'Voir les machines', scope: 'admin' });
    useShortcut('p', useCallback(() => router.push('/spare-parts'), [router]),
        { description: 'Voir les pieces de rechange', scope: 'admin' });
    useShortcut('h', useCallback(() => router.push('/haccp'), [router]),
        { description: 'HACCP', scope: 'admin' });
    useShortcut('a', useCallback(() => router.push('/audit'), [router]),
        { description: `Journal d'audit`, scope: 'admin' });
    const [atelier, setAtelier] = useState('all');
    const [monthsBack, setMonthsBack] = useState<6 | 12>(6);
    // Power-BI-style click-to-zoom: holds the id of the currently zoomed
    // chart, or null. Modal at the bottom renders the matching chart full
    // size when set.
    const [zoom, setZoom] = useState<string | null>(null);
    useEffect(() => {
        if (!zoom) return;
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [zoom]);

    // Early return is now after every hook call — React's hook order stays
    // consistent across the skeleton render and the populated render.
    if (!chartsReady) return <DashboardSkeleton />;

    const kpi = getGlobalKPI();
    const monthlyBreakdownsAll = getMonthlyBreakdowns(monthsBack);
    const interventionsByTypeAll = getInterventionsByType();
    const costByMachine = getCostByMachine();
    const top5Critical = getTop5CriticalMachines();
    const availabilityData = getAvailabilityData();
    // Keep these in scope so liveX is "used" — they update the static arrays
    // via DataContext's syncStaticArrays effect on every realtime tick.
    void liveMachines; void liveInterventions;
    const ateliers = [...new Set(allMachines.map(m => m.workshop).filter(Boolean))];
    const wsOf = (code: string) => allMachines.find(m => m.code === code)?.workshop;
    // The atelier filter now applies to ALL 6 per-machine charts, not just 3.
    // Per-machine charts: filter their rows by workshop directly.
    const fCost = atelier === 'all' ? costByMachine : costByMachine.filter(c => wsOf(c.machine) === atelier);
    const fAvail = atelier === 'all' ? availabilityData : availabilityData.filter(c => wsOf(c.machine) === atelier);
    const fTop5 = atelier === 'all' ? top5Critical : top5Critical.filter(k => wsOf(k.machineCode) === atelier);
    // Aggregate charts: recompute from interventions restricted to atelier machines.
    const atelierMachineIds = atelier === 'all'
        ? null
        : new Set(allMachines.filter(m => m.workshop === atelier).map(m => m.id));
    const filteredInterventions = atelierMachineIds
        ? interventions.filter(i => atelierMachineIds.has(i.machineId))
        : interventions;
    // Pannes par mois — recompute from filtered corrective interventions.
    // Uses the rolling-window rows (year + monthIndex carried per row)
    // so the chart tracks the live calendar — current month is always
    // the rightmost bar.
    const monthlyBreakdowns = atelier === 'all'
        ? monthlyBreakdownsAll
        : monthlyBreakdownsAll.map(row => ({
            ...row,
            pannes: filteredInterventions.filter(i => {
                if (i.interventionType !== 'corrective') return false;
                const d = new Date(i.startDate);
                return d.getFullYear() === row.year && d.getMonth() === row.monthIndex;
            }).length,
        }));
    // Interventions par type — recompute counts from filtered list.
    // row.type is the LABEL ("Corrective", "Préventive", …) while
    // i.interventionType is the KEY ("corrective", "préventive"). Compare
    // case-insensitively so the filter actually produces non-zero counts.
    const interventionsByType = atelier === 'all'
        ? interventionsByTypeAll
        : interventionsByTypeAll.map(row => ({
            ...row,
            count: filteredInterventions.filter(i => i.interventionType.toLowerCase() === row.type.toLowerCase()).length,
        }));

    const correctiveCount = filteredInterventions.filter(i => i.interventionType === 'corrective').length;
    const preventiveCount = filteredInterventions.filter(i => i.interventionType !== 'corrective').length;
    const pieData = [
        { name: 'Corrective', value: correctiveCount, color: '#ef4444' },
        { name: 'Préventive', value: preventiveCount, color: '#22c55e' },
    ];

    // ── Centre d'action — what the admin needs to handle now ──
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    const actionItems = [
        { label: 'Bons de commande à approuver', count: purchaseOrders.filter(p => p.approvalStatus === 'en attente').length, href: '/approvals', icon: FileText, color: '#8b5cf6' },
        { label: 'Interventions à valider', count: interventions.filter(i => i.status === 'terminée').length, href: '/approvals', icon: BadgeCheck, color: '#3b82f6' },
        { label: 'Plans préventifs en retard', count: maintenancePlans.filter(p => p.active && p.nextDueDate && new Date(p.nextDueDate) < todayMid).length, href: '/maintenance-plans', icon: CalendarClock, color: '#f59e0b' },
        { label: 'Pièces en stock critique', count: spareParts.filter(p => p.quantity <= p.minimumStock).length, href: '/spare-parts', icon: Package, color: '#ef4444' },
        // Deep-link directly to the filtered Machines page — the tile label
        // promised "Machines en panne" so we should land on that list, not
        // the full control-room wall.
        { label: 'Machines en panne', count: kpi.brokenMachines, href: '/machines?status=en panne', icon: AlertTriangle, color: '#ef4444' },
    ];
    const totalActions = actionItems.reduce((s, a) => s + a.count, 0);

    const kpiCards = [
        { label: 'Machines totales', value: kpi.totalMachines, icon: Cpu, color: 'blue' as const, suffix: '', href: '/machines' },
        { label: 'Opérationnelles', value: kpi.operationalMachines, icon: CheckCircle, color: 'green' as const, suffix: '', href: '/machines?status=opérationnelle' },
        { label: 'En panne', value: kpi.brokenMachines, icon: AlertTriangle, color: 'red' as const, suffix: '', href: '/machines?status=en panne' },
        { label: 'Interventions', value: kpi.totalInterventions, icon: Wrench, color: 'blue' as const, suffix: '', href: '/interventions' },
        { label: 'En cours', value: kpi.ongoingInterventions, icon: Clock, color: 'orange' as const, suffix: '', href: '/interventions?tab=inprogress' },
        { label: 'MTBF moyen', value: kpi.avgMTBF, icon: TrendingUp, color: 'green' as const, suffix: ' h', href: '/reports?tab=fmd' },
        { label: 'MTTR moyen', value: kpi.avgMTTR, icon: Activity, color: 'orange' as const, suffix: ' h', href: '/reports?tab=fmd' },
        { label: 'Disponibilité', value: kpi.avgAvailability, icon: Gauge, color: 'green' as const, suffix: '%', href: '/reports?tab=fmd' },
        { label: 'Coût total', value: kpi.totalMaintenanceCost.toLocaleString('fr-FR'), icon: DollarSign, color: 'purple' as const, suffix: ' MAD', href: '/reports?tab=economic' },
        { label: 'Machines critiques', value: kpi.criticalMachines, icon: AlertOctagon, color: 'red' as const, suffix: '', href: '/reports?tab=criticality' },
        { label: 'TRS moyen', value: kpi.avgTRS, icon: Gauge, color: 'blue' as const, suffix: '%', href: '/oee' },
    ];

    return (
        <>
            <Header title="Dashboard" subtitle="Vue d'ensemble de la maintenance" />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                {/* Toolbar — restrained enterprise header. Full date on the
                    left, a single clear PDF export button on the right. */}
                <div data-tour="admin-toolbar" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 16, marginBottom: 24,
                    padding: '14px 20px', borderRadius: 12,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 2px rgba(11, 18, 32, 0.03)',
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Vue d&apos;ensemble
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 650, marginTop: 2, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>
                            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                    <button
                        data-tour="admin-report-export"
                        onClick={async () => {
                            const { generateDashboardReport } = await import('@/lib/dashboardReport');
                            await generateDashboardReport({
                                generatedAt: new Date(),
                                generatedBy: 'Admin maintenance',
                                kpi, monthlyBreakdowns, interventionsByType,
                                costByMachine: fCost, top5: fTop5, availability: fAvail,
                                actionItems,
                            });
                        }}
                        className="btn btn-primary btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        <Download size={14} /> Générer le rapport PDF
                    </button>
                </div>

                {/* Centre d'action — restrained. Active tiles get a soft
                    left accent bar instead of tinted background. */}
                <div data-tour="admin-actions" style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        À traiter
                        {totalActions === 0
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: '#0e7c3f', background: '#ecf7f0', padding: '2px 8px', borderRadius: 100, letterSpacing: '0' }}>Tout est à jour</span>
                            : <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: '#fbecec', padding: '2px 8px', borderRadius: 100, letterSpacing: '0' }}>{totalActions} en attente</span>}
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                        {actionItems.map(item => {
                            const Icon = item.icon;
                            const active = item.count > 0;
                            return (
                                <Link key={item.label} href={item.href} style={{
                                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 10,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    position: 'relative',
                                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                                    overflow: 'hidden',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd3e1'; e.currentTarget.style.boxShadow = '0 4px 14px -8px rgba(11,18,32,0.12)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    {/* left accent bar — only when there is work to do */}
                                    {active && (
                                        <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, background: item.color, borderRadius: '0 3px 3px 0' }} />
                                    )}
                                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: active ? `${item.color}18` : 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={17} color={active ? item.color : 'var(--text-muted)'} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: active ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1, letterSpacing: '-0.02em' }}>{item.count}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.3 }}>{item.label}</div>
                                    </div>
                                    <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* KPI Grid */}
                <div data-tour="admin-kpis" className="kpi-grid" style={{ marginBottom: 28 }}>
                    {kpiCards.map((card, idx) => {
                        const Icon = card.icon;
                        const colors = kpiColors[card.color];
                        return (
                            <Link
                                key={idx}
                                href={card.href}
                                className={`kpi-card ${card.color}`}
                                style={{ animationDelay: `${idx * 40}ms`, textDecoration: 'none', color: 'inherit', display: 'block', cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {card.label}
                                    </span>
                                    <div
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 7,
                                            background: colors.bg,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Icon size={15} color={colors.icon} />
                                    </div>
                                </div>
                                <div>
                                    {card.value}<span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 3, fontWeight: 500 }}>{card.suffix}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Per-machine chart filter + range toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Filter size={15} color="var(--text-muted)" />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Atelier :</span>
                        <select data-tour="admin-atelier" value={atelier} onChange={e => setAtelier(e.target.value)}
                            style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                            <option value="all">Tous les ateliers</option>
                            {ateliers.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: 2 }}
                        title="Choisir la plage temporelle des graphiques par mois">
                        {([6, 12] as const).map(m => (
                            <button key={m} onClick={() => setMonthsBack(m)}
                                style={{
                                    padding: '6px 12px', borderRadius: 7, border: 'none',
                                    background: monthsBack === m ? 'var(--primary)' : 'transparent',
                                    color: monthsBack === m ? 'white' : 'var(--text-secondary)',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                }}>
                                {m} mois
                            </button>
                        ))}
                    </div>
                </div>

                {/* Charts Grid — every card is click-to-zoom (Power BI style) */}
                <div data-tour="admin-charts" className="chart-grid">
                    {/* Pannes par mois */}
                    <ZoomableCard id="pannes-mois" title="Pannes par mois" zoom={zoom} setZoom={setZoom}>
                        {renderPannesParMois(monthlyBreakdowns)}
                    </ZoomableCard>

                    {/* Interventions par type */}
                    <ZoomableCard id="intv-type" title="Interventions par type" zoom={zoom} setZoom={setZoom}>
                        {renderIntvParType(interventionsByType)}
                    </ZoomableCard>

                    {/* Coût par machine */}
                    <ZoomableCard id="cout-machine" title="Coût maintenance par machine (MAD)" hint="— cliquez une barre pour la fiche machine" zoom={zoom} setZoom={setZoom}>
                        {renderCoutParMachine(fCost, allMachines, router)}
                    </ZoomableCard>

                    {/* Top 5 criticité */}
                    <ZoomableCard id="top5" title="Top 5 — Score de criticité" zoom={zoom} setZoom={setZoom}>
                        {renderTop5(fTop5)}
                    </ZoomableCard>

                    {/* Disponibilité par machine */}
                    <ZoomableCard id="dispo" title="Disponibilité par machine (%)" zoom={zoom} setZoom={setZoom}>
                        {renderDispo(fAvail)}
                    </ZoomableCard>

                    {/* Répartition corrective / préventive */}
                    <ZoomableCard id="corr-prev" title="Corrective vs Préventive" zoom={zoom} setZoom={setZoom}>
                        {renderCorrPrev(pieData)}
                    </ZoomableCard>
                </div>

                {/* Zoom modal — fullscreen overlay re-renders the chart at
                    the viewport size so it behaves like a Power BI focus mode.
                    ResponsiveContainer adapts; tooltips + bar clicks still work. */}
                {zoom && (
                    <div
                        onClick={() => setZoom(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 1000,
                            background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 32, animation: 'fadeIn 0.18s ease',
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: 1400, height: '88vh',
                                background: 'var(--surface)', borderRadius: 18,
                                border: '1px solid var(--border)', overflow: 'hidden',
                                display: 'flex', flexDirection: 'column',
                                boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
                            }}
                        >
                            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{zoomTitleOf(zoom)}</h2>
                                <button data-tour="admin-zoom-close" onClick={() => setZoom(null)} style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--text-secondary)',
                                }}><X size={18} /></button>
                            </div>
                            <div style={{ flex: 1, padding: '20px 22px', minHeight: 0 }}>
                                {zoom === 'pannes-mois' && renderPannesParMois(monthlyBreakdowns)}
                                {zoom === 'intv-type' && renderIntvParType(interventionsByType)}
                                {zoom === 'cout-machine' && renderCoutParMachine(fCost, allMachines, router)}
                                {zoom === 'top5' && renderTop5(fTop5)}
                                {zoom === 'dispo' && renderDispo(fAvail)}
                                {zoom === 'corr-prev' && renderCorrPrev(pieData)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Industry 4.0 Widgets */}
                <div data-tour="admin-widgets" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
                    <div data-tour="admin-consommables"><ConsumablesTracker /></div>
                    <div data-tour="admin-handover"><ShiftHandoverBoard /></div>
                </div>
            </main>
        </>
    );
}

// Greyed placeholders shown until the Supabase snapshot lands. Same shape
// as the real dashboard so the page doesn't shift when content swaps in.
function DashboardSkeleton() {
    const block = (h: number): React.CSSProperties => ({
        background: 'linear-gradient(90deg, var(--surface-hover) 0%, var(--surface) 50%, var(--surface-hover) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.4s ease-in-out infinite',
        borderRadius: 14,
        height: h,
        border: '1px solid var(--border)',
    });
    return (
        <>
            <Header title="Dashboard" subtitle="Chargement des données…" />
            <main style={{ padding: '24px 32px' }}>
                {/* Centre d'action skeleton */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 28 }}>
                    {Array.from({ length: 5 }).map((_, i) => <div key={i} style={block(74)} />)}
                </div>
                {/* KPI grid skeleton */}
                <div className="kpi-grid" style={{ marginBottom: 28 }}>
                    {Array.from({ length: 11 }).map((_, i) => <div key={i} style={block(108)} />)}
                </div>
                {/* Charts skeleton */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div style={block(320)} />
                    <div style={block(320)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={block(280)} />
                    <div style={block(280)} />
                </div>
                <style jsx global>{`
                    @keyframes skeletonShimmer {
                        0%   { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
            </main>
        </>
    );
}

// ============================================================
// Power-BI-style focus mode — every chart card is wrapped in this
// component, which adds a small Maximize button in the top-right and
// makes the whole card clickable. The parent owns the `zoom` state so
// only one modal opens at a time.
// ============================================================
function ZoomableCard({ id, title, hint, zoom, setZoom, children }: {
    id: string;
    title: string;
    hint?: string;
    zoom: string | null;
    setZoom: (id: string | null) => void;
    children: React.ReactNode;
}) {
    void zoom; // referenced only by the parent's modal renderer
    return (
        <div className="card"
            onClick={() => setZoom(id)}
            style={{ cursor: 'zoom-in', position: 'relative', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}
        >
            <div className="card-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
                    {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
                </div>
                <button
                    onClick={e => { e.stopPropagation(); setZoom(id); }}
                    title="Agrandir"
                    style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: 'var(--surface-hover)', border: '1px solid var(--border)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', flexShrink: 0,
                    }}
                ><Maximize2 size={13} /></button>
            </div>
            <div className="card-body" style={{ height: 280 }}>{children}</div>
        </div>
    );
}

function zoomTitleOf(id: string): string {
    switch (id) {
        case 'pannes-mois': return 'Pannes par mois';
        case 'intv-type': return 'Interventions par type';
        case 'cout-machine': return 'Coût maintenance par machine (MAD)';
        case 'top5': return 'Top 5 — Score de criticité';
        case 'dispo': return 'Disponibilité par machine (%)';
        case 'corr-prev': return 'Corrective vs Préventive';
        default: return '';
    }
}

// ── Chart renderers — extracted so they can be rendered twice
//    (once in the small card, once in the zoom modal) without
//    duplicating the JSX. ResponsiveContainer auto-scales to the
//    parent height in both contexts.
function renderPannesParMois(data: { month: string; pannes: number; year: number; monthIndex: number }[]) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }}
                    labelFormatter={(label, payload) => {
                        const yr = payload?.[0]?.payload?.year;
                        return yr ? `${label} ${String(yr).slice(2)}` : label;
                    }}
                />
                <Bar dataKey="pannes" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function renderIntvParType(data: { type: string; count: number; color: string }[]) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="type" type="category" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function renderCoutParMachine(
    data: { machine: string; coût: number }[],
    machinesList: { id: string; code: string }[],
    router: ReturnType<typeof useRouter>,
) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="machine" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString('fr-FR')} MAD`, 'Coût']} />
                <Bar dataKey="coût" fill="#8b5cf6" radius={[6, 6, 0, 0]} cursor="pointer"
                    onClick={(d) => {
                        const code = (d as unknown as { payload?: { machine?: string } })?.payload?.machine;
                        const m = machinesList.find(x => x.code === code);
                        if (m) router.push(`/machines/${m.id}`);
                    }} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function renderTop5(top5: { machineCode: string; criticalityScore: number }[]) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={top5.map(m => ({ machine: m.machineCode, score: m.criticalityScore }))}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="machine" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name="Criticité" dataKey="score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
            </RadarChart>
        </ResponsiveContainer>
    );
}

function renderDispo(data: { machine: string; disponibilité: number }[]) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="machine" tick={{ fontSize: 12 }} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Disponibilité']} />
                <Area type="monotone" dataKey="disponibilité" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

function renderCorrPrev(pieData: { name: string; value: number; color: string }[]) {
    const total = pieData.reduce((s, d) => s + d.value, 0);
    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                {/* Center value — Power BI style donut */}
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
                    fontSize={28} fontWeight={800} fill="var(--text-primary)">{total}</text>
                <text x="50%" y="60%" textAnchor="middle" dominantBaseline="central"
                    fontSize={11} fontWeight={600} fill="var(--text-muted)" letterSpacing="0.04em">OT TOTAL</text>
                <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius="48%" outerRadius="72%"
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={(props: any) => {
                        const cx = Number(props.cx) || 0;
                        const cy = Number(props.cy) || 0;
                        const midAngle = Number(props.midAngle) || 0;
                        const innerRadius = Number(props.innerRadius) || 0;
                        const outerRadius = Number(props.outerRadius) || 0;
                        const percent = Number(props.percent) || 0;
                        if (!percent || percent < 0.05) return null;
                        const RADIAN = Math.PI / 180;
                        const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                        const x = cx + r * Math.cos(-midAngle * RADIAN);
                        const y = cy + r * Math.sin(-midAngle * RADIAN);
                        return (
                            <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontWeight={700} fontSize={13}>
                                {Math.round(percent * 100)}%
                            </text>
                        );
                    }}
                >
                    {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} OT`, String(name)]} />
                <Legend verticalAlign="bottom" iconType="circle" />
            </PieChart>
        </ResponsiveContainer>
    );
}
