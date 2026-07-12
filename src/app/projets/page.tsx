'use client';

// ============================================================
// Projets de maintenance — plans, gros travaux, arrêts programmés.
// Contrairement aux interventions (unitaires, sur une seule machine),
// un projet est un chantier long avec plusieurs tâches, plusieurs
// machines, un budget et une échéance. Exemples typiques :
//   • Arrêt général usine du 15 août — nettoyage + révision toutes lignes
//   • Remplacement compresseur air CMP-001
//   • Audit HACCP annuel
//   • Installation nouvelle ligne de conditionnement
// ============================================================

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { maintenanceProjectsDb } from '@/lib/db';
import type { MaintenanceProject, ProjectTask } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';
import {
    Briefcase, Plus, Search, Calendar, Users, Wrench, Trash2, Edit3,
    CheckCircle2, Clock, AlertTriangle, TrendingUp, DollarSign, X, Save,
    Play, Ban, ClipboardCheck,
} from 'lucide-react';

type Status = MaintenanceProject['status'];
type Priority = MaintenanceProject['priority'];

const statusCfg: Record<Status, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    'planned': { label: 'Planifié', color: '#0891b2', bg: 'rgba(8,145,178,0.10)', icon: Clock },
    'in-progress': { label: 'En cours', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: Play },
    'completed': { label: 'Terminé', color: '#16a34a', bg: 'rgba(22,163,74,0.10)', icon: CheckCircle2 },
    'cancelled': { label: 'Annulé', color: '#64748b', bg: 'rgba(100,116,139,0.10)', icon: Ban },
};

