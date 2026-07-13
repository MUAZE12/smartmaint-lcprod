'use client';

import { Bell, Search, X, Cpu, Package, Wrench, Users, CheckCheck, Compass, ArrowRight, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useData } from '@/context/DataContext';
import { buildLiveNotifications } from '@/lib/notifications';
import { useDbNotifications } from '@/lib/useDbNotifications';
import { technicians } from '@/lib/data';
import Link from 'next/link';
import UserProfile from '@/components/UserProfile';
import OfflineIndicator from '@/components/OfflineIndicator';

interface HeaderProps {
    title: string;
    subtitle?: string;
}

// Page zoom levels (applied via CSS `zoom` on <html>). 100% is index 3.
const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25];
const ZOOM_DEFAULT_IDX = 3;

// Accent-insensitive normaliser — so "etalonnage" matches "Étalonnage".
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Every navigable page, with extra search keywords. Searching a page name
// (e.g. "pièces de rechange") yields a clickable result that opens the page.
interface NavPage { href: string; label: string; keywords: string; roles: string[] }
const NAV_PAGES: NavPage[] = [
    { href: '/dashboard', label: 'Tableau de bord', keywords: 'dashboard accueil kpi', roles: ['admin'] },
    { href: '/machines', label: 'Machines', keywords: 'equipements parc', roles: ['admin'] },
    { href: '/interventions', label: 'Interventions', keywords: 'ordres de travail ot pannes reparations', roles: ['admin'] },
    { href: '/maintenance-plans', label: 'Plans préventifs', keywords: 'preventif planning maintenance', roles: ['admin'] },
    { href: '/synoptique', label: 'Synoptique usine', keywords: 'plan usine process flux', roles: ['admin'] },
    { href: '/control-room', label: 'Salle de contrôle', keywords: 'control room mur etat', roles: ['admin'] },
    { href: '/oee', label: 'TRS / OEE', keywords: 'trs oee rendement performance', roles: ['admin'] },
    { href: '/predictif', label: 'Maintenance prédictive', keywords: 'predictif rul sante pronostic', roles: ['admin'] },
    { href: '/energie', label: 'Suivi énergétique', keywords: 'energie electricite kwh consommation cout co2', roles: ['admin'] },
    { href: '/haccp', label: 'Conformité HACCP', keywords: 'haccp securite alimentaire hygiene', roles: ['admin'] },
    { href: '/calibration', label: 'Étalonnage', keywords: 'etalonnage calibration metrologie certificat instrument', roles: ['admin'] },
    { href: '/checklists', label: 'Check-lists OT', keywords: 'checklist controle liste', roles: ['admin'] },
    { href: '/approvals', label: 'Validations', keywords: 'validation approbation approvals', roles: ['admin'] },
    { href: '/personnel', label: 'Personnel', keywords: 'equipe techniciens operateurs staff', roles: ['admin'] },
    { href: '/spare-parts', label: 'Pièces de rechange', keywords: 'pieces rechange stock magasin approvisionnement consommables fournisseurs', roles: ['admin'] },
    { href: '/reports', label: 'Rapports', keywords: 'rapports analyses statistiques pareto', roles: ['admin'] },
    { href: '/alertes', label: 'Alertes e-mail', keywords: 'alertes email notifications', roles: ['admin'] },
    { href: '/audit', label: "Journal d'audit", keywords: 'audit journal historique tracabilite log', roles: ['admin'] },
    { href: '/settings', label: 'Paramètres', keywords: 'parametres reglages configuration settings', roles: ['admin'] },
    { href: '/technician/dashboard', label: 'Tableau de bord', keywords: 'dashboard accueil', roles: ['technician'] },
    { href: '/technician/report', label: 'Mes interventions', keywords: 'interventions rapports', roles: ['technician'] },
    { href: '/technician/scanner', label: 'Scanner machine', keywords: 'scanner qr code', roles: ['technician'] },
    { href: '/operator/dashboard', label: 'Tableau de bord', keywords: 'dashboard accueil', roles: ['operator'] },
    { href: '/operator/report-breakdown', label: 'Déclarer une panne', keywords: 'panne breakdown declaration', roles: ['operator'] },
];

// Shared style for every search-result row — keeps them all aligned.
const resultRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
    textDecoration: 'none', color: 'var(--text-primary)', fontSize: 13,
    transition: 'background 0.15s', borderRadius: 6, margin: '0 8px',
};

