'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, UserRole } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import {
    LayoutDashboard, Cpu, Wrench, Users, Package, FileBarChart, Settings, LogOut,
    ScanLine, AlertTriangle, ChevronLeft, ChevronRight, CalendarClock, MonitorPlay,
    BadgeCheck, Workflow, Gauge, ShieldCheck, ListChecks, Radar, BellRing, Zap,
    Ruler, History, Briefcase, BookOpen, CalendarDays, Notebook, Lock, Server,
    Activity, ChevronRight as Chevron, Award, Megaphone, BarChart3, ClipboardList,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface NavItem {
    href?: string;
    labelKey: string;
    icon: React.ElementType;
    roles: UserRole[];
    /** When set, this item is a group — clicking/hover opens a popover of children. */
    children?: NavItem[];
}

// ── Nav structure — flat links + grouped popovers ──
// Each top-level item is either a direct link (href present) or a group
// (children present). Groups expand into a floating popover on hover.
const navItems: NavItem[] = [
    // ─── Admin ───
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['admin'] },

    {
        labelKey: 'nav.group.maintenance', icon: Wrench, roles: ['admin'], children: [
            { href: '/machines', labelKey: 'nav.machines', icon: Cpu, roles: ['admin'] },
            { href: '/interventions', labelKey: 'nav.interventions', icon: Wrench, roles: ['admin'] },
            { href: '/maintenance-plans', labelKey: 'nav.maintenancePlans', icon: CalendarClock, roles: ['admin'] },
            { href: '/projets', labelKey: 'nav.projects', icon: Briefcase, roles: ['admin'] },
            { href: '/synoptique', labelKey: 'nav.synoptique', icon: Workflow, roles: ['admin'] },
            { href: '/control-room', labelKey: 'nav.controlRoom', icon: MonitorPlay, roles: ['admin'] },
        ]
    },

    {
        labelKey: 'nav.group.performance', icon: Activity, roles: ['admin'], children: [
            { href: '/oee', labelKey: 'nav.oee', icon: Gauge, roles: ['admin'] },
            { href: '/predictif', labelKey: 'nav.predictive', icon: Radar, roles: ['admin'] },
            { href: '/energie', labelKey: 'nav.energy', icon: Zap, roles: ['admin'] },
            { href: '/reports', labelKey: 'nav.reports', icon: FileBarChart, roles: ['admin'] },
        ]
    },

    {
        labelKey: 'nav.group.compliance', icon: ShieldCheck, roles: ['admin'], children: [
            { href: '/haccp', labelKey: 'nav.haccp', icon: ShieldCheck, roles: ['admin'] },
            { href: '/calibration', labelKey: 'nav.calibration', icon: Ruler, roles: ['admin'] },
            { href: '/checklists', labelKey: 'nav.checklists', icon: ListChecks, roles: ['admin'] },
            { href: '/loto', labelKey: 'nav.loto', icon: Lock, roles: ['admin'] },
            { href: '/certifications', labelKey: 'nav.certifications', icon: Award, roles: ['admin'] },
            { href: '/production-batches', labelKey: 'nav.batches', icon: Package, roles: ['admin'] },
        ]
    },

    {
        labelKey: 'nav.group.team', icon: Users, roles: ['admin'], children: [
            { href: '/personnel', labelKey: 'nav.personnel', icon: Users, roles: ['admin'] },
            { href: '/handover', labelKey: 'nav.handover', icon: Notebook, roles: ['admin'] },
            { href: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen, roles: ['admin'] },
            { href: '/procedure-runs', labelKey: 'nav.procedureRuns', icon: ClipboardList, roles: ['admin'] },
            { href: '/directives', labelKey: 'nav.directives', icon: Megaphone, roles: ['admin'] },
            { href: '/operator-requests', labelKey: 'nav.operatorRequests', icon: BellRing, roles: ['admin'] },
        ]
    },

    {
        labelKey: 'nav.group.procurement', icon: Package, roles: ['admin'], children: [
            { href: '/spare-parts', labelKey: 'nav.spareParts', icon: Package, roles: ['admin'] },
            { href: '/approvals', labelKey: 'nav.approvals', icon: BadgeCheck, roles: ['admin'] },
        ]
    },

    {
        labelKey: 'nav.group.system', icon: Server, roles: ['admin'], children: [
            { href: '/alertes', labelKey: 'nav.alerts', icon: BellRing, roles: ['admin'] },
            { href: '/alert-history', labelKey: 'nav.alertHistory', icon: History, roles: ['admin'] },
            { href: '/audit', labelKey: 'nav.audit', icon: History, roles: ['admin'] },
            { href: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
        ]
    },

    // ─── Technician ───
    { href: '/technician/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['technician'] },

    {
        labelKey: 'nav.group.tech.work', icon: Wrench, roles: ['technician'], children: [
            { href: '/technician/planning', labelKey: 'nav.planning', icon: CalendarDays, roles: ['technician'] },
            { href: '/technician/report', labelKey: 'nav.myInterventions', icon: Wrench, roles: ['technician'] },
            { href: '/projets', labelKey: 'nav.projects', icon: Briefcase, roles: ['technician'] },
            { href: '/technician/scanner', labelKey: 'nav.scanMachine', icon: ScanLine, roles: ['technician'] },
            { href: '/technician/stats', labelKey: 'nav.myStats', icon: BarChart3, roles: ['technician'] },
        ]
    },

    {
        labelKey: 'nav.group.tech.tools', icon: Briefcase, roles: ['technician'], children: [
            { href: '/technician/inventory', labelKey: 'nav.inventory', icon: Briefcase, roles: ['technician'] },
            { href: '/loto', labelKey: 'nav.loto', icon: Lock, roles: ['technician'] },
        ]
    },

    {
        labelKey: 'nav.group.tech.knowledge', icon: BookOpen, roles: ['technician'], children: [
            { href: '/checklists', labelKey: 'nav.checklists', icon: ListChecks, roles: ['technician'] },
            { href: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen, roles: ['technician'] },
            { href: '/handover', labelKey: 'nav.handover', icon: Notebook, roles: ['technician'] },
        ]
    },

    // (T) Lots de production retiré du menu technicien — ils ne gèrent pas la production.
    // Accès toujours possible via lien direct (carnet de quart, etc.).

    // ─── Operator (kept flat — only 3 items) ───
    { href: '/operator/dashboard', labelKey: 'nav.operatorDashboard', icon: LayoutDashboard, roles: ['operator'] },
    { href: '/operator/report-breakdown', labelKey: 'nav.reportBreakdown', icon: AlertTriangle, roles: ['operator'] },
    { href: '/production-batches', labelKey: 'nav.batches', icon: Package, roles: ['operator'] },
];

// Solid enterprise accents — no rainbow gradients. Each role gets one
// tone that reads calmly against the navy sidebar and clearly against
// the surface.
const roleConfig: Record<UserRole, { accentGradient: string; accentColor: string; badgeKey: string; badgeBg: string }> = {
    admin: { accentGradient: '#0b3a86', accentColor: '#0b3a86', badgeKey: 'role.admin', badgeBg: 'rgba(11,58,134,0.14)' },
    technician: { accentGradient: '#b45309', accentColor: '#b45309', badgeKey: 'role.technician', badgeBg: 'rgba(180,83,9,0.14)' },
    operator: { accentGradient: '#0f766e', accentColor: '#0f766e', badgeKey: 'role.operator', badgeBg: 'rgba(15,118,110,0.14)' },
};

interface SidebarProps { mobileOpen?: boolean; onNavigate?: () => void; }

export default function Sidebar({ mobileOpen = false, onNavigate }: SidebarProps = {}) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { t, locale } = useApp();
    const [collapsed, setCollapsed] = useState(false);

    if (!user) return null;
    const config = roleConfig[user.role];
    const filteredNav = navItems.filter(item => item.roles.includes(user.role));
    const isRTL = locale.language === 'ar';

    const sidebarWidth = collapsed ? 72 : 260;

    return (
        <aside className={'app-sidebar' + (mobileOpen ? ' app-sidebar--open' : '')} style={{
            width: sidebarWidth, minHeight: '100vh', background: 'var(--sidebar-bg)',
            display: 'flex', flexDirection: 'column', transition: 'width 0.25s ease, transform 0.25s ease',
            position: 'fixed', top: 0, left: isRTL ? undefined : 0, right: isRTL ? 0 : undefined,
            bottom: 0, zIndex: 50,
        }}>
            {/* Logo */}
            <div style={{ padding: collapsed ? '20px 12px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(255,255,255,0.08)' }}>
                    <img src="/logo.png" alt="SmartMaint — L.C PROD" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                {!collapsed && <div style={{ overflow: 'hidden' }}><div style={{ fontWeight: 700, fontSize: 16, color: 'white', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{t('nav.appName')}</div><div style={{ fontSize: 11, color: 'var(--sidebar-text)', marginTop: 1 }}>{t('nav.appSubtitle')}</div></div>}
            </div>

            {/* User info */}
            {!collapsed && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: user.avatarUrl ? `url(${user.avatarUrl}) center/cover` : config.accentGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0, overflow: 'hidden' }}>{!user.avatarUrl && user.avatar}</div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: config.accentColor, background: config.badgeBg, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(config.badgeKey)}</span>
                    </div>
                </div>
            )}

            {/* Navigation — overflow: visible so the hover popover can
                escape horizontally next to the row. Previously used
                overflowY: 'auto' which the browser silently promotes to
                both-axis clipping, cutting off the popover. If the sidebar
                ever needs to scroll vertically, wrap this <nav> in an
                inner scroller — not the nav itself. */}
            <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'visible' }}>
                {filteredNav.map((item) => (
                    <NavRow
                        key={(item.href ?? '') + item.labelKey}
                        item={item}
                        pathname={pathname}
                        collapsed={collapsed}
                        accentColor={config.accentColor}
                        isRTL={isRTL}
                        sidebarWidth={sidebarWidth}
                        onNavigate={onNavigate}
                        t={t}
                    />
                ))}
            </nav>

            {/* Bottom */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '14px 16px' : '12px 24px', width: '100%', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 500, transition: 'background 0.2s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <LogOut size={18} />{!collapsed && t('nav.logout')}
                </button>
                <button onClick={() => setCollapsed(!collapsed)} style={{ padding: '14px 16px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'var(--sidebar-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end', border: 'none', transition: 'color 0.2s ease' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--sidebar-text)')}>
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>
        </aside>
    );
}

