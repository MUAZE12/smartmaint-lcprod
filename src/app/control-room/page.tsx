'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import type { Machine } from '@/lib/types';
import { Cpu, CheckCircle, AlertTriangle, Wrench, Power, Radio } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const statusCfg: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    'opérationnelle': { label: 'Opérationnelle', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: CheckCircle },
    'en panne': { label: 'En panne', color: '#ef4444', bg: 'rgba(239,68,68,0.14)', icon: AlertTriangle },
    'en maintenance': { label: 'En maintenance', color: '#f59e0b', bg: 'rgba(245,158,11,0.13)', icon: Wrench },
    'arrêtée': { label: 'Arrêtée', color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: Power },
};

export default function ControlRoomPage() {
    const { machines, interventions } = useData();
    // Click a status chip to filter the wall to just those machines.
    const [filter, setFilter] = useState<string | null>(null);

    const count = (s: string) => machines.filter(m => m.status === s).length;
    const openInts = (machineId: string) =>
        interventions.filter(i => i.machineId === machineId && (i.status === 'en cours' || i.status === 'planifiée')).length;

    // Broken machines first, so the wall draws the eye to problems
    const order: Record<string, number> = { 'en panne': 0, 'en maintenance': 1, 'arrêtée': 2, 'opérationnelle': 3 };
    const visible = filter ? machines.filter(m => m.status === filter) : machines;
    const sorted = [...visible].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

    const summary: { s: string; }[] = [
        { s: 'opérationnelle' }, { s: 'en panne' }, { s: 'en maintenance' }, { s: 'arrêtée' },
    ];

    return (
        <>
            <Header title="Salle de contrôle" subtitle="État de l'atelier en temps réel" />
            <main style={{ padding: '24px 32px' }}>
                {/* Live banner + status summary */}
                <div data-tour="control-summary" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 100, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                        <Radio size={15} color="#22c55e" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', letterSpacing: '0.04em' }}>SYNCHRONISATION TEMPS RÉEL</span>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 1.6s infinite' }} />
                    </div>
                    <div style={{ flex: 1 }} />
                    {summary.map(({ s }) => {
                        const cfg = statusCfg[s];
                        const Icon = cfg.icon;
                        const active = filter === s;
                        return (
                            <button key={s} data-tour="control-status-chip" data-status={s} onClick={() => setFilter(active ? null : s)} title={`Filtrer : ${cfg.label}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 10, background: cfg.bg, cursor: 'pointer', fontFamily: 'inherit',
                                    border: active ? `2px solid ${cfg.color}` : '2px solid transparent', transition: 'border-color 0.15s' }}>
                                <Icon size={16} color={cfg.color} />
                                <span style={{ fontSize: 18, fontWeight: 800, color: cfg.color }}>{count(s)}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cfg.label}</span>
                            </button>
                        );
                    })}
                    {filter && (
                        <button onClick={() => setFilter(null)} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                            ✕ Tout afficher
                        </button>
                    )}
                </div>

                {/* Machine wall */}
                {sorted.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)' }}>
                        <Cpu size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12 }}>
                            {filter ? `Aucune machine « ${statusCfg[filter].label} ».` : 'Aucune machine enregistrée.'}
                        </p>
                    </div>
                ) : (
                    <div data-tour="control-wall" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
                        {sorted.map((m: Machine) => {
                            const cfg = statusCfg[m.status] || statusCfg['arrêtée'];
                            const Icon = cfg.icon;
                            const ints = openInts(m.id);
                            const broken = m.status === 'en panne';
                            return (
                                <Link key={m.id} data-tour="control-machine-card" data-machine-status={m.status} href={`/machines/${m.id}`} style={{
                                    textDecoration: 'none', color: 'inherit',
                                    borderRadius: 16, padding: 20, background: cfg.bg,
                                    border: `2px solid ${cfg.color}${broken ? '' : '40'}`,
                                    display: 'flex', flexDirection: 'column', gap: 10,
                                    boxShadow: broken ? `0 0 24px ${cfg.color}33` : 'none',
                                    transition: 'transform 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{m.code}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.workshop}</div>
                                        </div>
                                        <div style={{
                                            width: 38, height: 38, borderRadius: 10, background: cfg.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <Icon size={20} color="white" />
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: cfg.color, color: 'white' }}>
                                            {cfg.label}
                                        </span>
                                        {ints > 0 && (
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Wrench size={11} /> {ints} en cours
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
                <style jsx>{`@keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </main>
        </>
    );
}
