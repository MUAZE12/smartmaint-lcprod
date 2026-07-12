'use client';

import Header from '@/components/Header';
import { getInterventionsByMachine, technicians } from '@/lib/data';
import { useData } from '@/context/DataContext';
import {
    getMachineKPI,
    calculateTRS,
    getRecommendations,
    getCriticalityLevel,
} from '@/lib/calculations';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    ArrowLeft, Cpu, MapPin, Calendar, DollarSign,
    TrendingUp, Activity, Gauge, AlertTriangle,
    Wrench, Clock, Shield, CalendarClock, Printer,
} from 'lucide-react';
import Link from 'next/link';

const statusConfig: Record<string, { label: string; class: string }> = {
    'opérationnelle': { label: 'Opérationnelle', class: 'badge-operational' },
    'en panne': { label: 'En panne', class: 'badge-broken' },
    'en maintenance': { label: 'En maintenance', class: 'badge-maintenance' },
    'arrêtée': { label: 'Arrêtée', class: 'badge-stopped' },
};

const interventionStatusConfig: Record<string, { label: string; class: string }> = {
    'planifiée': { label: 'Planifiée', class: 'badge-stopped' },
    'en cours': { label: 'En cours', class: 'badge-maintenance' },
    'terminée': { label: 'Terminée', class: 'badge-operational' },
    'clôturée': { label: 'Clôturée', class: 'badge-operational' },
    'annulée': { label: 'Annulée', class: 'badge-broken' },
};

const typeConfig: Record<string, { color: string }> = {
    'corrective': { color: '#ef4444' },
    'préventive': { color: '#22c55e' },
    'conditionnelle': { color: '#f59e0b' },
    'améliorative': { color: '#3b82f6' },
};

