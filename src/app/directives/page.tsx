'use client';

// ============================================================
// O5 — Consignes / Directives (admin side)
// Compose directives operators must acknowledge before starting
// a shift, and see who has acknowledged each one.
// ============================================================

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { directivesDb } from '@/lib/db';
import type { Directive } from '@/lib/types';
import { useMemo, useState, useEffect } from 'react';
import { Megaphone, Plus, Power, Trash2, Users, Check, X, AlertTriangle } from 'lucide-react';

export default function DirectivesPage() {
    const { user } = useAuth();
    const { directives, directiveAcks, personnel } = useData();
    const { showToast } = useToast();
    const [showNew, setShowNew] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Directive | null>(null);
    const [busy, setBusy] = useState(false);

    const operatorNames = useMemo(
        () => personnel.filter(p => p.role === 'operateur').map(p => p.nom),
        [personnel]);

    const sorted = useMemo(
        () => [...directives].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)),
        [directives]);

    const toggle = async (d: Directive) => {
        try { await directivesDb.update(d.id, { active: !d.active }); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };
    const remove = (d: Directive) => setDeleteTarget(d);
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try { await directivesDb.remove(deleteTarget.id); showToast('Consigne supprimée'); setDeleteTarget(null); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    return (
        <>
            <Header title="Consignes du jour" subtitle="Diffusion + suivi des accusés de réception (O5)" />
            <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }} className="animate-fade-in">

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button onClick={() => setShowNew(true)} data-tour="directive-new" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: 'var(--primary)',
                        color: 'white', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                        transition: 'background 0.15s ease',
                    }}><Plus size={15} /> Nouvelle consigne</button>
                </div>

                {sorted.length === 0 ? (
                    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Aucune consigne. Cliquez « Nouvelle consigne » pour en publier une.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {sorted.map(d => {
                            // Diffusion nominative : `targetOperators` null / vide ⇒ tous.
                            // Sinon on n'affiche que la liste ciblée.
                            const targets = d.targetOperators && d.targetOperators.length > 0
                                ? d.targetOperators
                                : operatorNames;
                            const acks = directiveAcks.filter(a => a.directiveId === d.id);
                            const ackedNames = new Set(acks.map(a => a.operatorName));
                            const pending = targets.filter(n => !ackedNames.has(n));
                            return (
                                <div key={d.id} data-tour="directive-card" data-directive-title={d.title} className="card" style={{
                                    padding: 18,
                                    borderInlineStart: '4px solid ' + (d.active ? '#3b82f6' : '#94a3b8'),
                                    opacity: d.active ? 1 : 0.7,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                        <Megaphone size={20} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700, fontSize: 15 }}>{d.title}</span>
                                                {!d.active && (
                                                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#f1f5f9', color: '#475569', textTransform: 'uppercase' }}>archivée</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{d.content}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                                Publié par <b>{d.publishedBy}</b> · {new Date(d.publishedAt).toLocaleString('fr-FR')}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => toggle(d)} title={d.active ? 'Archiver' : 'Réactiver'}
                                                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Power size={14} />
                                            </button>
                                            <button data-tour="directive-delete" onClick={() => remove(d)} title="Supprimer"
                                                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--surface-hover)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                                            <Users size={12} /> Accusés de réception ({acks.length} / {targets.length})
                                            {d.targetOperators && d.targetOperators.length > 0 && (
                                                <span style={{ marginInlineStart: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(59,130,246,0.15)', color: '#1e40af', textTransform: 'none', letterSpacing: 0 }}>
                                                    diffusion nominative
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                            {targets.map(n => {
                                                const acked = ackedNames.has(n);
                                                return (
                                                    <span key={n} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 100,
                                                        background: acked ? '#f0fdf4' : '#fef2f2',
                                                        color: acked ? '#15803d' : '#9f1239',
                                                    }}>
                                                        {acked ? <Check size={11} /> : <X size={11} />} {n}
                                                    </span>
                                                );
                                            })}
                                            {targets.length === 0 && (
                                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Aucun opérateur enregistré.</span>
                                            )}
                                            {pending.length === 0 && targets.length > 0 && (
                                                <span style={{ marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: '#15803d' }}>✓ Tous les opérateurs ciblés ont accusé</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {showNew && <NewDirectiveModal publishedBy={user?.name ?? 'Admin'} onClose={() => setShowNew(false)} operators={operatorNames} />}

            {/* Delete confirmation — Modal-based so the demo can drive it. */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la consigne" size="sm"
                footer={<>
                    <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                    <button data-tour="directive-delete-confirm" onClick={confirmDelete} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#ef4444" /></div>
                    <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer la consigne <b>{deleteTarget?.title}</b> ?</p>
                </div>
            </Modal>
        </>
    );
}

function NewDirectiveModal({ publishedBy, onClose, operators }: { publishedBy: string; onClose: () => void; operators: string[] }) {
    const { showToast } = useToast();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    // Empty set ⇒ envoyer à TOUS. Any name added ⇒ envoyer uniquement à ces
    // opérateurs. La valeur envoyée à Supabase reflète ce choix (null = tous).
    const [targets, setTargets] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    // Demo escape hatch — the tour can dispatch a CustomEvent to populate
    // title + content so the Publier button passes validation reliably.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ title?: string; content?: string; targets?: string[] }>).detail;
            if (!detail) return;
            if (typeof detail.title === 'string') setTitle(detail.title);
            if (typeof detail.content === 'string') setContent(detail.content);
            if (Array.isArray(detail.targets)) setTargets(new Set(detail.targets));
        };
        window.addEventListener('smartmaint-demo-set-directive-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-directive-form', handler);
    }, []);

    const toggleTarget = (name: string) => {
        setTargets(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };
    const selectAll = () => setTargets(new Set(operators));
    const clearAll = () => setTargets(new Set());

    const save = async () => {
        if (!title.trim() || !content.trim()) { showToast('Titre et contenu requis', 'error'); return; }
        setBusy(true);
        try {
            await directivesDb.create({
                title: title.trim(), content: content.trim(),
                publishedBy, publishedAt: new Date().toISOString(),
                expiresAt: null, active: true,
                targetOperators: targets.size === 0 ? null : Array.from(targets),
            });
            showToast(targets.size === 0 ? '✅ Consigne publiée à tous les opérateurs' : `✅ Consigne publiée à ${targets.size} opérateur(s)`);
            onClose();
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    const targetCount = targets.size;
    const targetLabel = targetCount === 0
        ? `Diffusée à TOUS les opérateurs (${operators.length})`
        : `Diffusée à ${targetCount} opérateur(s) sur ${operators.length}`;

    return (
        <Modal isOpen={true} onClose={onClose} title="Publier une consigne du jour">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                    <label style={lblS}>Titre court</label>
                    <input data-tour="directive-form-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Aujourd'hui : huile vierge extra uniquement" />
                </div>
                <div>
                    <label style={lblS}>Contenu</label>
                    <textarea data-tour="directive-form-content" className="input" rows={5} value={content} onChange={e => setContent(e.target.value)}
                        placeholder="Décrivez la consigne que les opérateurs doivent acquitter avant de démarrer leur poste..." />
                </div>

                {/* Target operators — click to select/deselect. Empty = all. */}
                <div data-tour="directive-form-targets">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label style={lblS}>Destinataires — cliquez pour cibler</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={selectAll} style={miniBtn}>Tout sélectionner</button>
                            <button type="button" onClick={clearAll} style={miniBtn}>Tout désélectionner</button>
                        </div>
                    </div>
                    {operators.length === 0 ? (
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-hover)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                            Aucun opérateur enregistré — allez dans Personnel pour en ajouter.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, borderRadius: 10, background: 'var(--surface-hover)', maxHeight: 160, overflowY: 'auto' }}>
                            {operators.map(n => {
                                const selected = targets.has(n);
                                return (
                                    <button key={n} type="button" onClick={() => toggleTarget(n)} data-tour="directive-form-target-chip" data-op-name={n} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 100,
                                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                        background: selected ? '#3b82f6' : 'var(--surface)',
                                        color: selected ? 'white' : 'var(--text-primary)',
                                        boxShadow: selected ? 'none' : 'inset 0 0 0 1px var(--border)',
                                    }}>
                                        {selected ? '✓' : '+'} {n}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>{targetLabel}</div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button onClick={onClose} className="btn btn-secondary">Annuler</button>
                    <button data-tour="directive-form-publish" onClick={save} disabled={busy} style={{
                        padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                        color: 'white', fontWeight: 700, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer',
                        fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
                    }}>{busy ? 'Publication…' : 'Publier'}</button>
                </div>
            </div>
        </Modal>
    );
}

const miniBtn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text-secondary)',
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

const lblS: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
