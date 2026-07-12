'use client';

// ============================================================
// /alert-history — log of every alert email the server has fired.
// Reads from the alert_history table (written by /api/instant-alert,
// /api/cron/daily-alerts, /api/cron/weekly-report). Admin can audit
// what was sent, to whom, and why.
// ============================================================

import Header from '@/components/Header';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Mail, AlertTriangle, AlertOctagon, Info, CheckCircle2, XCircle, Clock,
    Filter, RefreshCw,
} from 'lucide-react';

interface AlertRow {
    id: string;
    source: 'instant' | 'cron-daily' | 'cron-weekly' | 'manual-test' | 'in-app';
    category: 'panne' | 'stock' | 'haccp' | 'digest' | 'weekly' | 'test';
    severity: 'info' | 'warning' | 'critical';
    subject: string;
    recipients: string[] | null;
    provider: string | null;
    status: 'sent' | 'failed' | 'skipped';
    error_msg: string | null;
    entity_table: string | null;
    entity_id: string | null;
    ack_at: string | null;
    ack_by: string | null;
    createdAt: string;
}

type Filter = 'all' | 'sent' | 'failed' | 'skipped';

const sourceStyle: Record<string, { label: string; color: string }> = {
    'instant':     { label: 'Instantané',  color: '#dc2626' },
    'cron-daily':  { label: 'Quotidien',   color: '#3b82f6' },
    'cron-weekly': { label: 'Hebdo',       color: '#0ea5e9' },
    'manual-test': { label: 'Test manuel', color: '#94a3b8' },
    'in-app':      { label: 'In-app',      color: '#8b5cf6' },
};

const sevIcon = {
    'info':     { icon: Info,         color: '#3b82f6', bg: '#eff6ff' },
    'warning':  { icon: AlertTriangle, color: '#d97706', bg: '#fffbeb' },
    'critical': { icon: AlertOctagon,  color: '#dc2626', bg: '#fef2f2' },
};

const statusStyle: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    'sent':    { label: 'Envoyé',  color: '#15803d', bg: '#f0fdf4', icon: CheckCircle2 },
    'failed':  { label: 'Échec',   color: '#dc2626', bg: '#fef2f2', icon: XCircle },
    'skipped': { label: 'Sauté',   color: '#64748b', bg: '#f1f5f9', icon: Clock },
};

function relTime(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
}

export default function AlertHistoryPage() {
    const [rows, setRows] = useState<AlertRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('all');
    const [category, setCategory] = useState<string>('all');

    const refresh = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('alert_history')
            .select('*')
            .order('createdAt', { ascending: false })
            .limit(200);
        setRows((data ?? []) as AlertRow[]);
        setLoading(false);
    };
    useEffect(() => { refresh(); }, []);

    // Realtime — new history rows appear without F5
    useEffect(() => {
        const ch = supabase.channel('alert-history-feed')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_history' },
                (p) => setRows(prev => [p.new as AlertRow, ...prev].slice(0, 200)))
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const filtered = useMemo(() => rows.filter(r => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (category !== 'all' && r.category !== category) return false;
        return true;
    }), [rows, filter, category]);

    const counts = useMemo(() => ({
        total: rows.length,
        sent: rows.filter(r => r.status === 'sent').length,
        failed: rows.filter(r => r.status === 'failed').length,
        skipped: rows.filter(r => r.status === 'skipped').length,
    }), [rows]);

    return (
        <>
            <Header title="Historique des alertes" subtitle="Trace de chaque e-mail envoyé par le serveur" />
            <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

                {/* KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <Kpi label="Total" value={counts.total} icon={Mail} color="#3b82f6" />
                    <Kpi label="Envoyés" value={counts.sent} icon={CheckCircle2} color="#16a34a" />
                    <Kpi label="Échecs" value={counts.failed} icon={XCircle} color="#dc2626" />
                    <Kpi label="Sautés" value={counts.skipped} icon={Clock} color="#64748b" />
                </div>

                {/* Filters */}
                <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <div style={{ display: 'flex', gap: 4 }}>
                        {(['all', 'sent', 'failed', 'skipped'] as Filter[]).map(f => (
                            <button key={f} onClick={() => setFilter(f)} style={chipStyle(filter === f)}>
                                {f === 'all' ? 'Tous' : statusStyle[f].label}
                            </button>
                        ))}
                    </div>
                    <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(['all', 'panne', 'stock', 'haccp', 'digest', 'weekly', 'test'] as const).map(c => (
                            <button key={c} onClick={() => setCategory(c)} style={chipStyle(category === c)}>
                                {c === 'all' ? 'Toutes catégories' : c}
                            </button>
                        ))}
                    </div>
                    <button onClick={refresh} title="Rafraîchir" style={{
                        marginLeft: 'auto', padding: 8, borderRadius: 8, background: 'var(--surface-hover)',
                        border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)',
                    }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                    </button>
                </div>

                {/* List */}
                {filtered.length === 0 ? (
                    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Aucune alerte n&apos;a encore été journalisée.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filtered.map(r => {
                            const sev = sevIcon[r.severity] ?? sevIcon.info;
                            const SevIcon = sev.icon;
                            const stat = statusStyle[r.status] ?? statusStyle.sent;
                            const StatusIcon = stat.icon;
                            const src = sourceStyle[r.source] ?? { label: r.source, color: '#94a3b8' };
                            return (
                                <div key={r.id} className="card" style={{
                                    padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start',
                                    borderLeft: `4px solid ${stat.color}`,
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                        background: sev.bg, color: sev.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><SevIcon size={18} /></div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10.5, fontWeight: 800, color: src.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{src.label}</span>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: stat.color, background: stat.bg, padding: '2px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <StatusIcon size={11} /> {stat.label}
                                            </span>
                                            {r.provider && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>via {r.provider}</span>}
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{relTime(r.createdAt)}</span>
                                        </div>
                                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{r.subject}</div>
                                        {r.recipients && r.recipients.length > 0 && (
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                → {r.recipients.join(', ')}
                                            </div>
                                        )}
                                        {r.error_msg && (
                                            <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4, fontFamily: 'monospace' }}>
                                                {r.error_msg}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </main>
        </>
    );
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
    return (
        <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '15', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} /></div>
            <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
            </div>
        </div>
    );
}

function chipStyle(active: boolean): React.CSSProperties {
    return {
        padding: '5px 11px', borderRadius: 100, fontSize: 11.5, fontWeight: 700,
        border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
        background: active ? '#3b82f6' : 'transparent',
        color: active ? 'white' : 'var(--text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit',
    };
}