// ── A single row — either a plain link or a group that opens a popover ──
interface NavRowProps {
    item: NavItem;
    pathname: string;
    collapsed: boolean;
    accentColor: string;
    isRTL: boolean;
    sidebarWidth: number;
    onNavigate?: () => void;
    t: (k: string) => string;
}

function NavRow({ item, pathname, collapsed, accentColor, isRTL, sidebarWidth, onNavigate, t }: NavRowProps) {
    const Icon = item.icon;
    const isGroup = !!item.children?.length;
    const [open, setOpen] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);

    // Active = this link itself, or any child is the current route.
    const isItemActive = item.href ? (pathname === item.href || pathname.startsWith(item.href + '/')) : false;
    const isChildActive = item.children?.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + '/'))) ?? false;
    const isActive = isItemActive || isChildActive;

    const openPopover = () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        setOpen(true);
    };
    // 250 ms grace — standard hover-menu UX, long enough to cross the
    // gap to the popover without going stale on a normal interaction.
    const scheduleClose = () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => setOpen(false), 250);
    };

    useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

    // Popover is anchored via position: absolute directly to the row
    // (position: relative wrapper) instead of computing viewport
    // coordinates. This is required because the app applies a non-standard
    // CSS `zoom` on <html> (70% / 80% / 100% etc.) via the Header widget,
    // and getBoundingClientRect + position: fixed disagree on how to
    // interpret that zoom — the popover ended up misplaced by ~zoom_factor.
    // With position: absolute the browser handles zoom uniformly and the
    // popover always lands next to the hovered row.

    // Plain link row
    if (!isGroup) {
        const linkTourKey = item.labelKey.replace(/\./g, '-');
        return (
            <Link href={item.href!} data-tour={linkTourKey} onClick={() => onNavigate?.()} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '12px 16px' : '10px 16px', borderRadius: 10,
                color: isActive ? 'white' : 'var(--sidebar-text)',
                background: isActive ? accentColor : 'transparent',
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.2s ease', whiteSpace: 'nowrap',
            }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                <Icon size={20} style={{ flexShrink: 0 }} />{!collapsed && t(item.labelKey)}
            </Link>
        );
    }

    // ── Group row with hover popover ──
    // The data-tour attribute lets the tutorial spotlight this group;
    // we derive it from the labelKey ("nav.group.maintenance" → "nav-group-maintenance").
    const tourKey = item.labelKey.replace(/\./g, '-');
    return (
        <div ref={rowRef} data-tour={tourKey} style={{ position: 'relative' }}
            onMouseEnter={openPopover}
            onMouseLeave={scheduleClose}>
            <button onClick={() => setOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '12px 16px' : '10px 16px', borderRadius: 10,
                color: isActive ? 'white' : 'var(--sidebar-text)',
                background: isActive ? accentColor : (open ? 'var(--sidebar-hover)' : 'transparent'),
                textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                cursor: 'pointer', border: 'none', width: '100%', fontFamily: 'inherit', textAlign: 'left',
            }}>
                <Icon size={20} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1 }}>{t(item.labelKey)}</span>}
                {!collapsed && <Chevron size={14} style={{ opacity: 0.6, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />}
            </button>

            {/* Popover — floats to the right of the sidebar (or left in RTL).
                An invisible 12 px bridge straddles the gap between the
                trigger and the popover content so the cursor never leaves
                a "hot" element while crossing — the close timer never starts. */}
            {open && (
                <div
                    onMouseEnter={openPopover}
                    onMouseLeave={scheduleClose}
                    style={{
                        position: 'absolute',
                        top: -4,
                        // Attaches flush against the sidebar edge in both
                        // LTR and RTL. Requires the row wrapper to be
                        // position: relative (which it already is).
                        ...(isRTL ? { right: '100%', marginRight: -12 } : { left: '100%', marginLeft: -12 }),
                        minWidth: 240,
                        // Solid backgrounds for both themes — bug flagged by
                        // the admin: the popover was translucent so the page
                        // content (article cards) bled through the menu.
                        background: 'var(--sidebar-bg, #0f172a)',
                        backgroundColor: 'var(--sidebar-bg, #0f172a)',
                        backdropFilter: 'none',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                        padding: 6,
                        paddingLeft: isRTL ? 6 : 18,   // bridge zone on the left
                        paddingRight: isRTL ? 18 : 6,  // bridge zone on the right (RTL)
                        marginLeft: isRTL ? 0 : -12,
                        marginRight: isRTL ? -12 : 0,
                        // Bumped from 60 → 9000 so the popover always wins
                        // against page cards / modals / anything with a
                        // stacking context.
                        zIndex: 9000,
                        animation: 'fadeIn 0.15s ease-out',
                    }}
                >
                    <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--sidebar-text)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>
                        {t(item.labelKey)}
                    </div>
                    {item.children!.map(child => {
                        const ChildIcon = child.icon;
                        const childActive = child.href && (pathname === child.href || pathname.startsWith(child.href + '/'));
                        return (
                            <Link key={child.href} href={child.href!}
                                onClick={() => { onNavigate?.(); setOpen(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                                    color: childActive ? 'white' : 'var(--sidebar-text)',
                                    background: childActive ? accentColor : 'transparent',
                                    textDecoration: 'none', fontSize: 13.5, fontWeight: childActive ? 600 : 400,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (!childActive) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                                onMouseLeave={e => { if (!childActive) e.currentTarget.style.background = 'transparent'; }}>
                                <ChildIcon size={16} style={{ flexShrink: 0, opacity: 0.85 }} />
                                {t(child.labelKey)}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
