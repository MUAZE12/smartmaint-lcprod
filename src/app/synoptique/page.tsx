'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import type { Machine } from '@/lib/types';
import { CheckCircle, AlertTriangle, Wrench, Power, ArrowRight, Cpu, Radio } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// ── L.C PROD edible-oil line, in process-flow order ──
// Matches against `machine.workshop` (process zone), which holds the
// real zone after the L.C PROD seed. Multiple workshops can map to the
// same logical stage — Conditionnement + Emballage feed the same step.
const STAGES: { key: string; workshops: string[]; label: string; emoji: string }[] = [
    { key: 'reception', workshops: ['Réception MP'], label: 'Réception MP', emoji: '🛢️' },
    { key: 'traitement', workshops: ['Traitement', 'Préparation'], label: 'Traitement', emoji: '⚗️' },
    { key: 'production', workshops: ['Production'], label: 'Production', emoji: '🏭' },
    { key: 'remplissage', workshops: ['Remplissage'], label: 'Remplissage', emoji: '🫗' },
    { key: 'conditionnement', workshops: ['Conditionnement', 'Emballage'], label: 'Conditionnement', emoji: '📦' },
    { key: 'expedition', workshops: ['Expédition'], label: 'Expédition', emoji: '🚚' },
];

const statusCfg: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    'opérationnelle': { label: 'Opérationnelle', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle },
    'en panne': { label: 'En panne', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: AlertTriangle },
    'en maintenance': { label: 'En maintenance', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Wrench },
    'arrêtée': { label: 'Arrêtée', color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Power },
};

export default function SynoptiquePage() {
    const { machines, interventions } = useData();
    // Click a status chip to spotlight those machines across the whole flow.
    const [statusFilter, setStatusFilter] = useState<string | null>(null);

    const openInts = (machineId: string) =>
        interventions.filter(i => i.machineId === machineId && (i.status === 'en cours' || i.status === 'planifiée')).length;

    const byStage = (workshops: string[]) => machines.filter(m => workshops.includes(m.workshop));
    const utilites = byStage(['Utilités']);

    const count = (s: string) => machines.filter(m => m.status === s).length;
    const broken = count('en panne');

    // A stage is "blocked" if it holds a broken machine — the flow arrow turns red.
    const stageBlocked = (workshops: string[]) => byStage(workshops).some(m => m.status === 'en panne');

    // ── Machine node ──
    const MachineNode = ({ m }: { m: Machine }) => {
        const cfg = statusCfg[m.status] || statusCfg['arrêtée'];
        const Icon = cfg.icon;
        const ints = openInts(m.id);
        const dimmed = !!statusFilter && m.status !== statusFilter;
        return (
            <Link href={`/machines/${m.id}`} style={{
                textDecoration: 'none', color: 'inherit', display: 'block',
                borderRadius: 12, padding: '12px 14px', background: 'var(--surface)',
                borderLeft: `4px solid ${cfg.color}`,
                border: '1px solid var(--border)', borderLeftWidth: 4, borderLeftColor: cfg.color,
                boxShadow: m.status === 'en panne' && !dimmed ? `0 0 14px ${cfg.color}44` : '0 1px 3px rgba(0,0,0,0.05)',
                opacity: dimmed ? 0.28 : 1,
                transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s',
            }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em' }}>{m.code}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {ints > 0 && (
                            <span title={`${ints} intervention(s) en cours`} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: 'rgba(245,158,11,0.15)', color: '#d97706' }}>
                                {ints}
                            </span>
                        )}
                        <Icon size={14} color={cfg.color} />
                    </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                </div>
            </Link>
        );
    };

    return (
        <>
            <Header title="Synoptique d'usine" subtitle="Flux de production L.C PROD — état machines en temps réel" />
            <main style={{ padding: '24px 32px' }}>
                {/* Live banner + legend */}
                <div data-tour="synoptique-legend" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 100, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                        <Radio size={15} color="#22c55e" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', letterSpacing: '0.04em' }}>FLUX TEMPS RÉEL</span>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 1.6s infinite' }} />
                    </div>
                    <div style={{ flex: 1 }} />
                    {Object.entries(statusCfg).map(([s, cfg]) => {
                        const Icon = cfg.icon;
                        const active = statusFilter === s;
                        return (
                            <button key={s} data-tour="synoptique-status-chip" data-status={s} onClick={() => setStatusFilter(active ? null : s)} title={`Mettre en évidence : ${cfg.label}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 10, background: cfg.bg, cursor: 'pointer', fontFamily: 'inherit',
                                    border: active ? `2px solid ${cfg.color}` : '2px solid transparent', transition: 'border-color 0.15s' }}>
                                <Icon size={16} color={cfg.color} />
                                <span style={{ fontSize: 18, fontWeight: 800, color: cfg.color }}>{count(s)}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cfg.label}</span>
                            </button>
                        );
                    })}
                    {statusFilter && (
                        <button onClick={() => setStatusFilter(null)} title="Réinitialiser"
                            style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                            ✕
                        </button>
                    )}
                </div>

                {broken > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 22 }}>
                        <AlertTriangle size={18} color="#ef4444" />
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#dc2626' }}>
                            {broken} machine(s) en panne — le flux de production est interrompu sur les étapes en rouge.
                        </span>
                    </div>
                )}

                {machines.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)' }}>
                        <Cpu size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12 }}>Aucune machine enregistrée.</p>
                    </div>
                ) : (
                    <>
                        {/* ── Process flow line ── */}
                        <div data-tour="synoptique-flow" style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', paddingBottom: 12 }}>
                            {STAGES.map((stage, idx) => {
                                const list = byStage(stage.workshops);
                                const blocked = stageBlocked(stage.workshops);
                                return (
                                    <div key={stage.key} data-tour="synoptique-stage" data-stage-type={stage.key} style={{ display: 'flex', alignItems: 'stretch' }}>
                                        {/* Stage column */}
                                        <div style={{
                                            minWidth: 210, maxWidth: 210, display: 'flex', flexDirection: 'column',
                                            borderRadius: 16, background: 'var(--surface-hover)',
                                            border: `1.5px solid ${blocked ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                padding: '12px 14px', borderBottom: '1px solid var(--border-light)',
                                                background: blocked ? 'rgba(239,68,68,0.06)' : 'var(--surface)',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    <span style={{ fontSize: 18 }}>{stage.emoji}</span>
                                                    <div>
                                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ÉTAPE {idx + 1}</div>
                                                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{stage.label}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                                                {list.length === 0
                                                    ? <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>—</div>
                                                    : list.map(m => <MachineNode key={m.id} m={m} />)}
                                            </div>
                                        </div>
                                        {/* Flow arrow */}
                                        {idx < STAGES.length - 1 && (
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                                                <ArrowRight size={26} color={blocked ? '#ef4444' : 'var(--text-muted)'} strokeWidth={2.5} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Utilités support band ── */}
                        {utilites.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 8 }}>
                                    ╌╌╌  UTILITÉS — ALIMENTENT TOUTE LA LIGNE  ╌╌╌
                                </div>
                                <div style={{
                                    borderRadius: 16, border: '1.5px dashed var(--border)', background: 'var(--surface-hover)',
                                    padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap',
                                }}>
                                    {utilites.map(m => (
                                        <div key={m.id} style={{ minWidth: 200, flex: '0 1 220px' }}>
                                            <MachineNode m={m} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
                <style jsx>{`@keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            </main>
        </>
    );
}
