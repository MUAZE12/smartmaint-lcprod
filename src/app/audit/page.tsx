'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { useState, useMemo } from 'react';
import { History, Search, Plus, Pencil, Trash2, Info, User, Activity } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';

type ActionFilter = 'all' | 'création' | 'modification' | 'suppression';

const actionCfg: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    'création': { color: '#16a34a', bg: '#f0fdf4', icon: <Plus size={14} /> },
    'modification': { color: '#2563eb', bg: '#eff6ff', icon: <Pencil size={14} /> },
    'suppression': { color: '#dc2626', bg: '#fef2f2', icon: <Trash2 size={14} /> },
};

function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `il y a ${d} j`;
    return new Date(iso).toLocaleDateString('fr-FR');
}

function dayLabel(iso: string): string {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function AuditPage() {
    const { auditLog } = useData();
    const [action, setAction] = useState<ActionFilter>('all');
    const [entity, setEntity] = useState<string>('all');
    const [query, setQuery] = useState('');

    const entityTypes = useMemo(
        () => [...new Set(auditLog.map(e => e.entityType))].sort(),
        [auditLog],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return auditLog
            .filter(e => action === 'all' || e.action === action)
            .filter(e => entity === 'all' || e.entityType === entity)
            .filter(e => !q || e.summary.toLowerCase().includes(q)
                || e.userName.toLowerCase().includes(q)
                || e.entityType.toLowerCase().includes(q))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [auditLog, action, entity, query]);

    // ── KPIs ──
    const todayStr = new Date().toDateString();
    const todayCount = auditLog.filter(e => new Date(e.createdAt).toDateString() === todayStr).length;
    const topUser = useMemo(() => {
        const m = new Map<string, number>();
        auditLog.forEach(e => m.set(e.userName, (m.get(e.userName) ?? 0) + 1));
        return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    }, [auditLog]);
    const topEntity = useMemo(() => {
        const m = new Map<string, number>();
        auditLog.forEach(e => m.set(e.entityType, (m.get(e.entityType) ?? 0) + 1));
        return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    }, [auditLog]);

    // ── Group filtered entries by day ──
    const groups = useMemo(() => {
        const map = new Map<string, AuditEntry[]>();
        filtered.forEach(e => {
            const key = new Date(e.createdAt).toDateString();
            const bucket = map.get(key);
            if (bucket) bucket.push(e);
            else map.set(key, [e]);
        });
        return [...map.entries()];
    }, [filtered]);

    const kpi = (label: string, value: string, color: string, icon: React.ReactNode) => (
        <div className="kpi-card" style={{ flex: 1, minWidth: 170 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <span className="section-eyebrow">{label}</span>
            </div>
            <div style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
        </div>
    );

    return (
        <>
            <Header title="Journal d'audit" subtitle="Traçabilité de toutes les actions effectuées dans l'application" />
            <main style={{ padding: '24px 32px' }}>
                {/* Note */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 12, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', marginBottom: 20 }}>
                    <Info size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--primary)', fontWeight: 500, lineHeight: 1.5 }}>
                        Chaque création, modification ou suppression est enregistrée automatiquement avec son auteur et son horodatage. Le journal ne peut être ni modifié ni effacé.
                    </span>
                </div>

                {/* KPIs */}
                <div data-tour="audit-kpis" style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {kpi('Total des entrées', String(auditLog.length), '#3b82f6', <Activity size={13} />)}
                    {kpi("Actions aujourd'hui", String(todayCount), '#16a34a', <History size={13} />)}
                    {kpi('Utilisateur le plus actif', topUser ? `${topUser[0]}` : '—', '#8b5cf6', <User size={13} />)}
                    {kpi('Entité la plus modifiée', topEntity ? `${topEntity[0]}` : '—', '#f59e0b', <Pencil size={13} />)}
                </div>

                {/* Filters */}
                <div data-tour="audit-filters" className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['all', 'création', 'modification', 'suppression'] as ActionFilter[]).map(a => {
                            const on = action === a;
                            const c = a === 'all' ? '#3b82f6' : actionCfg[a].color;
                            return (
                                <button key={a} data-tour="audit-chip" data-chip={a} onClick={() => setAction(a)} style={{
                                    padding: '6px 13px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                    border: `1px solid ${on ? c : 'var(--border)'}`, background: on ? c : 'var(--surface)', color: on ? 'white' : 'var(--text-secondary)',
                                }}>{a === 'all' ? 'Toutes' : a}</button>
                            );
                        })}
                    </div>
                    <select data-tour="audit-entity-select" value={entity} onChange={e => setEntity(e.target.value)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                        <option value="all">Toutes les entités</option>
                        {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)' }}>
                        <Search size={15} color="var(--text-muted)" />
                        <input data-tour="audit-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher (résumé, utilisateur…)"
                            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary)', width: '100%' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} entrée{filtered.length > 1 ? 's' : ''}</span>
                </div>

                {/* Timeline */}
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <History size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>
                            {auditLog.length === 0
                                ? "Aucune action enregistrée pour l'instant — le journal se remplira dès la première modification."
                                : 'Aucune entrée ne correspond aux filtres.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                        {groups.map(([key, entries]) => (
                            <div key={key}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                                    {dayLabel(entries[0].createdAt)}
                                </div>
                                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                    {entries.map((e, i) => {
                                        const cfg = actionCfg[e.action] ?? actionCfg['modification'];
                                        return (
                                            <div key={e.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                                                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                                            }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cfg.bg, color: cfg.color }}>
                                                    {cfg.icon}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>
                                                        <span style={{ fontWeight: 700, color: cfg.color, textTransform: 'capitalize' }}>{e.action}</span>
                                                        {' · '}
                                                        <span style={{ fontWeight: 600 }}>{e.entityType}</span>
                                                        {e.summary && <span style={{ color: 'var(--text-secondary)' }}> — {e.summary}</span>}
                                                    </div>
                                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                        <User size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                                                        {e.userName}
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                                    {relTime(e.createdAt)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </>
    );
}
