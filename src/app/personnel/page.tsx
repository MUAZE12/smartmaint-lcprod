'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import ImageUpload from '@/components/ui/ImageUpload';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/context/AppContext';
import { useData } from '@/context/DataContext';
import { techniciansDb, personnelDb } from '@/lib/db';
import { Search, Plus, Edit, Trash2, Phone, Mail, AlertTriangle, Send, Calendar, X, Clock, MapPin } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Employee {
    id: string; nom: string; role: 'technicien' | 'operateur';
    specialite: string; telephone: string; email: string; statut: 'actif' | 'inactif';
    imageUrl?: string;
    /** Which Supabase table this row actually lives in. Update/delete route on this,
     *  not on `role`, so a personnel row with role='technicien' still updates correctly. */
    source: 'technicians' | 'personnel';
}

const emptyEmployee: { nom: string; role: 'technicien' | 'operateur'; specialite: string; telephone: string; email: string; statut: 'actif' | 'inactif'; imageUrl: string | undefined } = { nom: '', role: 'technicien', specialite: '', telephone: '', email: '', statut: 'actif', imageUrl: undefined };

const roleConfig = {
    technicien: { label: 'Technicien', color: '#3b82f6', bg: '#eff6ff' },
    operateur: { label: 'Opérateur', color: '#10b981', bg: '#ecfdf5' },
};

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function PersonnelPage() {
    const { showToast } = useToast();
    const { t } = useApp();
    // Combine live technicians (from `technicians` table) + live operators (from `personnel` table)
    const { technicians, personnel } = useData();
    const employees = useMemo<Employee[]>(() => [
        ...technicians.map(tech => ({
            id: tech.id, nom: tech.fullName, role: 'technicien' as const,
            specialite: tech.specialty, telephone: tech.phone, email: tech.email,
            statut: 'actif' as const, imageUrl: undefined,
            source: 'technicians' as const,
        })),
        ...personnel.map(p => ({
            id: p.id, nom: p.nom, role: p.role,
            specialite: p.specialite, telephone: p.telephone, email: p.email,
            statut: p.statut, imageUrl: p.imageUrl,
            source: 'personnel' as const,
        })),
    ], [technicians, personnel]);

    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState<'all' | 'technicien' | 'operateur'>('all');
    const [tab, setTab] = useState<'employees' | 'meetings'>('employees');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Employee | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
    const [form, setForm] = useState(emptyEmployee);

    // ── Convoquer / send-message modal ──
    const [notifyTarget, setNotifyTarget] = useState<Employee | null>(null);
    const [notifyKind, setNotifyKind] = useState<'convocation' | 'message'>('convocation');
    const [notifySubject, setNotifySubject] = useState('');
    const [notifyMessage, setNotifyMessage] = useState('');

    const openNotify = (emp: Employee) => {
        setNotifyTarget(emp);
        setNotifyKind('convocation');
        setNotifySubject('');
        setNotifyMessage('Merci de venir au bureau dès que possible.');
    };

    const sendNotify = async () => {
        if (!notifyTarget) return;
        if (!notifyTarget.email) { showToast("Cet employé n'a pas d'email enregistré", 'error'); return; }
        if (!notifyMessage.trim()) { showToast('Le message est obligatoire', 'error'); return; }
        setBusy(true);
        try {
            const res = await fetch('/api/notify-employee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: notifyTarget.email,
                    name: notifyTarget.nom,
                    subject: notifySubject.trim() || undefined,
                    message: notifyMessage.trim(),
                    kind: notifyKind,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error ?? 'Échec de l\'envoi');
            showToast(data.emailOk ? `Envoyé à ${notifyTarget.nom}` : `Notification créée (email: ${data.error ?? 'échec'})`);
            setNotifyTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    // ── Meetings ──
    interface MeetingRow {
        id: string; title: string; location: string | null;
        starts_at: string; duration_min: number; agenda: string | null;
        attendees: string[]; reminder_sent_at: string | null;
    }
    const [meetings, setMeetings] = useState<MeetingRow[]>([]);
    const [meetingsLoading, setMeetingsLoading] = useState(false);
    const [meetingOpen, setMeetingOpen] = useState(false);
    const [meetingForm, setMeetingForm] = useState({
        title: '', location: '', startsAt: '', durationMin: 60, agenda: '',
        attendees: [] as string[],
    });

    const techniciensWithEmail = useMemo(
        () => employees.filter(e => e.role === 'technicien' && e.email),
        [employees],
    );

    const fetchMeetings = useCallback(async () => {
        setMeetingsLoading(true);
        try {
            const res = await fetch('/api/meetings');
            const data = await res.json();
            if (data.ok) setMeetings(data.meetings ?? []);
        } finally { setMeetingsLoading(false); }
    }, []);

    useEffect(() => {
        if (tab !== 'meetings') return;
        fetchMeetings();
        const ch = supabase.channel('personnel-meetings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchMeetings())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [tab, fetchMeetings]);

    const openCreateMeeting = () => {
        const nowPlus1h = new Date(Date.now() + 60 * 60_000);
        nowPlus1h.setSeconds(0, 0);
        const localIso = new Date(nowPlus1h.getTime() - nowPlus1h.getTimezoneOffset() * 60_000)
            .toISOString().slice(0, 16);
        setMeetingForm({
            title: '', location: 'Bureau du responsable', startsAt: localIso,
            durationMin: 60, agenda: '', attendees: [],
        });
        setMeetingOpen(true);
    };

    const saveMeeting = async () => {
        if (!meetingForm.title.trim()) { showToast('Titre obligatoire', 'error'); return; }
        if (!meetingForm.startsAt) { showToast('Date/heure obligatoire', 'error'); return; }
        if (meetingForm.attendees.length === 0) { showToast('Sélectionnez au moins un technicien', 'error'); return; }
        setBusy(true);
        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: meetingForm.title.trim(),
                    location: meetingForm.location.trim() || undefined,
                    startsAt: new Date(meetingForm.startsAt).toISOString(),
                    durationMin: Number(meetingForm.durationMin) || 60,
                    agenda: meetingForm.agenda.trim() || undefined,
                    attendees: meetingForm.attendees,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error ?? 'Échec');
            showToast(data.emailOk ? `Réunion créée et notifiée (${meetingForm.attendees.length} technicien·s)` : 'Réunion créée, mais l\'email a échoué');
            setMeetingOpen(false);
            await fetchMeetings();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    // Modal-based confirm so the demo can drive cancellation without the
    // browser's native confirm dialog (which blocks the demo loop).
    const [cancelMeetingTarget, setCancelMeetingTarget] = useState<{ id: string; title: string } | null>(null);
    const cancelMeeting = (id: string, title: string) => setCancelMeetingTarget({ id, title });
    const confirmCancelMeeting = async () => {
        if (!cancelMeetingTarget) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/meetings?id=${encodeURIComponent(cancelMeetingTarget.id)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error ?? 'Échec');
            showToast('Réunion annulée');
            setCancelMeetingTarget(null);
            await fetchMeetings();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const toggleAttendee = (email: string) => {
        setMeetingForm(prev => ({
            ...prev,
            attendees: prev.attendees.includes(email)
                ? prev.attendees.filter(e => e !== email)
                : [...prev.attendees, email],
        }));
    };

    const filtered = useMemo(() => employees.filter(e => {
        const matchSearch = e.nom.toLowerCase().includes(search.toLowerCase());
        const matchRole = filterRole === 'all' || e.role === filterRole;
        return matchSearch && matchRole;
    }), [employees, search, filterRole]);

    const openCreate = () => { setEditing(null); setForm(emptyEmployee); setIsModalOpen(true); };

    // Demo escape hatch: the tutorial dispatches a CustomEvent so it can
    // populate the form (especially the required `nom`) without depending
    // on the React-controlled input typing path syncing correctly.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<Partial<typeof emptyEmployee>>).detail;
            if (!detail) return;
            setForm(f => ({ ...f, ...detail }));
        };
        window.addEventListener('smartmaint-demo-set-personnel-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-personnel-form', handler);
    }, []);

    // Demo escape hatch for the meeting form. When the tour sets a title
    // (without datetime/attendees) we auto-fill a valid future datetime
    // (tomorrow at 10:00 local) and pick the first technicien with an
    // email so the API's validators pass.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<Partial<typeof meetingForm>>).detail;
            if (!detail) return;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            const pad = (n: number) => String(n).padStart(2, '0');
            const isoLocal = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
            const firstTech = techniciensWithEmail[0]?.email;
            setMeetingForm(p => ({
                ...p,
                ...detail,
                // Fill the required fields if the demo dispatch left them empty.
                startsAt: detail.startsAt ?? (p.startsAt || isoLocal),
                attendees: (detail.attendees && detail.attendees.length > 0)
                    ? detail.attendees
                    : (p.attendees.length > 0 ? p.attendees : (firstTech ? [firstTech] : [])),
            }));
        };
        window.addEventListener('smartmaint-demo-set-meeting-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-meeting-form', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [techniciensWithEmail]);

    // Demo escape hatch for the notify form (objet + message).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ subject?: string; message?: string }>).detail;
            if (!detail) return;
            if (typeof detail.subject === 'string') setNotifySubject(detail.subject);
            if (typeof detail.message === 'string') setNotifyMessage(detail.message);
        };
        window.addEventListener('smartmaint-demo-set-notify-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-notify-form', handler);
    }, []);
    const openEdit = (e: Employee) => { setEditing(e); setForm({ nom: e.nom, role: e.role, specialite: e.specialite, telephone: e.telephone, email: e.email, statut: e.statut, imageUrl: e.imageUrl }); setIsModalOpen(true); };

    // Technicians live in `technicians`, operators in `personnel`.
    // Helpers to create a row in whichever table the role maps to.
    const createTechnician = () => techniciansDb.create({
        fullName: form.nom, specialty: form.specialite,
        phone: form.telephone, email: form.email, availability: 'disponible',
    });
    const createOperator = () => personnelDb.create({
        nom: form.nom, role: 'operateur', specialite: form.specialite,
        telephone: form.telephone, email: form.email,
        statut: form.statut, imageUrl: form.imageUrl,
    });

    const handleSave = async () => {
        if (!form.nom.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
        setBusy(true);
        try {
            if (editing) {
                // Decide what kind of move this is by where the row actually lives,
                // not by its role label. Routes by `source` so personnel rows with
                // role='technicien' still update / delete correctly.
                const targetSource: 'technicians' | 'personnel' =
                    form.role === 'technicien' ? 'technicians' : 'personnel';
                const tableChanged = editing.source !== targetSource;

                if (tableChanged) {
                    // Cross-table move: delete the source row, create in the target table.
                    if (editing.source === 'technicians') await techniciansDb.remove(editing.id);
                    else await personnelDb.remove(editing.id);
                    if (targetSource === 'technicians') await createTechnician();
                    else await createOperator();
                    showToast('Employé mis à jour (rôle modifié) avec succès');
                } else if (editing.source === 'technicians') {
                    await techniciansDb.update(editing.id, {
                        fullName: form.nom, specialty: form.specialite,
                        phone: form.telephone, email: form.email,
                    });
                    showToast('Employé mis à jour avec succès');
                } else {
                    await personnelDb.update(editing.id, {
                        nom: form.nom, role: form.role, specialite: form.specialite,
                        telephone: form.telephone, email: form.email,
                        statut: form.statut, imageUrl: form.imageUrl,
                    });
                    showToast('Employé mis à jour avec succès');
                }
            } else {
                if (form.role === 'technicien') await createTechnician();
                else await createOperator();
                showToast('Employé ajouté avec succès');
            }
            setIsModalOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            // Route by source table — NOT by role — so duplicates created in the
            // wrong table still get deleted from the right one.
            if (deleteTarget.source === 'technicians') await techniciansDb.remove(deleteTarget.id);
            else await personnelDb.remove(deleteTarget.id);
            showToast('Employé supprimé', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };
    const update = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

    const techCount = employees.filter(e => e.role === 'technicien').length;
    const opCount = employees.filter(e => e.role === 'operateur').length;

    const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <>
            <Header title={t('page.personnel.title')} subtitle={t('page.personnel.subtitle')} />
            <main style={{ padding: '24px 32px' }}>
                {/* Stats */}
                <div data-tour="personnel-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
                    <div className="kpi-card blue">
                        <div className="section-eyebrow" style={{ marginBottom: 8 }}>{t('personnel.totalEmployees')}</div>
                        <div>{employees.length}</div>
                    </div>
                    <div className="kpi-card blue">
                        <div className="section-eyebrow" style={{ marginBottom: 8 }}>{t('personnel.technicians')}</div>
                        <div>{techCount}</div>
                    </div>
                    <div className="kpi-card green">
                        <div className="section-eyebrow" style={{ marginBottom: 8 }}>{t('personnel.operators')}</div>
                        <div>{opCount}</div>
                    </div>
                </div>

                {/* Tab switcher */}
                <div data-tour="personnel-tabs" style={{ display: 'inline-flex', gap: 2, background: 'var(--surface-hover)', borderRadius: 8, padding: 3, marginBottom: 20, border: '1px solid var(--border)' }}>
                    {([
                        { k: 'employees' as const, l: 'Employés', count: employees.length },
                        { k: 'meetings' as const, l: 'Réunions', count: meetings.length },
                    ]).map(t => (
                        <button key={t.k} data-tour={`personnel-tab-${t.k}`} onClick={() => setTab(t.k)} style={{
                            padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                            cursor: 'pointer', border: 'none',
                            background: tab === t.k ? 'var(--surface)' : 'transparent',
                            color: tab === t.k ? 'var(--text-primary)' : 'var(--text-secondary)',
                            boxShadow: tab === t.k ? '0 1px 2px rgba(11,18,32,0.06)' : 'none',
                            display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                        }}>
                            {t.l}
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: tab === t.k ? 'var(--primary-lighter)' : 'transparent', color: tab === t.k ? 'var(--primary)' : 'var(--text-muted)' }}>{t.count}</span>
                        </button>
                    ))}
                </div>

                {/* Toolbar — only visible on Employees tab */}
                {tab === 'employees' && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div data-tour="personnel-search" style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="input" placeholder={t('action.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, padding: '10px 14px 10px 36px', fontSize: 14 }} />
                    </div>
                    <div data-tour="personnel-role-filters" style={{ display: 'flex', gap: 4, background: 'var(--surface-hover)', borderRadius: 8, padding: 3 }}>
                        {[{ k: 'all' as const, l: t('common.all') }, { k: 'technicien' as const, l: t('personnel.technicians') }, { k: 'operateur' as const, l: t('personnel.operators') }].map(f => (
                            <button key={f.k} data-tour="personnel-role-filter" data-role={f.k} onClick={() => setFilterRole(f.k)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: filterRole === f.k ? 'white' : 'transparent', color: filterRole === f.k ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: filterRole === f.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>{f.l}</button>
                        ))}
                    </div>
                    <button onClick={openCreate} data-tour="page-add" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: 'white', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.25)', whiteSpace: 'nowrap' }}>
                        <Plus size={18} /> {t('personnel.add')}
                    </button>
                </div>}

                {/* Table — Employees tab */}
                {tab === 'employees' && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="data-table">
                            <thead><tr><th style={{ width: 60 }}></th><th>{t('personnel.name')}</th><th>{t('personnel.role')}</th><th>{t('personnel.specialty')}</th><th>Contact</th><th>{t('machine.status')}</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filtered.map(emp => {
                                    const rc = roleConfig[emp.role];
                                    return (
                                        <tr key={emp.id} data-tour="personnel-row" data-person-name={emp.nom}>
                                            <td>
                                                {emp.imageUrl ? (
                                                    <img src={emp.imageUrl} alt={emp.nom} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: rc.color }}>{getInitials(emp.nom)}</div>
                                                )}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{emp.nom}</td>
                                            <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: rc.bg, color: rc.color }}>{rc.label}</span></td>
                                            <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.specialite}</td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--text-muted)' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {emp.telephone}</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={10} /> {emp.email}</span>
                                                </div>
                                            </td>
                                            <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: emp.statut === 'actif' ? '#f0fdf4' : '#f1f5f9', color: emp.statut === 'actif' ? '#22c55e' : '#94a3b8' }}>{emp.statut === 'actif' ? t('personnel.active') : t('personnel.inactive')}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button
                                                        data-tour="personnel-notify"
                                                        onClick={() => openNotify(emp)}
                                                        disabled={!emp.email}
                                                        title={emp.email ? `Convoquer ${emp.nom}` : 'Aucun email enregistré'}
                                                        style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: emp.email ? '#f5f3ff' : '#f1f5f9', color: emp.email ? '#8b5cf6' : '#cbd5e1', border: 'none', cursor: emp.email ? 'pointer' : 'not-allowed' }}>
                                                        <Send size={14} />
                                                    </button>
                                                    <button data-tour="personnel-row-edit" onClick={() => openEdit(emp)} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', cursor: 'pointer' }}><Edit size={14} /></button>
                                                    <button data-tour="personnel-row-delete" onClick={() => setDeleteTarget(emp)} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>}

                {/* Meetings tab */}
                {tab === 'meetings' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Réunions planifiées</h3>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Pour les techniciens uniquement. Rappel automatique le matin de chaque réunion.</p>
                            </div>
                            <button data-tour="personnel-add-meeting" onClick={openCreateMeeting} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: 'white', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.25)', whiteSpace: 'nowrap' }}>
                                <Plus size={18} /> Planifier une réunion
                            </button>
                        </div>
                        {meetingsLoading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>}
                        {!meetingsLoading && meetings.length === 0 && (
                            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                                <p style={{ fontSize: 14, margin: 0 }}>Aucune réunion planifiée</p>
                                <p style={{ fontSize: 12, marginTop: 4 }}>Cliquez sur « Planifier une réunion » pour commencer.</p>
                            </div>
                        )}
                        <div style={{ display: 'grid', gap: 12 }}>
                            {meetings.map(m => {
                                const start = new Date(m.starts_at);
                                const isPast = start.getTime() < Date.now();
                                const minsToStart = Math.round((start.getTime() - Date.now()) / 60_000);
                                return (
                                    <div key={m.id} data-tour="personnel-meeting" data-meeting-title={m.title} className="card" style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start', opacity: isPast ? 0.6 : 1 }}>
                                        <div style={{ width: 64, textAlign: 'center', padding: '8px 0', borderRadius: 10, background: isPast ? '#f1f5f9' : '#eff6ff', flexShrink: 0 }}>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: isPast ? '#94a3b8' : '#3b82f6', lineHeight: 1 }}>{start.getDate()}</div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: isPast ? '#94a3b8' : '#1e40af', textTransform: 'uppercase' }}>{start.toLocaleDateString('fr-FR', { month: 'short' })}</div>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{m.title}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {m.duration_min} min</span>
                                                {m.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {m.location}</span>}
                                                {!isPast && minsToStart < 24 * 60 && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 100, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700 }}>
                                                        Dans {minsToStart < 60 ? `${minsToStart} min` : `${Math.round(minsToStart / 60)} h`}
                                                    </span>
                                                )}
                                                {m.reminder_sent_at && <span style={{ fontSize: 11, color: '#16a34a' }}>✓ Rappel envoyé</span>}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {m.attendees.map(email => {
                                                    const person = employees.find(e => e.email === email);
                                                    return (
                                                        <span key={email} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 100, background: '#f1f5f9', color: 'var(--text-secondary)' }}>
                                                            {person?.nom ?? email}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            {m.agenda && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{m.agenda}</p>}
                                        </div>
                                        {!isPast && (
                                            <button data-tour="personnel-meeting-cancel" onClick={() => cancelMeeting(m.id, m.title)} title="Annuler la réunion" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* Create/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? `${t('action.edit')} ${editing.nom}` : t('personnel.add')} size="md"
                footer={<>
                    <button data-tour="personnel-form-cancel" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>{t('action.cancel')}</button>
                    <button data-tour="personnel-form-save" onClick={handleSave} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t('action.save')}</button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Photo upload */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <ImageUpload value={form.imageUrl} onChange={(url) => update('imageUrl', url)} shape="circle" size={100} label={t('personnel.uploadPhoto')} />
                    </div>
                    <div><label style={labelStyle}>{t('personnel.name')} *</label><input data-tour="personnel-form-name" style={inputStyle} value={form.nom} onChange={e => update('nom', e.target.value)} placeholder="Nom et prénom" /></div>
                    <div><label style={labelStyle}>{t('personnel.role')} *</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {(['technicien', 'operateur'] as const).map(r => (<button key={r} onClick={() => update('role', r)} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: form.role === r ? `2px solid ${roleConfig[r].color}` : '2px solid var(--border)', background: form.role === r ? roleConfig[r].bg : 'var(--surface)', color: form.role === r ? roleConfig[r].color : 'var(--text-muted)' }}>
                                {r === 'technicien' ? '🔧 Technicien' : '👷 Opérateur'}
                            </button>))}
                        </div>
                    </div>
                    <div><label style={labelStyle}>{form.role === 'technicien' ? t('personnel.specialty') : t('personnel.zone')}</label><input style={inputStyle} value={form.specialite} onChange={e => update('specialite', e.target.value)} placeholder={form.role === 'technicien' ? 'Ex: Électricité industrielle' : 'Ex: Ligne de conditionnement'} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label style={labelStyle}>{t('personnel.phone')}</label><input style={inputStyle} value={form.telephone} onChange={e => update('telephone', e.target.value)} placeholder="+212 6 XX XX XX XX" /></div>
                        <div><label style={labelStyle}>{t('personnel.email')}</label><input style={inputStyle} type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="nom@smartmaint.ma" /></div>
                    </div>
                </div>
            </Modal>

            {/* Cancel-meeting confirmation — replaces window.confirm so the
                demo can drive cancellation with a Modal-based click. */}
            <Modal isOpen={!!cancelMeetingTarget} onClose={() => setCancelMeetingTarget(null)} title="Annuler la réunion" size="sm"
                footer={<>
                    <button onClick={() => setCancelMeetingTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: busy ? 0.5 : 1 }}>Retour</button>
                    <button data-tour="personnel-meeting-cancel-confirm" onClick={confirmCancelMeeting} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>Annuler la réunion</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#ef4444" /></div>
                    <p style={{ fontSize: 15, fontWeight: 500 }}>Annuler la réunion <b>{cancelMeetingTarget?.title}</b> ?</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Un email d&apos;annulation sera envoyé à tous les conviés.</p>
                </div>
            </Modal>

            {/* Delete Confirmation */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('common.delete.title')} size="sm"
                footer={<>
                    <button onClick={() => setDeleteTarget(null)} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>{t('action.cancel')}</button>
                    <button data-tour="personnel-delete-confirm" onClick={handleDelete} style={{ padding: '10px 24px', borderRadius: 10, background: '#ef4444', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t('action.confirm')}</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#ef4444" /></div>
                    <p style={{ fontSize: 15, fontWeight: 500 }}>{t('action.delete')} <b>{deleteTarget?.nom}</b> ?</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('common.delete.confirm')}</p>
                </div>
            </Modal>

            {/* Convoquer / Send message modal */}
            <Modal isOpen={!!notifyTarget} onClose={() => setNotifyTarget(null)} title={notifyTarget ? `Notifier ${notifyTarget.nom}` : ''} size="md"
                footer={<>
                    <button onClick={() => setNotifyTarget(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>{t('action.cancel')}</button>
                    <button data-tour="personnel-notify-send" onClick={sendNotify} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Send size={14} /> Envoyer
                    </button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelStyle}>Type</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {(['convocation', 'message'] as const).map(k => (
                                <button key={k} onClick={() => setNotifyKind(k)} style={{
                                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    border: notifyKind === k ? '2px solid #8b5cf6' : '2px solid var(--border)',
                                    background: notifyKind === k ? '#f5f3ff' : 'var(--surface)',
                                    color: notifyKind === k ? '#8b5cf6' : 'var(--text-muted)',
                                }}>
                                    {k === 'convocation' ? '📣 Convoquer au bureau' : '📩 Message libre'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Objet (optionnel)</label>
                        <input style={inputStyle} value={notifySubject} onChange={e => setNotifySubject(e.target.value)} placeholder={notifyKind === 'convocation' ? 'Convocation — venir au bureau' : 'Message du responsable'} />
                    </div>
                    <div>
                        <label style={labelStyle}>Message *</label>
                        <textarea data-tour="personnel-notify-message" style={{ ...inputStyle, minHeight: 110, resize: 'vertical', fontFamily: 'inherit' }} value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} placeholder="Texte qui sera envoyé par email et notification in-app" />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                        ✉️ Email envoyé à <b>{notifyTarget?.email || '—'}</b><br />
                        🔔 Notification in-app visible dès qu'il/elle ouvre l'app
                    </p>
                </div>
            </Modal>

            {/* Plan a meeting modal */}
            <Modal isOpen={meetingOpen} onClose={() => setMeetingOpen(false)} title="Planifier une réunion" size="md"
                footer={<>
                    <button onClick={() => setMeetingOpen(false)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>{t('action.cancel')}</button>
                    <button data-tour="personnel-meeting-save" onClick={saveMeeting} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} /> Planifier & notifier
                    </button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelStyle}>Titre *</label>
                        <input data-tour="personnel-meeting-title" style={inputStyle} value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex : Brief sécurité hebdomadaire" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Date & heure *</label>
                            <input style={inputStyle} type="datetime-local" value={meetingForm.startsAt} onChange={e => setMeetingForm(p => ({ ...p, startsAt: e.target.value }))} />
                        </div>
                        <div>
                            <label style={labelStyle}>Durée (min)</label>
                            <input style={inputStyle} type="number" min={5} step={5} value={meetingForm.durationMin} onChange={e => setMeetingForm(p => ({ ...p, durationMin: Number(e.target.value) }))} />
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Lieu</label>
                        <input style={inputStyle} value={meetingForm.location} onChange={e => setMeetingForm(p => ({ ...p, location: e.target.value }))} placeholder="Ex : Salle de réunion / Atelier 2" />
                    </div>
                    <div>
                        <label style={labelStyle}>Ordre du jour</label>
                        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={meetingForm.agenda} onChange={e => setMeetingForm(p => ({ ...p, agenda: e.target.value }))} placeholder="Points à aborder (un par ligne)" />
                    </div>
                    <div>
                        <label style={labelStyle}>Techniciens conviés * ({meetingForm.attendees.length}/{techniciensWithEmail.length})</label>
                        {techniciensWithEmail.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12, background: '#fef3c7', borderRadius: 8 }}>
                                Aucun technicien avec email. Ajoutez l'email dans la fiche employé pour pouvoir les convier.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {techniciensWithEmail.map(t => {
                                    const checked = meetingForm.attendees.includes(t.email);
                                    return (
                                        <button key={t.id} type="button" onClick={() => toggleAttendee(t.email)} style={{
                                            padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                                            cursor: 'pointer',
                                            border: checked ? '1px solid #3b82f6' : '1px solid var(--border)',
                                            background: checked ? '#eff6ff' : 'var(--surface)',
                                            color: checked ? '#1e40af' : 'var(--text-muted)',
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                        }}>
                                            {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />}
                                            {t.nom}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                        ✉️ Chaque convié recevra l'email immédiatement.<br />
                        📨 Un rappel automatique sera envoyé le matin même de la réunion.
                    </p>
                </div>
            </Modal>
        </>
    );
}
