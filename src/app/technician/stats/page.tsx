'use client';

// ============================================================
// T2 — Mes stats personnelles
// Personal performance snapshot for the signed-in technician.
// Reads from existing interventions (no new DB table).
// ============================================================

import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useMemo } from 'react';
import { Wrench, Clock, TrendingDown, Award, Activity } from 'lucide-react';

export default function TechnicianStats() {
    const { user } = useAuth();
    const { interventions, machines, technicians } = useData();

    // Match the signed-in user against the technicians table by name (case-insensitive).
    // Falls back to the legacy 'tech-001' default if no match.
    const myTechId = useMemo(() => {
        const me = technicians.find(t =>
            t.fullName.toLowerCase() === (user?.name ?? '').toLowerCase());
        return me?.id ?? 'tech-001';
    }, [technicians, user]);

    const mine = useMemo(
        () => interventions.filter(i => i.technicianId === myTechId),
        [interventions, myTechId]);

    // ── Month window ──
    const monthStart = useMemo(() => {
        const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
    }, []);
    const thisMonth = mine.filter(i => new Date(i.createdAt) >= monthStart);
    const closedThisMonth = thisMonth.filter(i => i.status === 'terminée' || i.status === 'clôturée');

    // ── Averages ──
    const totalDowntimeHours = mine.reduce((s, i) => s + (i.downtimeHours || 0), 0);
    const closedAll = mine.filter(i => i.status === 'terminée' || i.status === 'clôturée');
    const avgMTTR = closedAll.length
        ? closedAll.reduce((s, i) => s + (i.downtimeHours || 0), 0) / closedAll.length
        : 0;

    // ── Top 3 machines ──
    const machineCounts = new Map<string, number>();
    mine.forEach(i => machineCounts.set(i.machineId, (machineCounts.get(i.machineId) ?? 0) + 1));
    const topMachines = [...machineCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ machine: machines.find(m => m.id === id), count }));

    // ── Type split ──
    const corrective = mine.filter(i => i.interventionType === 'corrective').length;
    const preventive = mine.filter(i => i.interventionType === 'préventive').length;

    // ── Total cost saved (proxy: total downtime cost on machines worked on) ──
    const totalCostHandled = mine.reduce((s, i) => s + (i.totalCost || 0), 0);

    return (
        <>
            <Header title="Mes statistiques" subtitle={`Performance personnelle — ${user?.name ?? ''}`} />
            <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }} className="animate-fade-in">

                {/* ── KPI cards ── */}
                <div data-tour="stats-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                    <KpiCard icon={Wrench} color="#f97316" label="Interventions ce mois" value={String(thisMonth.length)} sub={`${closedThisMonth.length} clôturées`} />
                    <KpiCard icon={Clock} color="#3b82f6" label="MTTR moyen" value={`${avgMTTR.toFixed(1)} h`} sub="Temps moyen de réparation" />
                    <KpiCard icon={TrendingDown} color="#22c55e" label="Heures d'arrêt traitées" value={`${totalDowntimeHours.toFixed(1)} h`} sub="Total carrière" />
                    <KpiCard icon={Activity} color="#8b5cf6" label="Coût total géré" value={`${totalCostHandled.toLocaleString()} MAD`} sub={`${mine.length} intervention${mine.length > 1 ? 's' : ''}`} />
                </div>

                {/* ── Type split ── */}
                <div className="card" style={{ padding: 24, marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={18} color="#f97316" /> Répartition par type
                    </h3>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <TypePill label="Correctif" value={corrective} color="#ef4444" total={mine.length} />
                        <TypePill label="Préventif" value={preventive} color="#22c55e" total={mine.length} />
                        <TypePill label="Autre" value={mine.length - corrective - preventive} color="#94a3b8" total={mine.length} />
                    </div>
                </div>

                {/* ── Top 3 machines ── */}
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Award size={18} color="#f97316" /> Top 3 machines sur lesquelles je travaille
                    </h3>
                    {topMachines.length === 0 ? (
                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Aucune intervention enregistrée pour le moment.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {topMachines.map(({ machine, count }, idx) => (
                                <div key={machine?.id ?? idx} style={{
                                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                                    border: '1px solid var(--border)', borderRadius: 12,
                                    background: 'var(--surface)',
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: ['#fef3c7', '#fed7aa', '#fecaca'][idx],
                                        color: ['#d97706', '#ea580c', '#dc2626'][idx],
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 15,
                                    }}>#{idx + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{machine?.code ?? '—'}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{machine?.name ?? ''}</div>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                        {count} intervention{count > 1 ? 's' : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}

function KpiCard({ icon: Icon, color, label, value, sub }: {
    icon: React.ElementType; color: string; label: string; value: string; sub: string;
}) {
    return (
        <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: color + '20', color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon size={18} /></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
        </div>
    );
}

function TypePill({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return (
        <div className="kpi-card" style={{ flex: '1 1 200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span className="section-eyebrow" style={{ color }}>{label}</span>
            </div>
            <div style={{ letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{pct}% du total</div>
        </div>
    );
}