export default function Header({ title, subtitle }: HeaderProps) {
    const { user } = useAuth();
    const { t, locale } = useApp();
    const { machines, interventions, spareParts, purchaseOrders, maintenancePlans } = useData();
    const [notifOpen, setNotifOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [profileOpen, setProfileOpen] = useState(false);
    const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT_IDX);
    const skipFirstZoomApply = useRef(true);
    const notifRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load the saved zoom level on first mount (avoids SSR hydration mismatch).
    useEffect(() => {
        const saved = localStorage.getItem('smartmaint-zoom-level');
        if (saved != null) {
            const n = Number(saved);
            if (Number.isInteger(n) && n >= 0 && n < ZOOM_LEVELS.length) setZoomIdx(n);
        }
    }, []);

    // Apply + persist on every change after the initial mount.
    // Zoom is applied to the whole documentElement (original behaviour).
    // The two things that used to break with zoom are now handled at the
    // consumer site:
    //   • Sidebar submenu — uses position: absolute anchored to the row,
    //     no viewport coordinate math (immune to zoom).
    //   • PDF export — printToPdf temporarily resets zoom before running
    //     html2canvas and restores it after (see lib/printToPdf.ts).
    useEffect(() => {
        if (skipFirstZoomApply.current) { skipFirstZoomApply.current = false; return; }
        (document.documentElement.style as unknown as { zoom: string }).zoom =
            String(ZOOM_LEVELS[zoomIdx]);
        // Clear the previous scoped-content property so downstream CSS
        // stops trying to double-apply.
        document.documentElement.style.removeProperty('--content-zoom');
        localStorage.setItem('smartmaint-zoom-level', String(zoomIdx));
    }, [zoomIdx]);

    // Live notification feed — derived from Supabase data, not mock
    const derived = useMemo(
        () => user ? buildLiveNotifications({ machines, interventions, spareParts, purchaseOrders, maintenancePlans }, user.role) : [],
        [user, machines, interventions, spareParts, purchaseOrders, maintenancePlans],
    );
    // Targeted in-app notifications (convocations, meetings, reminders) — from the `notifications` table
    const dbNotifs = useDbNotifications(user?.email);
    const notifications = useMemo(
        () => [...dbNotifs.list, ...derived],
        [dbNotifs.list, derived],
    );

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) { setSearchOpen(false); setSearchQuery(''); }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Ctrl+K shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
            }
            if (e.key === 'Escape') { setSearchOpen(false); setNotifOpen(false); setSearchQuery(''); }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // DB notifications start as "unread" if they are in dbNotifs.unreadIds and not locally dismissed.
    // Derived notifications start as "unread" if not locally dismissed.
    const unreadCount = notifications.filter(n => {
        if (dismissed.has(n.id)) return false;
        if (n.id.startsWith('db-')) return dbNotifs.unreadIds.has(n.id);
        return true;
    }).length;

    const markAllRead = () => {
        setDismissed(new Set(notifications.map(n => n.id)));
        dbNotifs.markAllReadDb();
    };

    // Search logic with role filtering
    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || !user) return null;
        const q = searchQuery.toLowerCase();
        const nq = norm(searchQuery.trim());
        const role = user.role;

        const results: { pages: NavPage[]; machines: typeof machines; parts: typeof spareParts; intv: typeof interventions; staff: { id: string; name: string; role: string }[] } = {
            pages: [], machines: [], parts: [], intv: [], staff: [],
        };

        // Navigation — searching a page name jumps straight to that page
        results.pages = NAV_PAGES
            .filter(p => p.roles.includes(role))
            .filter(p => norm(p.label).includes(nq) || norm(p.keywords).includes(nq))
            .slice(0, 6);

        // All roles can search machines
        results.machines = machines.filter(m => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 4);

        if (role === 'admin' || role === 'technician') {
            results.parts = spareParts.filter(p => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q)).slice(0, 4);
        }

        if (role === 'admin') {
            results.intv = interventions.filter(i => i.description.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 4);
            const allStaff = [
                ...technicians.map(t => ({ id: t.id, name: t.fullName, role: 'Technicien' })),
                { id: 'op-001', name: 'Karim Benjelloun', role: 'Opérateur' },
                { id: 'op-002', name: 'Fatima Zahra', role: 'Opérateur' },
            ];
            results.staff = allStaff.filter(s => s.name.toLowerCase().includes(q)).slice(0, 4);
        } else if (role === 'technician') {
            results.intv = interventions.filter(i => i.technicianId === 'tech-001' && (i.description.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))).slice(0, 4);
        } else {
            // operator: only own tickets (simulate)
            results.intv = interventions.filter(i => i.description.toLowerCase().includes(q)).slice(0, 2);
        }

        const hasResults = results.pages.length > 0 || results.machines.length > 0 || results.parts.length > 0 || results.intv.length > 0 || results.staff.length > 0;
        return hasResults ? results : null;
    }, [searchQuery, user, machines, spareParts, interventions]);

    const timeAgo = useCallback((ts: string) => {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        const lang = locale?.language === 'ar' ? 'ar' : locale?.language === 'en' ? 'en' : 'fr';
        if (lang === 'ar') {
            if (mins < 60) return `منذ ${mins}د`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `منذ ${hrs}س`;
            return `منذ ${Math.floor(hrs / 24)}ي`;
        }
        if (lang === 'en') {
            if (mins < 60) return `${mins}min ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            return `${Math.floor(hrs / 24)}d ago`;
        }
        if (mins < 60) return `il y a ${mins}min`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `il y a ${hrs}h`;
        return `il y a ${Math.floor(hrs / 24)}j`;
    }, [locale]);

    return (
        <header data-tour="page-header" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 28px', background: 'var(--surface)',
            // z-index above the technician FAB (z 50) so the notifications /
            // search dropdowns inside the header always render on top of the
            // page's floating action buttons.
            borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100,
            boxShadow: '0 1px 0 rgba(11, 18, 32, 0.02)',
        }}>
            <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 19, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</h1>
                {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>{subtitle}</p>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* ===================== ZOOM ===================== */}
                <div title="Zoom de l'affichage (Ctrl + - / Ctrl + +)" style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    height: 40, padding: 3, borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                }}>
                    <button onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
                        disabled={zoomIdx === 0} aria-label="Réduire l'affichage"
                        style={{
                            width: 30, height: 30, border: 'none', borderRadius: 6,
                            background: 'none', cursor: zoomIdx === 0 ? 'not-allowed' : 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: zoomIdx === 0 ? 0.35 : 1, transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (zoomIdx !== 0) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <ZoomOut size={15} />
                    </button>
                    <span style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                        minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                    }}>{Math.round(ZOOM_LEVELS[zoomIdx] * 100)}%</span>
                    <button onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                        disabled={zoomIdx === ZOOM_LEVELS.length - 1} aria-label="Agrandir l'affichage"
                        style={{
                            width: 30, height: 30, border: 'none', borderRadius: 6,
                            background: 'none', cursor: zoomIdx === ZOOM_LEVELS.length - 1 ? 'not-allowed' : 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: zoomIdx === ZOOM_LEVELS.length - 1 ? 0.35 : 1, transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (zoomIdx !== ZOOM_LEVELS.length - 1) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <ZoomIn size={15} />
                    </button>
                </div>

                {/* ===================== SEARCH ===================== */}
                <div ref={searchRef} style={{ position: 'relative' }}>
                    <button onClick={() => { setSearchOpen(!searchOpen); setNotifOpen(false); setTimeout(() => searchInputRef.current?.focus(), 100); }}
                        style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            border: searchOpen ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                            background: 'var(--surface)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: searchOpen ? 'var(--primary)' : 'var(--text-secondary)', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
                        onMouseLeave={e => { if (!searchOpen) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                    >
                        <Search size={18} />
                    </button>

                    {searchOpen && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 8px)',
                            ...(locale.language === 'ar' ? { left: 0 } : { right: 0 }),
                            width: 480, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface)',
                            borderRadius: 16, border: '1px solid var(--border)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', zIndex: 200,
                            animation: 'fadeIn 0.2s ease-out',
                        }}>
                            <div style={{ padding: 16, borderBottom: '1px solid var(--border-light)' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        placeholder={t('search.placeholder')}
                                        style={{
                                            width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
                                            border: '1px solid var(--border)', background: 'var(--background)',
                                            fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none',
                                        }}
                                    />
                                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Ctrl+K</span>
                                </div>
                            </div>
                            <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
                                {!searchQuery.trim() && (
                                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                        {t('search.placeholder')}
                                    </div>
                                )}
                                {searchQuery.trim() && !searchResults && (
                                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                        {t('search.noResults')}
                                    </div>
                                )}
                                {searchResults && (
                                    <>
                                        {searchResults.pages.length > 0 && (
                                            <SearchSection icon={<Compass size={14} color="#0891b2" />} label={t('search.pages')}>
                                                {searchResults.pages.map(p => (
                                                    <Link key={p.href} href={p.href} onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                                                        style={resultRowStyle}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#ecfeff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Compass size={14} color="#0891b2" /></div>
                                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.label}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ouvrir la page</div></div>
                                                        <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                                    </Link>
                                                ))}
                                            </SearchSection>
                                        )}
                                        {searchResults.machines.length > 0 && (
                                            <SearchSection icon={<Cpu size={14} color="#3b82f6" />} label={t('search.machines')}>
                                                {searchResults.machines.map(m => (
                                                    <Link key={m.id} href={`/machines/${m.id}`} onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                                                        style={resultRowStyle}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                        {m.imageUrl ? <img src={m.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Cpu size={14} color="#3b82f6" /></div>}
                                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{m.code}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.name}</div></div>
                                                        <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                                    </Link>
                                                ))}
                                            </SearchSection>
                                        )}
                                        {searchResults.parts.length > 0 && (
                                            <SearchSection icon={<Package size={14} color="#f59e0b" />} label={t('search.parts')}>
                                                {searchResults.parts.map(p => (
                                                    <Link key={p.id} href="/spare-parts" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                                                        style={resultRowStyle}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={14} color="#f59e0b" /></div>
                                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.reference}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.name}</div></div>
                                                        <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                                    </Link>
                                                ))}
                                            </SearchSection>
                                        )}
                                        {searchResults.intv.length > 0 && (
                                            <SearchSection icon={<Wrench size={14} color="#22c55e" />} label={t('search.interventions')}>
                                                {searchResults.intv.map(i => (
                                                    <Link key={i.id} href={user?.role === 'technician' ? '/technician/report' : user?.role === 'operator' ? '/operator/dashboard' : '/interventions'} onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                                                        style={resultRowStyle}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Wrench size={14} color="#22c55e" /></div>
                                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{i.id}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.description}</div></div>
                                                        <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                                    </Link>
                                                ))}
                                            </SearchSection>
                                        )}
                                        {searchResults.staff.length > 0 && (
                                            <SearchSection icon={<Users size={14} color="#8b5cf6" />} label={t('search.personnel')}>
                                                {searchResults.staff.map(s => (
                                                    <Link key={s.id} href="/personnel" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                                                        style={resultRowStyle}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#8b5cf6', flexShrink: 0 }}>{s.name.split(' ').map(w => w[0]).join('')}</div>
                                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.role}</div></div>
                                                        <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                                    </Link>
                                                ))}
                                            </SearchSection>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Offline / pending-writes indicator — sits next to the bell */}
                <OfflineIndicator />

                {/* ===================== NOTIFICATIONS ===================== */}
                <div ref={notifRef} style={{ position: 'relative' }}>
                    <button onClick={() => { setNotifOpen(!notifOpen); setSearchOpen(false); }}
                        style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            border: notifOpen ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                            background: 'var(--surface)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: notifOpen ? 'var(--primary)' : 'var(--text-secondary)',
                            position: 'relative', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
                        onMouseLeave={e => { if (!notifOpen) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute', top: 4, right: 4,
                                minWidth: 16, height: 16, borderRadius: 100,
                                background: '#ef4444', color: 'white',
                                fontSize: 10, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid var(--surface)', padding: '0 3px',
                                animation: 'pulse-soft 2s infinite',
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {notifOpen && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 8px)',
                            ...(locale.language === 'ar' ? { left: 0 } : { right: 0 }),
                            width: 400, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface)',
                            borderRadius: 16, border: '1px solid var(--border)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.15)', zIndex: 200,
                            animation: 'fadeIn 0.2s ease-out',
                        }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t('notif.title')}</span>
                                    {unreadCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#fef2f2', color: '#ef4444' }}>{unreadCount}</span>}
                                </div>
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CheckCheck size={14} /> {t('action.markAllRead')}
                                    </button>
                                )}
                            </div>
                            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                                {notifications.length === 0 ? (
                                    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                        ✅ Aucune alerte — tout est sous contrôle
                                    </div>
                                ) : (
                                    notifications.map(n => {
                                        const isRead = dismissed.has(n.id);
                                        return (
                                            <Link key={n.id} href={n.link}
                                                onClick={() => {
                                                    setDismissed(p => new Set(p).add(n.id));
                                                    const dbId = dbNotifs.rawIdFromKey(n.id);
                                                    if (dbId) dbNotifs.markOneRead(dbId);
                                                    setNotifOpen(false);
                                                }}
                                                style={{
                                                    padding: '14px 20px', display: 'flex', gap: 12, cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border-light)', textDecoration: 'none', color: 'var(--text-primary)',
                                                    background: isRead ? 'transparent' : 'rgba(59,130,246,0.03)',
                                                    transition: 'background 0.2s ease',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = isRead ? 'transparent' : 'rgba(59,130,246,0.03)')}
                                            >
                                                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${n.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                                                    {n.icon}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</span>
                                                        {!isRead && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                                                    </div>
                                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</p>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>{timeAgo(n.timestamp)}</span>
                                                </div>
                                            </Link>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ===================== USER AVATAR ===================== */}
                <div
                    onClick={() => setProfileOpen(true)}
                    style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: user?.avatarUrl
                            ? `url(${user.avatarUrl}) center/cover`
                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        overflow: 'hidden',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                    {!user?.avatarUrl && (user?.avatar || 'ME')}
                </div>
            </div>

            {/* User Profile Slide-Over */}
            <UserProfile isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
        </header>
    );
}

// ===================== Search Section Helper =====================
function SearchSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {icon} {label}
            </div>
            {children}
        </div>
    );
}