const priorityCfg: Record<Priority, { label: string; color: string; bg: string }> = {
    'low': { label: 'Basse', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
    'medium': { label: 'Moyenne', color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
    'high': { label: 'Haute', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
    'critical': { label: 'Critique', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
};

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return iso; }
};

const daysBetween = (a: string, b: string) => {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Math.round(ms / 86400000);
};

export default function ProjetsPage() {
    const { user } = useAuth();
    const { maintenanceProjects, machines, personnel, technicians } = useData();
    const { showToast } = useToast();

    const isTech = user?.role === 'technician';
    const myName = user?.name ?? '';

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<MaintenanceProject | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<MaintenanceProject | null>(null);

    // Toggle a task inside a project — the only mutation a technician can
    // perform. Admins can toggle from the same UI too; they still have the
    // full edit modal for everything else.
    const toggleTask = async (project: MaintenanceProject, taskId: string) => {
        const nextTasks = project.tasks.map(t =>
            t.id === taskId
                ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null }
                : t
        );
        try {
            await maintenanceProjectsDb.update(project.id, { tasks: nextTasks });
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };

    const filtered = useMemo(() => {
        let list = [...maintenanceProjects];
        // Technicians only see projects they're assigned to.
        if (isTech) list = list.filter(p => p.assigneeNames.includes(myName));
        if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter(p =>
            p.title.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            p.ownerName.toLowerCase().includes(q)
        );
        return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }, [maintenanceProjects, statusFilter, search, isTech, myName]);

    // KPIs — for technicians they reflect ONLY their own assigned projects.
    const kpiScope = useMemo(
        () => isTech ? maintenanceProjects.filter(p => p.assigneeNames.includes(myName)) : maintenanceProjects,
        [maintenanceProjects, isTech, myName],
    );
    const kpis = useMemo(() => ({
        total: kpiScope.length,
        active: kpiScope.filter(p => p.status === 'in-progress').length,
        planned: kpiScope.filter(p => p.status === 'planned').length,
        completed: kpiScope.filter(p => p.status === 'completed').length,
        budget: kpiScope.reduce((s, p) => s + (p.budget || 0), 0),
    }), [kpiScope]);

    const openCreate = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (p: MaintenanceProject) => { setEditing(p); setModalOpen(true); };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await maintenanceProjectsDb.remove(deleteTarget.id);
            showToast('Projet supprimé');
            setDeleteTarget(null);
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };

    const progressPct = (p: MaintenanceProject) => {
        if (p.tasks.length === 0) return p.status === 'completed' ? 100 : 0;
        return Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100);
    };

    // Detect whether the Supabase table is unreachable (RLS bug the admin
    // has been fighting). If we couldn't load a single project AND we're
    // signed in AND the underlying data errored, show a big install-fix
    // banner right on the page instead of a small red toast that scrolls
    // away.
    const [tableUnreachable, setTableUnreachable] = useState(false);
    useEffect(() => {
        // Small probe — direct query to bypass any layer that might swallow
        // the error. We don't need the data, just the error code.
        (async () => {
            const { supabase } = await import('@/lib/supabase');
            const { error } = await supabase.from('maintenance_projects').select('id').limit(1);
            if (error && /permission denied|relation .* does not exist/i.test(error.message)) {
                setTableUnreachable(true);
            } else {
                setTableUnreachable(false);
            }
        })();
    }, [maintenanceProjects.length]);

    return (
        <>
            <Header
                title={isTech ? 'Mes projets' : 'Projets de maintenance'}
                subtitle={isTech
                    ? 'Les chantiers auxquels vous participez — cochez vos tâches au fur et à mesure'
                    : 'Gros travaux, arrêts programmés, audits — pilotés bout-en-bout'} />
            <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }} className="animate-fade-in">

                {tableUnreachable && (
                    <div style={{
                        marginBottom: 20, padding: 18, borderRadius: 12,
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <AlertTriangle size={18} color="#f59e0b" />
                            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#b45309' }}>Supabase — accès à la table refusé</h3>
                        </div>
                        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                            L&apos;erreur <code>permission denied for table</code> vient d&apos;un privilège Postgres manquant (pas RLS). Copiez ces trois lignes dans <b>Supabase → SQL Editor</b>, cliquez <b>Run</b>. Ça marche à coup sûr :
                            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-hover)', fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                grant usage on schema public to anon, authenticated;{'\n'}
                                grant all on maintenance_projects to anon, authenticated;{'\n'}
                                alter table maintenance_projects disable row level security;
                            </div>
                            <button onClick={() => {
                                const sql = 'grant usage on schema public to anon, authenticated;\ngrant all on maintenance_projects to anon, authenticated;\nalter table maintenance_projects disable row level security;';
                                navigator.clipboard.writeText(sql);
                                showToast('SQL copié — collez-le dans Supabase SQL Editor');
                            }} style={{
                                marginTop: 10, padding: '8px 16px', borderRadius: 8,
                                border: 'none', background: '#b45309', color: 'white',
                                fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                            }}>📋 Copier le SQL</button>
                            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{
                                marginInlineStart: 8, padding: '8px 16px', borderRadius: 8,
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none',
                                display: 'inline-block',
                            }}>Ouvrir Supabase Dashboard →</a>
                        </div>
                    </div>
                )}

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
                    <Kpi icon={Briefcase} label="Projets total" value={kpis.total} color="#3b82f6" />
                    <Kpi icon={Play} label="En cours" value={kpis.active} color="#f59e0b" />
                    <Kpi icon={Clock} label="Planifiés" value={kpis.planned} color="#0891b2" />
                    <Kpi icon={CheckCircle2} label="Terminés" value={kpis.completed} color="#16a34a" />
                    <Kpi icon={DollarSign} label="Budget total" value={`${kpis.budget.toLocaleString('fr-FR')} MAD`} color="#8b5cf6" />
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 400 }}>
                        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Rechercher par titre, description, ou pilote…"
                            style={{ width: '100%', padding: '9px 14px 9px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['all', 'planned', 'in-progress', 'completed', 'cancelled'] as const).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)}
                                style={{
                                    padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                    border: '1px solid ' + (statusFilter === s ? 'var(--primary)' : 'var(--border)'),
                                    background: statusFilter === s ? 'var(--primary-lighter)' : 'var(--surface)',
                                    color: statusFilter === s ? 'var(--primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>{s === 'all' ? 'Tous' : statusCfg[s].label}</button>
                        ))}
                    </div>
                    {!isTech && (
                        <button data-tour="projet-new" onClick={openCreate} style={{
                            marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '9px 16px', borderRadius: 8, border: 'none',
                            background: 'var(--primary)',
                            color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                            boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                            transition: 'background 0.15s ease',
                        }}><Plus size={14} /> Nouveau projet</button>
                    )}
                </div>

                {/* Gantt-style timeline — one bar per project, positioned on
                    the shared date range. Skipped when no project has a
                    startDate + dueDate. */}
                {filtered.some(p => p.startDate && p.dueDate) && (
                    <GanttTimeline projects={filtered} />
                )}

                {/* Projects list */}
                {filtered.length === 0 ? (
                    <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Briefcase size={40} style={{ opacity: 0.35 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>
                            {maintenanceProjects.length === 0
                                ? 'Aucun projet. Cliquez « Nouveau projet » pour planifier votre premier chantier.'
                                : 'Aucun résultat pour ces filtres.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filtered.map(p => {
                            const sCfg = statusCfg[p.status];
                            const pCfg = priorityCfg[p.priority];
                            const StatusIcon = sCfg.icon;
                            const pct = progressPct(p);
                            const late = p.dueDate && p.status !== 'completed' && p.status !== 'cancelled'
                                && new Date(p.dueDate).getTime() < Date.now();
                            const daysLeft = p.dueDate ? daysBetween(new Date().toISOString(), p.dueDate) : null;
                            return (
                                <div key={p.id} data-tour="projet-card" data-projet-title={p.title} className="card" style={{
                                    padding: 18,
                                    borderInlineStart: `4px solid ${late ? '#ef4444' : sCfg.color}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 11, background: sCfg.bg, color: sCfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <StatusIcon size={20} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                                <h3 style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{p.title}</h3>
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: sCfg.bg, color: sCfg.color, textTransform: 'uppercase' }}>{sCfg.label}</span>
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: pCfg.bg, color: pCfg.color, textTransform: 'uppercase' }}>{pCfg.label}</span>
                                                {late && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}><AlertTriangle size={10} /> En retard</span>}
                                            </div>
                                            {p.description && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{p.description}</div>}
                                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                                                {p.ownerName && <span><Users size={11} style={{ verticalAlign: -1 }} /> Pilote : <b style={{ color: 'var(--text-secondary)' }}>{p.ownerName}</b></span>}
                                                <span><Calendar size={11} style={{ verticalAlign: -1 }} /> Début : <b style={{ color: 'var(--text-secondary)' }}>{fmtDate(p.startDate)}</b></span>
                                                <span><Calendar size={11} style={{ verticalAlign: -1 }} /> Échéance : <b style={{ color: late ? '#ef4444' : 'var(--text-secondary)' }}>{fmtDate(p.dueDate)}</b>{daysLeft !== null && p.status === 'in-progress' && <span style={{ marginInlineStart: 4, color: daysLeft < 0 ? '#ef4444' : daysLeft < 7 ? '#f59e0b' : 'var(--text-muted)' }}> · {daysLeft < 0 ? `${-daysLeft} j de retard` : `${daysLeft} j restants`}</span>}</span>
                                                {p.budget > 0 && <span><DollarSign size={11} style={{ verticalAlign: -1 }} /> Budget : <b style={{ color: 'var(--text-secondary)' }}>{p.budget.toLocaleString('fr-FR')} MAD</b></span>}
                                                {p.machineIds.length > 0 && <span><Wrench size={11} style={{ verticalAlign: -1 }} /> {p.machineIds.length} machine(s)</span>}
                                                {p.assigneeNames.length > 0 && <span><Users size={11} style={{ verticalAlign: -1 }} /> {p.assigneeNames.length} technicien(s)</span>}
                                            </div>
                                            {/* Progress bar */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{p.tasks.filter(t => t.done).length}/{p.tasks.length} tâches</span>
                                                    <span style={{ fontWeight: 700, color: pct >= 100 ? '#16a34a' : 'var(--text-secondary)' }}>{pct}%</span>
                                                </div>
                                                <div style={{ height: 8, borderRadius: 100, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#0e7c3f' : sCfg.color, transition: 'width 0.4s' }} />
                                                </div>
                                            </div>
                                        </div>
                                        {!isTech && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                                <button data-tour="projet-edit" onClick={() => openEdit(p)} title="Modifier"
                                                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Edit3 size={14} />
                                                </button>
                                                <button data-tour="projet-delete" onClick={() => setDeleteTarget(p)} title="Supprimer"
                                                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Inline task list — always visible when the project has tasks.
                                        Tech only sees the checkboxes; admin also has the full editor
                                        via the pencil button above. */}
                                    {p.tasks.length > 0 && (
                                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                                                Tâches {isTech && '· cochez au fur et à mesure'}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 4 }}>
                                                {p.tasks.map(t => (
                                                    <label key={t.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '5px 8px', borderRadius: 6,
                                                        fontSize: 12.5, cursor: 'pointer',
                                                        color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                                                        background: t.done ? 'var(--surface-hover)' : 'transparent',
                                                    }}>
                                                        <input type="checkbox" checked={t.done}
                                                            onChange={() => toggleTask(p, t.id)}
                                                            style={{ cursor: 'pointer', flexShrink: 0 }} />
                                                        <span style={{
                                                            textDecoration: t.done ? 'line-through' : 'none',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>{t.title}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Photo strip */}
                                    {p.photoUrls && p.photoUrls.length > 0 && (
                                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                                Photos · {p.photoUrls.length}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {p.photoUrls.slice(0, 8).map((url, i) => (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <a key={i} href={url} target="_blank" rel="noreferrer" style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                        <img src={url} alt="Projet" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </a>
                                                ))}
                                                {p.photoUrls.length > 8 && (
                                                    <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                                        +{p.photoUrls.length - 8}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Final report — teaser + click to expand */}
                                    {p.finalReport && p.finalReport.trim() !== '' && (
                                        <details style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                                            <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <ClipboardCheck size={12} /> Rapport de clôture
                                            </summary>
                                            <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--surface-hover)', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                                                {p.finalReport}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {modalOpen && (
                <ProjectFormModal
                    initial={editing}
                    machines={machines}
                    operators={personnel.filter(x => x.role === 'operateur').map(x => x.nom)}
                    techs={[...technicians.map(x => x.fullName), ...personnel.filter(x => x.role === 'technicien').map(x => x.nom)]}
                    onClose={() => setModalOpen(false)}
                    createdBy={user?.name ?? 'Admin'}
                />
            )}

            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le projet" size="sm"
                footer={<>
                    <button onClick={() => setDeleteTarget(null)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                    <button data-tour="projet-delete-confirm" onClick={confirmDelete} className="btn btn-danger btn-sm">Supprimer</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <AlertTriangle size={28} color="#ef4444" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ fontSize: 14 }}>Supprimer le projet <b>{deleteTarget?.title}</b> ? Cette action est irréversible.</p>
                </div>
            </Modal>
        </>
    );
}

function Kpi({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
    return (
        <div className="kpi-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 7, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div className="section-eyebrow">{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>{value}</div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// Gantt-style timeline. Auto-computes a shared date range from
// the projects it receives and lays out one horizontal bar per
// project positioned on that range. Weeks are marked with faint
// vertical guides. Zero external deps — CSS only.
// ────────────────────────────────────────────────────────────
function GanttTimeline({ projects }: { projects: MaintenanceProject[] }) {
    const withDates = projects.filter(p => p.startDate && p.dueDate);
    if (withDates.length === 0) return null;

    // Domain: min start → max due, expanded by ±5 days for breathing room.
    const starts = withDates.map(p => new Date(p.startDate!).getTime());
    const ends = withDates.map(p => new Date(p.dueDate!).getTime());
    const min = Math.min(...starts) - 5 * 86400000;
    const max = Math.max(...ends, Date.now()) + 5 * 86400000;
    const span = Math.max(1, max - min);

    const nowPct = ((Date.now() - min) / span) * 100;

    // Month ticks — a light label every ~14 days worth of pixels.
    const months: { label: string; leftPct: number }[] = [];
    const startD = new Date(min);
    const monthStart = new Date(startD.getFullYear(), startD.getMonth(), 1);
    for (let d = monthStart; d.getTime() < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const t = d.getTime();
        if (t < min) continue;
        months.push({
            label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
            leftPct: ((t - min) / span) * 100,
        });
    }

    return (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <TrendingUp size={16} color="var(--primary)" />
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Timeline des projets</h3>
                <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(min).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {' → '}
                    {new Date(max).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
            </div>
            {/* Month labels */}
            <div style={{ position: 'relative', height: 18, marginBottom: 6, borderBottom: '1px dashed var(--border)' }}>
                {months.map(m => (
                    <span key={m.leftPct} style={{
                        position: 'absolute', left: `${m.leftPct}%`, top: 0,
                        fontSize: 10.5, color: 'var(--text-muted)',
                        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
                    }}>{m.label}</span>
                ))}
                {/* Today marker */}
                {nowPct >= 0 && nowPct <= 100 && (
                    <span style={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, borderInlineStart: '2px solid #ef4444', pointerEvents: 'none' }} />
                )}
            </div>
            {/* Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {withDates.map(p => {
                    const s = new Date(p.startDate!).getTime();
                    const e = new Date(p.dueDate!).getTime();
                    const leftPct = ((s - min) / span) * 100;
                    const widthPct = Math.max(1.5, ((e - s) / span) * 100);
                    const cfg = statusCfg[p.status];
                    const late = p.status !== 'completed' && p.status !== 'cancelled' && e < Date.now();
                    return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 140, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                            <div style={{ position: 'relative', flex: 1, height: 22 }}>
                                <div style={{
                                    position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                                    top: 0, bottom: 0, borderRadius: 6,
                                    background: late ? '#b91c1c' : cfg.color,
                                    display: 'flex', alignItems: 'center', padding: '0 8px',
                                    fontSize: 10.5, fontWeight: 700, color: 'white',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }} title={`${p.title} · ${cfg.label}`}>{cfg.label}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// Create / Edit modal — includes an inline task manager so the
// admin can build the whole checklist in one shot.
// ────────────────────────────────────────────────────────────
interface FormModalProps {
    initial: MaintenanceProject | null;
    machines: { id: string; code: string; name: string }[];
    operators: string[];
    techs: string[];
    onClose: () => void;
    createdBy: string;
}

function ProjectFormModal({ initial, machines, techs, onClose, createdBy }: FormModalProps) {
    const { showToast } = useToast();
    const [f, setF] = useState<Partial<MaintenanceProject>>(() => initial ?? {
        title: '',
        description: '',
        status: 'planned',
        priority: 'medium',
        startDate: new Date().toISOString().slice(0, 10),
        dueDate: '',
        ownerName: createdBy,
        machineIds: [],
        assigneeNames: [],
        budget: 0,
        tasks: [],
        photoUrls: [],
        finalReport: '',
    });
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Demo escape hatch — the tutorial can setF directly via a CustomEvent
    // so it doesn't have to race React-controlled inputs.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as Partial<MaintenanceProject> | undefined;
            if (!detail) return;
            setF(prev => ({ ...prev, ...detail }));
        };
        window.addEventListener('smartmaint-demo-set-projet-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-projet-form', handler);
    }, []);

    const setField = <K extends keyof MaintenanceProject>(k: K, v: MaintenanceProject[K]) =>
        setF(prev => ({ ...prev, [k]: v }));

    const addTask = () => {
        if (!newTaskTitle.trim()) return;
        const task: ProjectTask = { id: uid('t'), title: newTaskTitle.trim(), done: false, doneAt: null };
        setField('tasks', [...(f.tasks || []), task]);
        setNewTaskTitle('');
    };
    const toggleTask = (id: string) => {
        setField('tasks', (f.tasks || []).map(t => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : t));
    };
    const removeTask = (id: string) => {
        setField('tasks', (f.tasks || []).filter(t => t.id !== id));
    };
    const toggleMachine = (mid: string) => {
        const list = f.machineIds || [];
        setField('machineIds', list.includes(mid) ? list.filter(x => x !== mid) : [...list, mid]);
    };
    const toggleTech = (name: string) => {
        const list = f.assigneeNames || [];
        setField('assigneeNames', list.includes(name) ? list.filter(x => x !== name) : [...list, name]);
    };

    const save = async () => {
        if (!f.title?.trim()) { showToast('Titre requis', 'error'); return; }
        setBusy(true);
        try {
            const payload: Omit<MaintenanceProject, 'id' | 'createdAt'> & Partial<Pick<MaintenanceProject, 'id' | 'createdAt'>> = {
                title: f.title.trim(),
                description: f.description || '',
                status: (f.status as Status) || 'planned',
                priority: (f.priority as Priority) || 'medium',
                startDate: f.startDate || null,
                dueDate: f.dueDate || null,
                completedAt: f.status === 'completed' ? (f.completedAt || new Date().toISOString()) : null,
                ownerName: f.ownerName || createdBy,
                machineIds: f.machineIds || [],
                assigneeNames: f.assigneeNames || [],
                budget: Number(f.budget) || 0,
                tasks: f.tasks || [],
                photoUrls: f.photoUrls || [],
                finalReport: f.finalReport || '',
            };
            if (initial) {
                await maintenanceProjectsDb.update(initial.id, payload as Partial<MaintenanceProject>);
                showToast('✅ Projet mis à jour');
            } else {
                await maintenanceProjectsDb.create(payload);
                showToast('✅ Projet créé');
            }
            onClose();
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={initial ? `Modifier — ${initial.title}` : 'Nouveau projet de maintenance'} size="lg"
            footer={<>
                <button onClick={onClose} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                <button data-tour="projet-form-save" onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ opacity: busy ? 0.7 : 1 }}>
                    <Save size={15} /> {initial ? 'Enregistrer' : 'Créer le projet'}
                </button>
            </>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div data-tour="projet-form-title">
                    <label style={lbl}>Titre du projet *</label>
                    <input className="input" value={f.title || ''} onChange={e => setField('title', e.target.value)} placeholder="Ex : Arrêt général — révision annuelle" />
                </div>
                <div data-tour="projet-form-description">
                    <label style={lbl}>Description</label>
                    <textarea className="input" rows={3} value={f.description || ''} onChange={e => setField('description', e.target.value)} placeholder="Objectifs, livrables, contraintes de sécurité…" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <div data-tour="projet-form-status">
                        <label style={lbl}>Statut</label>
                        <select className="input" value={f.status} onChange={e => setField('status', e.target.value as Status)}>
                            {(Object.keys(statusCfg) as Status[]).map(s => <option key={s} value={s}>{statusCfg[s].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Priorité</label>
                        <select className="input" value={f.priority} onChange={e => setField('priority', e.target.value as Priority)}>
                            {(Object.keys(priorityCfg) as Priority[]).map(s => <option key={s} value={s}>{priorityCfg[s].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Budget (MAD)</label>
                        <input className="input" type="number" min={0} step={100} value={f.budget ?? 0} onChange={e => setField('budget', Number(e.target.value) || 0)} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={lbl}>Date de début</label>
                        <input className="input" type="date" value={(f.startDate || '').slice(0, 10)} onChange={e => setField('startDate', e.target.value)} />
                    </div>
                    <div>
                        <label style={lbl}>Échéance</label>
                        <input className="input" type="date" value={(f.dueDate || '').slice(0, 10)} onChange={e => setField('dueDate', e.target.value)} />
                    </div>
                    <div>
                        <label style={lbl}>Chef de projet</label>
                        <input className="input" value={f.ownerName || ''} onChange={e => setField('ownerName', e.target.value)} />
                    </div>
                </div>

                {/* Machines involved */}
                <div>
                    <label style={lbl}>Machines concernées ({(f.machineIds || []).length})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderRadius: 10, background: 'var(--surface-hover)', maxHeight: 140, overflowY: 'auto' }}>
                        {machines.map(m => {
                            const on = (f.machineIds || []).includes(m.id);
                            return (
                                <button key={m.id} type="button" onClick={() => toggleMachine(m.id)} style={{
                                    fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 100,
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    background: on ? '#3b82f6' : 'var(--surface)',
                                    color: on ? 'white' : 'var(--text-primary)',
                                    boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--border)',
                                }}>{on ? '✓ ' : '+ '}{m.code}</button>
                            );
                        })}
                    </div>
                </div>

                {/* Assigned technicians */}
                <div>
                    <label style={lbl}>Techniciens affectés ({(f.assigneeNames || []).length})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderRadius: 10, background: 'var(--surface-hover)', maxHeight: 140, overflowY: 'auto' }}>
                        {techs.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun technicien enregistré</span>}
                        {[...new Set(techs)].map(n => {
                            const on = (f.assigneeNames || []).includes(n);
                            return (
                                <button key={n} type="button" onClick={() => toggleTech(n)} style={{
                                    fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 100,
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    background: on ? '#8b5cf6' : 'var(--surface)',
                                    color: on ? 'white' : 'var(--text-primary)',
                                    boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--border)',
                                }}>{on ? '✓ ' : '+ '}{n}</button>
                            );
                        })}
                    </div>
                </div>

                {/* Tasks checklist */}
                <div>
                    <label style={lbl}><ClipboardCheck size={13} style={{ verticalAlign: -2 }} /> Tâches ({(f.tasks || []).filter(t => t.done).length}/{(f.tasks || []).length})</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input className="input" style={{ flex: 1 }} value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
                            placeholder="Ajouter une tâche (Entrée pour valider)" />
                        <button type="button" onClick={addTask} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--surface-hover)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}><Plus size={14} /></button>
                    </div>
                    {(f.tasks || []).length === 0 ? (
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-hover)', fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Aucune tâche. Découpez le projet en étapes actionnables.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {(f.tasks || []).map(t => (
                                <div key={t.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                                    background: t.done ? 'var(--surface-hover)' : 'var(--surface)',
                                    border: '1px solid var(--border-light)',
                                }}>
                                    <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} style={{ cursor: 'pointer' }} />
                                    <span style={{ flex: 1, fontSize: 13, color: t.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                                    <button type="button" onClick={() => removeTask(t.id)} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}><X size={13} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Photos — data-URL compressed to keep row size sane */}
                <div>
                    <label style={lbl}>Photos ({(f.photoUrls || []).length})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {(f.photoUrls || []).map((url, idx) => (
                            <div key={idx} style={{ position: 'relative', width: 84, height: 84, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Projet" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button type="button" onClick={() => setField('photoUrls', (f.photoUrls || []).filter((_, i) => i !== idx))}
                                    style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        <label style={{ width: 84, height: 84, borderRadius: 10, border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>
                            <input type="file" accept="image/*" multiple disabled={uploading} style={{ display: 'none' }}
                                onChange={async e => {
                                    const files = Array.from(e.target.files || []);
                                    if (files.length === 0) return;
                                    setUploading(true);
                                    const compressed: string[] = [];
                                    for (const file of files) {
                                        try { compressed.push(await compressImage(file)); } catch { /* skip */ }
                                    }
                                    setField('photoUrls', [...(f.photoUrls || []), ...compressed]);
                                    setUploading(false);
                                    e.target.value = '';
                                }} />
                            {uploading ? '…' : '+ ajouter'}
                        </label>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chaque image est redimensionnée à 1200 px max avant enregistrement.</div>
                </div>

                {/* Final report — locked while the project is planned or
                    cancelled. You can only write a closing report when work
                    is in progress or done. Prevents polluting the field
                    before the project has actually started. */}
                <div>
                    <label style={lbl}>Rapport de clôture</label>
                    {(() => {
                        const canWriteReport = f.status === 'in-progress' || f.status === 'completed';
                        if (!canWriteReport) {
                            return (
                                <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-hover)', border: '1px dashed var(--border)', fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Ban size={14} color="var(--text-muted)" />
                                    <span>
                                        Le rapport de clôture s&apos;écrit une fois le projet <b>En cours</b> ou <b>Terminé</b>.
                                        {f.status === 'planned' && ' Mettez le statut à « En cours » pour commencer à documenter le chantier.'}
                                        {f.status === 'cancelled' && ' Ce projet a été annulé — aucun rapport n\'est requis.'}
                                    </span>
                                </div>
                            );
                        }
                        return (
                            <>
                                <textarea className="input" rows={5} value={f.finalReport || ''}
                                    onChange={e => setField('finalReport', e.target.value)}
                                    placeholder="Bilan du projet, écarts vs. plan initial, points d'amélioration, coûts réels, incidents… À finaliser à la clôture." />
                                {f.status === 'completed' && (
                                    <div style={{ marginTop: 6, fontSize: 11.5, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CheckCircle2 size={12} /> Projet terminé — ce rapport devient la trace officielle du chantier.
                                    </div>
                                )}
                                {f.status === 'in-progress' && (
                                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        Vous pouvez déjà commencer à noter les points marquants du chantier. La saisie reste modifiable jusqu&apos;à la clôture.
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Progress preview */}
                {(f.tasks || []).length > 0 && (
                    <div style={{ padding: 12, borderRadius: 10, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TrendingUp size={16} color="var(--primary)" />
                        <span style={{ fontSize: 12.5, color: 'var(--primary)' }}>
                            <b>Avancement automatique :</b> {Math.round(((f.tasks || []).filter(t => t.done).length / (f.tasks || []).length) * 100)}% —
                            {' '}basé sur les cases cochées.
                        </span>
                    </div>
                )}
            </div>
        </Modal>
    );
}

/** Compress an uploaded image to fit within 1200 × 1200 px and JPEG-encode
 *  at ~0.75 quality. Returns a data URL. Keeps the row size manageable
 *  even when the admin uploads 10 phone-camera photos per project. */
async function compressImage(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    const MAX = 1200;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.75);
}

const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
};