export default function MachineDetailPage() {
    // Pull machines from the LIVE Supabase context, not the static fallback
    // dataset — newly-created machines weren't in the static array so the
    // detail page was wrongly redirecting to "Machine introuvable".
    const { machines, maintenancePlans, loading } = useData();
    const params = useParams();
    const machineId = params.id as string;
    const machine = machines.find(m => m.id === machineId);

    // Race guard: the Supabase snapshot can land a few hundred ms after the
    // page mounts. Show a loading state until DataContext signals it's ready
    // — otherwise a fresh refresh would briefly show "Machine introuvable".
    if (loading || (!machine && machines.length === 0)) {
        return (
            <>
                <Header title="Chargement…" />
                <main style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <p>Chargement de la fiche machine…</p>
                </main>
            </>
        );
    }

    if (!machine) {
        return (
            <>
                <Header title="Machine introuvable" />
                <main style={{ padding: '60px 32px', textAlign: 'center' }}>
                    <p>Cette machine n&apos;existe pas.</p>
                    <Link href="/machines" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                        Retour aux machines
                    </Link>
                </main>
            </>
        );
    }

    const kpi = getMachineKPI(machineId);
    const trs = calculateTRS(machineId);
    const machineInterventions = getInterventionsByMachine(machineId);
    const recommendations = getRecommendations().filter(r => r.machineId === machineId);
    // Fallback for unknown statuses — a machine status set by manual SQL
    // or a future enum value used to crash the page when it didn't match
    // the four known keys ("opérationnelle" / "en panne" / "en maintenance"
    // / "arrêtée"). Now we degrade gracefully to "Inconnu".
    const status = statusConfig[machine.status] ?? { label: machine.status || 'Inconnu', class: 'badge-stopped' };
    const critLevel = getCriticalityLevel(kpi.criticalityScore);

    // Preventive plans for this machine — the forward-looking "carnet de santé"
    const machinePlans = maintenancePlans.filter(p => p.machineId === machineId);
    const planState = (nextDue: string | null) => {
        if (!nextDue) return { label: 'À planifier', color: '#64748b', bg: '#f1f5f9' };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(nextDue).getTime() - today.getTime()) / 86400000);
        if (diff < 0) return { label: `En retard de ${-diff} j`, color: '#ef4444', bg: '#fef2f2' };
        if (diff <= 7) return { label: `Dans ${diff} j`, color: '#f59e0b', bg: '#fffbeb' };
        return { label: `Dans ${diff} j`, color: '#22c55e', bg: '#f0fdf4' };
    };

    const kpiItems = [
        { label: 'MTBF', value: `${kpi.mtbf} h`, icon: TrendingUp, color: '#22c55e' },
        { label: 'MTTR', value: `${kpi.mttr} h`, icon: Activity, color: '#f59e0b' },
        { label: 'Disponibilité', value: `${kpi.availability}%`, icon: Gauge, color: '#3b82f6' },
        { label: 'TRS', value: `${trs.trs}%`, icon: Gauge, color: '#8b5cf6' },
        { label: 'Coût total', value: `${kpi.totalCost.toLocaleString('fr-FR')} MAD`, icon: DollarSign, color: '#8b5cf6' },
        { label: 'Pannes', value: `${kpi.breakdownCount}`, icon: AlertTriangle, color: '#ef4444' },
        { label: 'Arrêt total', value: `${kpi.totalDowntime} h`, icon: Clock, color: '#ef4444' },
        { label: 'Score criticité', value: `${kpi.criticalityScore}`, icon: Shield, color: critLevel === 'élevé' ? '#ef4444' : critLevel === 'moyen' ? '#f59e0b' : '#22c55e' },
    ];

    return (
        <>
            <Header title={`${machine.code} — ${machine.name}`} subtitle={machine.workshop} />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                {/* Print-only document header */}
                <div className="print-only" style={{ marginBottom: 16, borderBottom: '2px solid #1e293b', paddingBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>SmartMaint — L.C PROD · Fiche machine {machine.code}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Carnet de santé · {machine.name} · Édité le {new Date().toLocaleDateString('fr-FR')}
                    </div>
                </div>

                {/* Back link + print */}
                <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <Link
                        href="/machines"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
                    >
                        <ArrowLeft size={16} /> Retour aux machines
                    </Link>
                    <button onClick={() => window.print()} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10,
                        background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', color: 'var(--text-secondary)',
                    }}>
                        <Printer size={16} /> Imprimer la fiche / PDF
                    </button>
                </div>

                {/* Top row: Info + QR Code */}
                <div className="machine-top-row" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, marginBottom: 24 }}>
                    {/* Machine info */}
                    <div data-tour="md-info" className="card machine-info-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                            <div
                                style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 14,
                                    background: 'var(--primary-lighter)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Cpu size={28} color="var(--primary)" />
                            </div>
                            <div>
                                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{machine.name}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <span className={`badge ${status.class}`}>{status.label}</span>
                                    <span className={`badge badge-${critLevel === 'élevé' ? 'critical' : critLevel === 'moyen' ? 'medium' : 'low'}`}>
                                        Criticité : {critLevel}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="machine-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', fontSize: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Code :</span>
                                <span style={{ fontWeight: 600 }}>{machine.code}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Type :</span>
                                <span style={{ fontWeight: 600 }}>{machine.type}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <MapPin size={14} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Zone :</span>
                                <span style={{ fontWeight: 500 }}>{machine.workshop || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Ligne :</span>
                                <span style={{ fontWeight: 500 }}>{machine.line || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Fonction :</span>
                                <span style={{ fontWeight: 500 }}>{machine.function || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <MapPin size={14} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Emplacement :</span>
                                <span style={{ fontWeight: 500 }}>{machine.location}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Calendar size={14} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Installation :</span>
                                <span style={{ fontWeight: 500 }}>
                                    {format(new Date(machine.installationDate), 'dd MMM yyyy', { locale: fr })}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <DollarSign size={14} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Coût arrêt/heure :</span>
                                <span style={{ fontWeight: 600 }}>{machine.hourlyDowntimeCost} MAD</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Importance :</span>
                                <span style={{ fontWeight: 600 }}>{machine.importanceLevel}/10</span>
                            </div>
                        </div>
                    </div>

                    {/* QR Code — two copies, one on-screen (theme-aware), one
                        print-only with hardcoded black-on-white so it always
                        renders cleanly on paper (CSS variables can drop out
                        of SVG attribute values during print rendering). */}
                    <div data-tour="md-qr" className="card machine-qr-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="no-print">
                            <QRCodeSVG
                                value={`SMARTMAINT-LCPROD|${machine.code}|${machine.name}|${machine.workshop}`}
                                size={160}
                                bgColor="transparent"
                                fgColor="var(--text-primary)"
                                level="M"
                            />
                        </div>
                        <div className="print-only" style={{ background: '#fff', padding: 6 }}>
                            <QRCodeSVG
                                value={`SMARTMAINT-LCPROD|${machine.code}|${machine.name}|${machine.workshop}`}
                                size={140}
                                bgColor="#ffffff"
                                fgColor="#000000"
                                level="M"
                            />
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, fontWeight: 600 }}>
                            {machine.code}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Scanner pour identifier
                        </p>
                    </div>
                </div>

                {/* KPI Grid */}
                <div data-tour="md-kpis" className="kpi-grid" style={{ marginBottom: 24 }}>
                    {kpiItems.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                            <div key={idx} className="kpi-card blue" style={{ animationDelay: `${idx * 40}ms` }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {item.label}
                                    </span>
                                    <Icon size={18} color={item.color} />
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 700 }}>{item.value}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Recommendations */}
                {recommendations.length > 0 && (
                    <div data-tour="md-reco" className="card" style={{ marginBottom: 24, padding: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={18} color="var(--accent-orange)" />
                            Recommandations intelligentes
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recommendations.map((rec, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: 'var(--radius-md)',
                                        background: rec.level === 'critical' ? 'var(--accent-red-light)' :
                                            rec.level === 'warning' ? 'var(--accent-orange-light)' : '#f0fdf4',
                                        border: `1px solid ${rec.level === 'critical' ? '#fca5a5' :
                                            rec.level === 'warning' ? '#fcd34d' : '#bbf7d0'}`,
                                        fontSize: 13,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                    }}
                                >
                                    <span style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        background: rec.level === 'critical' ? '#ef4444' :
                                            rec.level === 'warning' ? '#f59e0b' : '#22c55e',
                                        color: 'white',
                                        textTransform: 'uppercase',
                                    }}>
                                        {rec.category}
                                    </span>
                                    {rec.message}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Plans de maintenance préventive (carnet de santé — à venir) */}
                <div data-tour="md-plans" className="card" style={{ marginBottom: 24, padding: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarClock size={18} color="var(--text-secondary)" />
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Maintenance préventive planifiée ({machinePlans.length})</h3>
                        <Link href="/maintenance-plans" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>Gérer les plans →</Link>
                    </div>
                    {machinePlans.length === 0 ? (
                        <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            Aucun plan préventif pour cette machine.
                        </div>
                    ) : (
                        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {machinePlans.map(p => {
                                const st = planState(p.active ? p.nextDueDate : null);
                                return (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-hover)' }}>
                                        <CalendarClock size={16} color={st.color} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tous les {p.frequencyDays} j · prochaine : {p.nextDueDate || '—'}</div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: st.bg, color: st.color }}>{p.active ? st.label : 'Inactif'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Historique des interventions */}
                <div data-tour="md-history" className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wrench size={18} color="var(--text-secondary)" />
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Historique des interventions ({machineInterventions.length})</h3>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Technicien</th>
                                    <th>Durée</th>
                                    <th>Coût</th>
                                    <th>Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {machineInterventions.map((int) => {
                                    const tech = technicians.find(t => t.id === int.technicianId);
                                    // Fallback like statusConfig — an intervention status from a
                                    // future enum value used to crash the whole page when it didn't
                                    // match a known key (the 5 "machines impossible à ouvrir" all had
                                    // at least one 'clôturée' intervention which was missing here).
                                    const intStatus = interventionStatusConfig[int.status] ?? { label: int.status || '—', class: 'badge-stopped' };
                                    const typeColor = typeConfig[int.interventionType]?.color || '#64748b';
                                    return (
                                        <tr key={int.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {format(new Date(int.startDate), 'dd/MM/yyyy', { locale: fr })}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    padding: '3px 10px',
                                                    borderRadius: 100,
                                                    background: `${typeColor}15`,
                                                    color: typeColor,
                                                }}>
                                                    {int.interventionType}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {int.description}
                                            </td>
                                            <td>{tech?.fullName || '—'}</td>
                                            <td>{int.downtimeHours}h</td>
                                            <td style={{ fontWeight: 600 }}>{int.totalCost.toLocaleString('fr-FR')} MAD</td>
                                            <td><span className={`badge ${intStatus.class}`}>{intStatus.label}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </>
    );
}
