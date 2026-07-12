'use client';

import Header from '@/components/Header';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { shiftNotesDb } from '@/lib/db';
import { useState, useMemo, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import {
    Notebook, AlertTriangle, AlertOctagon, Info, CheckCircle, Send,
    Cpu, User, Clock, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import VoiceDictationButton from '@/components/VoiceDictationButton';
import type { ShiftNote, ShiftNotePriority } from '@/lib/types';

const prioMeta: Record<ShiftNotePriority, { color: string; bg: string; icon: React.ElementType; label: string }> = {
    'info': { color: '#3b82f6', bg: '#eff6ff', icon: Info, label: 'Info' },
    'warning': { color: '#f59e0b', bg: '#fffbeb', icon: AlertTriangle, label: 'À surveiller' },
    'critical': { color: '#ef4444', bg: '#fef2f2', icon: AlertOctagon, label: 'Urgent' },
};

function relTime(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
}

export default function HandoverPage() {
    const { user } = useAuth();
    const { shiftNotes, machines } = useData();
    const { showToast } = useToast();
    const meName = user?.name ?? '';
    const isAdmin = user?.role === 'admin';

    const [content, setContent] = useState('');

    // Demo escape hatch — the tour can dispatch a CustomEvent to populate
    // the textarea content so the Publier button passes validation.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ content?: string }>).detail;
            if (!detail) return;
            if (typeof detail.content === 'string') setContent(detail.content);
        };
        window.addEventListener('smartmaint-demo-set-handover-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-handover-form', handler);
    }, []);
    const [priority, setPriority] = useState<ShiftNotePriority>('info');
    const [machineId, setMachineId] = useState('');
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

    const ordered = useMemo(() => {
        return [...shiftNotes].sort((a, b) => {
            // unresolved first, then by recency
            const ar = a.resolvedAt ? 1 : 0;
            const br = b.resolvedAt ? 1 : 0;
            if (ar !== br) return ar - br;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
    }, [shiftNotes]);

    const visible = useMemo(() => ordered.filter(n =>
        filter === 'all' ? true :
        filter === 'open' ? !n.resolvedAt :
        !!n.resolvedAt
    ), [ordered, filter]);

    const open = ordered.filter(n => !n.resolvedAt).length;
    const urgent = ordered.filter(n => !n.resolvedAt && n.priority === 'critical').length;

    const submit = async () => {
        if (!content.trim()) { showToast('Le message ne peut pas être vide', 'error'); return; }
        if (!meName) { showToast('Connectez-vous pour laisser une note', 'error'); return; }
        setBusy(true);
        try {
            await shiftNotesDb.create({
                content: content.trim(),
                priority,
                machineId: machineId || null,
                createdBy: meName,
                resolvedBy: null,
                resolvedAt: null,
            });
            setContent('');
            setMachineId('');
            setPriority('info');
            showToast('✅ Note de quart enregistrée');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const resolveNote = async (n: ShiftNote) => {
        setBusy(true);
        try {
            await shiftNotesDb.update(n.id, {
                resolvedBy: meName || 'Inconnu',
                resolvedAt: new Date().toISOString(),
            });
            showToast('✅ Note marquée comme prise en charge');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const reopenNote = async (n: ShiftNote) => {
        setBusy(true);
        try {
            await shiftNotesDb.update(n.id, { resolvedBy: null, resolvedAt: null });
            showToast('↻ Note rouverte');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const [deleteTarget, setDeleteTarget] = useState<ShiftNote | null>(null);
    const deleteNote = (n: ShiftNote) => setDeleteTarget(n);
    const confirmDeleteNote = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await shiftNotesDb.remove(deleteTarget.id);
            showToast('Note supprimée', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

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
            <Header title="Carnet de quart" subtitle="Continuité entre les équipes — laissez un mot pour la relève" />
            <main style={{ padding: '24px 32px', maxWidth: 900 }}>

                <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    {kpi('Notes ouvertes', open, open ? '#3b82f6' : '#16a34a', <Notebook size={13} />)}
                    {kpi('Urgentes', urgent, urgent ? '#dc2626' : '#16a34a', <AlertOctagon size={13} />)}
                    {kpi('Total', ordered.length, '#8b5cf6', <Info size={13} />)}
                </div>

                {/* Compose */}
                <div data-tour="handover-compose" className="card" style={{ padding: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Send size={16} color="#3b82f6" />
                        <h3 style={{ fontSize: 14, fontWeight: 700 }}>Laisser un mot pour la prochaine équipe</h3>
                    </div>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                        <textarea
                            data-tour="handover-text"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Ex : REM-001 démarre avec un bruit léger — à surveiller. Cartouche filtre changée."
                            style={{ width: '100%', padding: '12px 56px 12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none', minHeight: 80, resize: 'vertical' }}
                        />
                        <span data-tour="handover-mic" style={{ position: 'absolute', right: 8, bottom: 10 }}>
                            <VoiceDictationButton
                                onTranscribed={txt => setContent(c => (c.trim() ? c.trim() + ' ' + txt : txt))}
                                title="Dictée vocale — le texte sera ajouté au message"
                            />
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div data-tour="handover-priority" style={{ display: 'flex', gap: 6 }}>
                            {(['info', 'warning', 'critical'] as ShiftNotePriority[]).map(p => {
                                const meta = prioMeta[p];
                                const on = priority === p;
                                const Icon = meta.icon;
                                return (
                                    <button key={p} onClick={() => setPriority(p)} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '7px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                                        border: `1px solid ${on ? meta.color : 'var(--border)'}`,
                                        background: on ? meta.color : 'var(--surface)',
                                        color: on ? 'white' : 'var(--text-secondary)',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                    }}><Icon size={12} /> {meta.label}</button>
                                );
                            })}
                        </div>
                        <select value={machineId} onChange={e => setMachineId(e.target.value)}
                            data-tour="handover-machine"
                            style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary)' }}>
                            <option value="">— Aucune machine —</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                        </select>
                        <button onClick={submit} disabled={busy} data-tour="handover-publish" style={{
                            marginLeft: 'auto', padding: '8px 16px', borderRadius: 8,
                            background: 'var(--primary)', color: 'white', border: 'none',
                            fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontSize: 13,
                            display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.7 : 1,
                            boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                            transition: 'background 0.15s ease',
                        }}>
                            <Send size={14} /> Publier
                        </button>
                    </div>
                </div>

                {/* Filter chips */}
                <div data-tour="handover-filter" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {(['open', 'all', 'resolved'] as const).map(f => {
                        const label = f === 'open' ? 'Ouvertes' : f === 'all' ? 'Toutes' : 'Résolues';
                        const on = filter === f;
                        return (
                            <button key={f} onClick={() => setFilter(f)} style={{
                                padding: '6px 13px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                border: `1px solid ${on ? '#3b82f6' : 'var(--border)'}`,
                                background: on ? '#3b82f6' : 'var(--surface)',
                                color: on ? 'white' : 'var(--text-secondary)',
                            }}>{label}</button>
                        );
                    })}
                </div>

                {/* Notes list */}
                {visible.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <Notebook size={40} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune note dans cette catégorie.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {visible.map(n => {
                            const meta = prioMeta[n.priority];
                            const Icon = meta.icon;
                            const resolved = !!n.resolvedAt;
                            const m = n.machineId ? machines.find(x => x.id === n.machineId) : null;
                            return (
                                <div key={n.id} data-tour="handover-note" data-note-content={n.content} className="card" style={{
                                    padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
                                    opacity: resolved ? 0.6 : 1,
                                    borderLeft: `4px solid ${meta.color}`,
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                        background: meta.bg, color: meta.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Icon size={17} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: meta.bg, color: meta.color, textTransform: 'uppercase' }}>
                                                {meta.label}
                                            </span>
                                            {m && (
                                                <Link href={`/machines/${m.id}`} style={{ fontSize: 11.5, color: '#0891b2', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Cpu size={11} /> {m.code}
                                                </Link>
                                            )}
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <User size={11} /> {n.createdBy}
                                            </span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Clock size={11} /> {relTime(n.createdAt)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                            {n.content}
                                        </div>
                                        {resolved && (
                                            <div style={{ fontSize: 11.5, color: '#16a34a', marginTop: 6, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <CheckCircle size={12} /> Pris en charge par {n.resolvedBy} {n.resolvedAt && `· ${relTime(n.resolvedAt)}`}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: 'column' }}>
                                        {resolved ? (
                                            <button onClick={() => reopenNote(n)} disabled={busy} style={{
                                                fontSize: 11.5, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                                                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                                color: 'var(--text-secondary)', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                            }}>Rouvrir</button>
                                        ) : (
                                            <button onClick={() => resolveNote(n)} disabled={busy} style={{
                                                fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
                                                background: '#16a34a', border: 'none', color: 'white',
                                                cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                            }}><CheckCircle size={12} /> Pris en charge</button>
                                        )}
                                        {(isAdmin || n.createdBy === meName) && (
                                            <button data-tour="handover-note-delete" onClick={() => deleteNote(n)} disabled={busy} title="Supprimer" style={{
                                                fontSize: 11, padding: '5px 10px', borderRadius: 8,
                                                background: 'transparent', border: '1px solid var(--border)',
                                                color: '#ef4444', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}><Trash2 size={11} /></button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{ marginTop: 22, padding: '12px 16px', borderRadius: 10, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--primary)' }}>
                    <Info size={16} />
                    Toutes les équipes voient ce carnet en temps réel. Marquez une note <b>Pris en charge</b> quand vous l&apos;avez traitée — elle sera grisée mais reste lisible.
                </div>

                {/* Delete confirmation — Modal-based so the demo can drive it. */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la note" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="handover-note-delete-confirm" onClick={confirmDeleteNote} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#ef4444" /></div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer définitivement cette note ?</p>
                    </div>
                </Modal>
            </main>
        </>
    );
}
