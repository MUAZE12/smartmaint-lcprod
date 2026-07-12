'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { Users, Phone, Mail, Wrench, Clock } from 'lucide-react';

const availabilityConfig: Record<string, { label: string; class: string }> = {
    'disponible': { label: 'Disponible', class: 'badge-operational' },
    'en intervention': { label: 'En intervention', class: 'badge-maintenance' },
    'indisponible': { label: 'Indisponible', class: 'badge-broken' },
};

export default function TechniciansPage() {
    const { technicians, interventions } = useData();
    const techStats = technicians.map(tech => {
        const techInterventions = interventions.filter(i => i.technicianId === tech.id);
        const completed = techInterventions.filter(i => i.status === 'terminée');
        const avgTime = completed.length > 0
            ? Math.round((completed.reduce((s, i) => s + i.downtimeHours, 0) / completed.length) * 10) / 10
            : 0;
        return { ...tech, interventionCount: techInterventions.length, completedCount: completed.length, avgTime };
    });

    return (
        <>
            <Header title="Techniciens" subtitle="Équipe de maintenance" />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                        gap: 16,
                    }}
                >
                    {techStats.map((tech, idx) => {
                        const avail = availabilityConfig[tech.availability];
                        return (
                            <div key={tech.id} className="card" style={{ padding: 24, animationDelay: `${idx * 80}ms` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                                    <div
                                        style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][idx % 4]}, ${['#1d4ed8', '#6d28d9', '#be185d', '#d97706'][idx % 4]})`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            fontWeight: 700,
                                            fontSize: 18,
                                        }}
                                    >
                                        {tech.fullName.split(' ').map(n => n[0]).join('')}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 16 }}>{tech.fullName}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tech.specialty}</div>
                                    </div>
                                    <span className={`badge ${avail.class}`}>{avail.label}</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Phone size={14} color="var(--text-muted)" />
                                        <span>{tech.phone}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Mail size={14} color="var(--text-muted)" />
                                        <span>{tech.email}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Wrench size={14} color="var(--primary)" />
                                            <span style={{ fontSize: 20, fontWeight: 700 }}>{tech.interventionCount}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Interventions</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Users size={14} color="var(--accent-green)" />
                                            <span style={{ fontSize: 20, fontWeight: 700 }}>{tech.completedCount}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Terminées</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Clock size={14} color="var(--accent-orange)" />
                                            <span style={{ fontSize: 20, fontWeight: 700 }}>{tech.avgTime}h</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Moy. durée</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>
        </>
    );
}
