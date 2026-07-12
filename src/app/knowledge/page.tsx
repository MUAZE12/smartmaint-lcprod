'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { knowledgeArticlesDb } from '@/lib/db';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import {
    BookOpen, Search, Wrench, ShieldAlert, Activity, ClipboardList,
    Tag, X, Cpu, Info, Plus, Edit, Trash2, Play, Printer,
} from 'lucide-react';
import type { KnowledgeArticle, KnowledgeCategory, MachineType } from '@/lib/types';

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

interface FormState {
    title: string;
    content: string;
    machineType: MachineType | '';
    category: KnowledgeCategory;
    tags: string;
}
const emptyForm: FormState = { title: '', content: '', machineType: '', category: 'procédure', tags: '' };

const categoryMeta: Record<KnowledgeCategory, { icon: React.ElementType; color: string; bg: string; label: string }> = {
    'procédure': { icon: ClipboardList, color: '#3b82f6', bg: '#eff6ff', label: 'Procédure' },
    'dépannage': { icon: Wrench, color: '#f97316', bg: '#fff7ed', label: 'Dépannage' },
    'sécurité': { icon: ShieldAlert, color: '#ef4444', bg: '#fef2f2', label: 'Sécurité' },
    'étalonnage': { icon: Activity, color: '#8b5cf6', bg: '#f5f3ff', label: 'Étalonnage' },
};

