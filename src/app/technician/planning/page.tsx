'use client';

import Header from '@/components/Header';
import Link from 'next/link';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useMemo } from 'react';
import {
    CalendarDays, Cpu, Clock, AlertTriangle, CheckCircle, Wrench, ArrowRight,
} from 'lucide-react';
import type { InterventionStatus, InterventionType, Intervention } from '@/lib/types';

const statusMeta: Record<InterventionStatus, { color: string; bg: string; label: string }> = {
    'planifiée': { color: '#0ea5e9', bg: '#e0f2fe', label: 'Planifiée' },
    'en cours': { color: '#f59e0b', bg: '#fffbeb', label: 'En cours' },
    'terminée': { color: '#22c55e', bg: '#dcfce7', label: 'Terminée' },
    'clôturée': { color: '#10b981', bg: '#d1fae5', label: 'Clôturée' },
    'annulée': { color: '#94a3b8', bg: '#f1f5f9', label: 'Annulée' },
};

const typeColor: Record<InterventionType, string> = {
    'corrective': '#ef4444',
    'préventive': '#3b82f6',
    'conditionnelle': '#8b5cf6',
    'améliorative': '#10b981',
};

const dayLabel = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ref = new Date(d); ref.setHours(0, 0, 0, 0);
    const diff = Math.round((ref.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    if (diff === -1) return 'Hier';
    return ref.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

const dayKey = (d: Date) => {
    const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10);
};

export default function TechnicianPlanningPage() {
    const { user } = useAuth();
    const { interventions, machines, technicians } = useData();

    // Resolve the technicians row matching the signed-in user (email or name).
    const me = useMemo(() => {
        if (!user) return null;
        const e = user.email?.toLowerCase();
        if (e) {
            const byEmail = technicians.find(t => t.email && t.email.toLowerCase() === e);
            if (byEmail) return byEmail;
        }
        const n = user.name?.toLowerCase();
        if (n) {
            const byName = technicians.find(t => t.fullName && t.fullName.toLowerCase() === n);
            if (byName) return byName;
        }
        return null;
    }, [user, technicians]);

    // Window: today − 7 days … today + 14 days.
    const start = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 7); return d; }, []);
    const end = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + 14); return d; }, []);

    // Only interventions assigned to me (or unassigned-but-corrective) and within window.
    const mine = useMemo(() => {
        return interventions.filter(i => {
            if (me && i.technicianId !== me.id) return false;
            if (!me && i.technicianId) return false;        // no match → only see unassigned
            const d = new Date(i.startDate);
            return d >= start && d <= end;
        });
    }, [interventions, me, start, end]);

    // Group by day key.
    const grouped = useMemo(() => {
        const map = new Map<string, Intervention[]>();
        // Pre-fill the 22 days so empty days still appear
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            map.set(dayKey(d), []);
        }
        mine.forEach(i => {
            const k = dayKey(new Date(i.startDate));
            if (map.has(k)) map.get(k)!.push(i);
            else map.set(k, [i]);
        });
        const days = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([k, list]) => ({ key: k, date: new Date(k), list: list.sort((a, b) => a.startDate.localeCompare(b.startDate)) }));
        return days;
    }, [mine, start, end]);

    // KPIs
    const todayKey = dayKey(new Date());
    const todayCount = mine.filter(i => dayKey(new Date(i.startDate)) === todayKey).length;
    const upcomingCount = mine.filter(i => new Date(i.startDate) > new Date()).length;
    const overdueCount = mine.filter(i =>
        i.status !== 'terminée' && i.status !== 'clôturée' && i.status !== 'annulée'
        && new Date(i.startDate) < new Date()).length;

    const kpi = (label: string, value: number, color: string, icon: React.ReactNode) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    return (
        <>
            <Header title="Mon planning" subtitle={me ? `Interventions affectées à ${me.fullName}` : 'Sélectionnez votre profil dans Personnel pour voir vos interventions'} />
            <main style={{ padding: '24px 32px' }}>

                <div data-tour="plan-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {kpi("Aujourd'hui", todayCount, '#3b82f6', <CalendarDays size={13} />)}
                    {kpi('À venir', upcomingCount, '#0ea5e9', <Clock size={13} />)}
                    {kpi('En retard', overdueCount, overdueCount ? '#dc2626' : '#16a34a', <AlertTriangle size={13} />)}
                    {kpi('Total fenêtre', mine.length, '#8b5cf6', <Wrench size={13} />)}
                </div>

                <div data-tour="plan-days" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {grouped.map(({ key, date, list }) => {
                        const isToday = key === todayKey;
                        return (
                            <div key={key} className="card" style={{ padding: 0, overflow: 'hidden', borderColor: isToday ? '#3b82f6' : undefined }}>
                                <div style={{
                                    padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
                                    background: isToday ? 'rgba(59,130,246,0.05)' : 'var(--surface-hover)',
                                    borderBottom: '1px solid var(--border-light)',
                                }}>
                                    <CalendarDays size={16} color={isToday ? '#3b82f6' : 'var(--text-muted)'} />
                                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: isToday ? '#3b82f6' : 'var(--text-primary)' }}>
                                        {dayLabel(date)}
                                    </span>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                        {list.length === 0 ? 'aucune intervention' : `${list.length} intervention${list.length > 1 ? 's' : ''}`}
                                    </span>
                                </div>
                                {list.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {list.map(i => {
                                            const m = machines.find(x => x.id === i.machineId);
                                            const st = statusMeta[i.status];
                                            const overdue = i.status !== 'terminée' && i.status !== 'clôturée' && i.status !== 'annulée'
                                                && new Date(i.startDate) < new Date();
                                            const finished = i.status === 'terminée' || i.status === 'clôturée';
                                            return (
                                                <Link key={i.id} href={`/technician/report?id=${i.id}`} style={{
                                                    padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14,
                                                    borderBottom: '1px solid var(--border-light)', textDecoration: 'none',
                                                    color: 'var(--text-primary)', transition: 'background 0.15s',
                                                }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <div style={{ width: 4, height: 36, borderRadius: 100, background: typeColor[i.interventionType], flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            {finished && <CheckCircle size={14} color="#22c55e" />}
                                                            {m?.code ?? 'Machine ?'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {m?.name ?? ''}</span>
                                                        </div>
                                                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {i.description || '—'}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: st.bg, color: st.color }}>
                                                            {st.label}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                            {new Date(i.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                            {overdue && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 6 }}>⚠ en retard</span>}
                                                        </span>
                                                    </div>
                                                    <ArrowRight size={14} color="var(--text-muted)" />
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {!me && (
                    <div style={{ marginTop: 22, padding: '14px 18px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
                            <b>Compte non lié à une fiche technicien.</b> Pour voir vos interventions, demandez à l&apos;admin
                            de mettre à jour votre adresse e-mail dans la fiche Personnel pour qu&apos;elle corresponde à votre compte
                            de connexion, ou d&apos;assigner les interventions à votre nom complet.
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 22, padding: '12px 16px', borderRadius: 10, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--primary)' }}>
                    <Cpu size={16} />
                    Cliquez sur une intervention pour ouvrir son rapport.
                </div>
            </main>
        </>
    );
}