export default function KnowledgePage() {
    const { knowledgeArticles, machines } = useData();
    const { user } = useAuth();
    const { showToast } = useToast();
    const isAdmin = user?.role === 'admin';
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState<KnowledgeCategory | 'all'>('all');
    const [machineTypeFilter, setMachineTypeFilter] = useState<MachineType | 'all'>('all');
    const [openArticle, setOpenArticle] = useState<KnowledgeArticle | null>(null);

    // Admin CRUD state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [busy, setBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm, category: (catFilter !== 'all' ? catFilter : 'procédure') });
        setEditorOpen(true);
    };

    // Demo escape hatch: lets the tutorial set form fields without going
    // through the DOM typing path (which has a long history of subtle
    // React-controlled-textarea sync failures with multi-line markdown).
    // The tour dispatches a CustomEvent and we update state directly.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ field?: string; value?: string }>).detail;
            if (!detail || typeof detail.field !== 'string' || typeof detail.value !== 'string') return;
            const allowed = ['title', 'content', 'tags', 'machineType'] as const;
            if (!(allowed as readonly string[]).includes(detail.field)) return;
            setForm(f => ({ ...f, [detail.field as 'title' | 'content' | 'tags' | 'machineType']: detail.value as string }));
        };
        window.addEventListener('smartmaint-demo-set-knowledge-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-knowledge-form', handler);
    }, []);
    const openEdit = (a: KnowledgeArticle) => {
        setEditingId(a.id);
        setForm({
            title: a.title,
            content: a.content,
            machineType: a.machineType ?? '',
            category: a.category,
            tags: a.tags ?? '',
        });
        setOpenArticle(null);
        setEditorOpen(true);
    };
    const saveArticle = async () => {
        if (!form.title.trim()) { showToast('Le titre est obligatoire', 'error'); return; }
        if (!form.content.trim()) { showToast('Le contenu est obligatoire', 'error'); return; }
        setBusy(true);
        try {
            const payload = {
                title: form.title.trim(),
                content: form.content,
                machineType: form.machineType || null,
                category: form.category,
                tags: form.tags.trim(),
            };
            if (editingId) {
                await knowledgeArticlesDb.update(editingId, payload);
                showToast('Fiche mise à jour');
            } else {
                await knowledgeArticlesDb.create(payload);
                showToast('Fiche ajoutée');
            }
            setEditorOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };
    const deleteArticle = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await knowledgeArticlesDb.remove(deleteTarget.id);
            showToast('Fiche supprimée', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const machineTypes: MachineType[] = useMemo(
        () => Array.from(new Set(machines.map(m => m.type))) as MachineType[],
        [machines]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return knowledgeArticles.filter(a => {
            if (catFilter !== 'all' && a.category !== catFilter) return false;
            if (machineTypeFilter !== 'all' && a.machineType !== machineTypeFilter) return false;
            if (q && !a.title.toLowerCase().includes(q)
                && !a.content.toLowerCase().includes(q)
                && !a.tags.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [knowledgeArticles, search, catFilter, machineTypeFilter]);

    const excerpt = (s: string) => s.replace(/\*\*/g, '').slice(0, 140).replace(/\n+/g, ' · ') + (s.length > 140 ? '…' : '');

    return (
        <>
            <Header title="Base de connaissances" subtitle="Fiches de procédure, dépannage et sécurité L.C PROD" />
            <main style={{ padding: '24px 32px' }}>

                {/* Search + Add */}
                <div data-tour="knowledge-search" className="card" style={{ padding: 14, marginBottom: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Rechercher (titre, contenu, tag…)"
                            style={{ width: '100%', padding: '9px 14px 9px 36px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{visible.length} / {knowledgeArticles.length}</span>
                    {isAdmin && (
                        <button onClick={openCreate} data-tour="page-add" style={{
                            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8,
                            background: 'var(--primary)', color: 'white', border: 'none',
                            fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                            transition: 'background 0.15s ease',
                        }}>
                            <Plus size={16} /> Nouvelle fiche
                        </button>
                    )}
                </div>

                {/* Category chips */}
                <div data-tour="knowledge-cats" style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => setCatFilter('all')} style={chipStyle(catFilter === 'all', '#64748b')}>Toutes catégories</button>
                    {(Object.keys(categoryMeta) as KnowledgeCategory[]).map(c => {
                        const meta = categoryMeta[c];
                        const Icon = meta.icon;
                        return (
                            <button key={c} onClick={() => setCatFilter(c)} style={chipStyle(catFilter === c, meta.color)}>
                                <Icon size={12} /> {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* Machine type chips */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
                    <button onClick={() => setMachineTypeFilter('all')} style={chipStyle(machineTypeFilter === 'all', '#0891b2')}>Tous ateliers</button>
                    {machineTypes.map(t => (
                        <button key={t} onClick={() => setMachineTypeFilter(t)} style={chipStyle(machineTypeFilter === t, '#0891b2')}>
                            {t}
                        </button>
                    ))}
                </div>

                {/* Articles grid */}
                {visible.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                        <BookOpen size={40} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 12, fontSize: 14 }}>Aucune fiche ne correspond à ce filtre.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                        {visible.map(a => {
                            const meta = categoryMeta[a.category];
                            const Icon = meta.icon;
                            return (
                                <button key={a.id} data-tour="knowledge-card" data-knowledge-title={a.title} onClick={() => setOpenArticle(a)} style={{
                                    textAlign: 'left', padding: '18px 18px 14px', borderRadius: 14, cursor: 'pointer',
                                    border: '1px solid var(--border)', background: 'var(--surface)',
                                    display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'inherit',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 9, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={17} />
                                        </div>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {meta.label}
                                        </span>
                                        {a.machineType && (
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: '#ecfeff', color: '#0891b2', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Cpu size={11} /> {a.machineType}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{a.title}</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{excerpt(a.content)}</div>
                                    {a.tags && (
                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 'auto' }}>
                                            {a.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5).map(t => (
                                                <span key={t} style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--surface-hover)', padding: '2px 7px', borderRadius: 100 }}>
                                                    <Tag size={9} /> {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Article reader */}
                {openArticle && (
                    <div onClick={() => setOpenArticle(null)} style={{
                        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 0.2s',
                    }}>
                        <div data-knowledge-article-body onClick={e => e.stopPropagation()} style={{
                            background: 'var(--surface)', borderRadius: 18, maxWidth: 720, width: '100%',
                            maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        }}>
                            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: categoryMeta[openArticle.category].bg, color: categoryMeta[openArticle.category].color, textTransform: 'uppercase' }}>
                                            {categoryMeta[openArticle.category].label}
                                        </span>
                                        {openArticle.machineType && (
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: '#ecfeff', color: '#0891b2', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Cpu size={11} /> {openArticle.machineType}
                                            </span>
                                        )}
                                    </div>
                                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{openArticle.title}</h2>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    {isAdmin && (
                                        <>
                                            <button onClick={() => openEdit(openArticle)} title="Modifier"
                                                style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Edit size={16} />
                                            </button>
                                            <button data-tour="knowledge-reader-delete" onClick={() => setDeleteTarget(openArticle)} title="Supprimer"
                                                style={{ width: 34, height: 34, borderRadius: 10, background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                    <button onClick={() => setOpenArticle(null)} title="Fermer"
                                        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                                {openArticle.content.split('\n').map((line, i) => {
                                    if (line.startsWith('**') && line.endsWith('**')) {
                                        return <div key={i} style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: i > 0 ? 14 : 0, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</div>;
                                    }
                                    return <div key={i}>{line || ' '}</div>;
                                })}
                            </div>
                            {/* T6 — guided run is for TECHNICIANS. Admin gets a
                                Print button instead (they consult / archive the
                                SOP; they don't execute steps). */}
                            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                                {user?.role === 'technician' ? (
                                    <>
                                        <Link data-tour="knowledge-run" href={`/technician/procedure?id=${openArticle.id}`}
                                            onClick={() => setOpenArticle(null)}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 7,
                                                padding: '9px 16px', borderRadius: 8,
                                                background: '#b45309',
                                                color: 'white', fontWeight: 600, fontSize: 13, textDecoration: 'none',
                                                boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                                                transition: 'background 0.15s ease',
                                            }}>
                                            <Play size={15} /> Démarrer la procédure (étape par étape)
                                        </Link>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                                            Chaque étape est minutée et la trace complète est enregistrée pour l&apos;audit HACCP.
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <button data-tour="knowledge-print" onClick={async () => {
                                            const { exportElementToPdf } = await import('@/lib/printToPdf');
                                            const el = document.querySelector('[data-knowledge-article-body]') as HTMLElement | null;
                                            await exportElementToPdf(el, {
                                                filename: `fiche-${openArticle.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`,
                                            });
                                        }}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 7,
                                                padding: '9px 16px', borderRadius: 8,
                                                background: 'var(--primary)',
                                                color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                                boxShadow: '0 1px 0 rgba(11,18,32,0.08)',
                                                transition: 'background 0.15s ease',
                                            }}>
                                            <Printer size={15} /> Imprimer / Exporter en PDF
                                        </button>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                                            L&apos;exécution étape par étape est côté technicien. Vous consultez / archivez la fiche procédure ici.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 22, padding: '12px 16px', borderRadius: 10, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Info size={16} color="var(--primary)" />
                    <span style={{ fontSize: 12.5, color: 'var(--primary)' }}>
                        {isAdmin
                            ? <>Cliquez <b>+ Nouvelle fiche</b> pour ajouter une procédure. Utilisez <code>**Titre de section**</code> pour mettre en gras les en-têtes.</>
                            : <>Les fiches sont synchronisées en temps réel — l&apos;admin peut en ajouter, modifier, supprimer.</>}
                    </span>
                </div>

                {/* ====== ADMIN EDITOR MODAL ====== */}
                <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)}
                    title={editingId ? 'Modifier la fiche' : 'Nouvelle fiche de procédure'}
                    size="lg"
                    footer={<>
                        <button onClick={() => setEditorOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                        <button data-tour="knowledge-form-save" onClick={saveArticle} disabled={busy} className="btn btn-primary btn-sm" style={{ opacity: busy ? 0.7 : 1 }}>
                            {editingId ? 'Mettre à jour' : 'Enregistrer'}
                        </button>
                    </>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={lS}>Titre *</label>
                            <input data-tour="knowledge-form-title" style={iS} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Changer une cartouche filtrante FIL-001" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={lS}>Catégorie *</label>
                                <select style={iS} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as KnowledgeCategory }))}>
                                    {(Object.keys(categoryMeta) as KnowledgeCategory[]).map(c => (
                                        <option key={c} value={c}>{categoryMeta[c].label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={lS}>Atelier concerné</label>
                                <select style={iS} value={form.machineType} onChange={e => setForm(f => ({ ...f, machineType: e.target.value as MachineType | '' }))}>
                                    <option value="">— Général (tous ateliers) —</option>
                                    {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={lS}>Tags (séparés par des virgules)</label>
                            <input style={iS} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                                placeholder="filtre, cartouche, FIL-001, alimentaire" />
                        </div>
                        <div>
                            <label style={lS}>Contenu *</label>
                            <textarea
                                data-tour="knowledge-form-content"
                                style={{ ...iS, minHeight: 280, resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.55 }}
                                value={form.content}
                                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                                placeholder={`**Préparation**\n1. Première étape...\n2. Deuxième étape...\n\n**Démontage**\n3. ...\n\n**⚠ Sécurité**\n- Ne JAMAIS ...`}
                            />
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                💡 Astuce — encadrez les titres de sections avec <code>**deux étoiles**</code> pour les mettre en gras.
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* ====== DELETE CONFIRMATION ====== */}
                <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la fiche" size="sm"
                    footer={<>
                        <button onClick={() => setDeleteTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Annuler</button>
                        <button data-tour="knowledge-delete-confirm" onClick={deleteArticle} disabled={busy} className="btn btn-danger btn-sm">Supprimer</button>
                    </>}>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Trash2 size={28} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500 }}>Supprimer la fiche « {deleteTarget?.title} » ?</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>Cette action est définitive.</p>
                    </div>
                </Modal>
            </main>
        </>
    );
}

function chipStyle(on: boolean, color: string): React.CSSProperties {
    return {
        padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${on ? color : 'var(--border)'}`,
        background: on ? color : 'var(--surface)',
        color: on ? 'white' : 'var(--text-secondary)',
        display: 'inline-flex', alignItems: 'center', gap: 5,
    };
}
