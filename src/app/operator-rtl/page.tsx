'use client';

import { useData } from '@/context/DataContext';
import {
    Factory, LayoutDashboard, AlertTriangle, Settings, LogOut,
    Cpu, CheckCircle, XCircle, Wrench as WrenchIcon, Clock,
    TrendingUp, ChevronLeft, Bell, Search, User,
    Activity, BarChart3, Shield, Gauge,
} from 'lucide-react';
import { useState } from 'react';

// Arabic status config
const statusAr: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    'opérationnelle': { label: 'تعمل', color: '#22c55e', bg: '#f0fdf4', icon: CheckCircle },
    'en panne': { label: 'معطلة', color: '#ef4444', bg: '#fef2f2', icon: XCircle },
    'en maintenance': { label: 'في الصيانة', color: '#f59e0b', bg: '#fffbeb', icon: WrenchIcon },
    'arrêtée': { label: 'متوقفة', color: '#64748b', bg: '#f1f5f9', icon: Clock },
};

// Arabic nav items
const arNavItems = [
    { icon: LayoutDashboard, label: 'لوحة التحكم', active: true },
    { icon: Cpu, label: 'الآلات', active: false },
    { icon: AlertTriangle, label: 'الإبلاغ عن عطل', active: false },
    { icon: Settings, label: 'الإعدادات', active: false },
];

// Mock Arabic reports
const arReports = [
    { id: 1, machine: 'POM-001', problem: 'تسرب زيت هيدروليكي', status: 'قيد المعالجة', statusColor: '#3b82f6', statusBg: '#eff6ff', time: 'منذ ساعتين' },
    { id: 2, machine: 'ECH-001', problem: 'ضوضاء غير طبيعية في المحرك', status: 'في الانتظار', statusColor: '#f59e0b', statusBg: '#fffbeb', time: 'منذ 3 ساعات' },
    { id: 3, machine: 'REM-001', problem: 'توقف مفاجئ في الإنتاج', status: 'تم الحل', statusColor: '#22c55e', statusBg: '#f0fdf4', time: 'أمس' },
];

export default function OperatorRTLDashboard() {
    // Live machines snapshot — admin status changes propagate in real time.
    const { machines } = useData();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [reportModal, setReportModal] = useState(false);

    const operational = machines.filter(m => m.status === 'opérationnelle').length;
    const broken = machines.filter(m => m.status === 'en panne').length;
    const maintenance = machines.filter(m => m.status === 'en maintenance').length;

    const kpis = [
        { label: 'الآلات العاملة', value: operational, total: machines.length, color: '#22c55e', icon: CheckCircle },
        { label: 'أعطال نشطة', value: broken, total: null, color: '#ef4444', icon: XCircle },
        { label: 'في الصيانة', value: maintenance, total: null, color: '#f59e0b', icon: WrenchIcon },
        { label: 'معدل التوفر', value: `${Math.round((operational / machines.length) * 100)}%`, total: null, color: '#8b5cf6', icon: Gauge },
    ];

    return (
        <div dir="rtl" style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: "'Noto Sans Arabic', 'Inter', sans-serif" }}>
            {/* ====== RIGHT SIDEBAR (RTL) ====== */}
            <aside style={{
                width: sidebarCollapsed ? 72 : 260, minHeight: '100vh',
                background: 'var(--sidebar-bg)',
                display: 'flex', flexDirection: 'column',
                transition: 'width 0.25s ease', position: 'fixed',
                top: 0, right: 0, bottom: 0, zIndex: 50, overflow: 'hidden',
            }}>
                {/* Logo */}
                <div style={{ padding: sidebarCollapsed ? '20px 12px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0e7c3f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Factory size={22} color="white" />
                    </div>
                    {!sidebarCollapsed && (
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700, fontSize: 16, color: 'white', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>سمارت مينت - تكس</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>نظام إدارة الصيانة</div>
                        </div>
                    )}
                </div>

                {/* User info */}
                {!sidebarCollapsed && (
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0e7c3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>كب</div>
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>كريم بنجلون</div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase' }}>مشغل</span>
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {arNavItems.map((item, i) => {
                        const Icon = item.icon;
                        return (
                            <button key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: sidebarCollapsed ? '12px 16px' : '10px 16px', borderRadius: 10,
                                color: item.active ? 'white' : '#94a3b8',
                                background: item.active ? '#10b981' : 'transparent',
                                border: 'none', cursor: 'pointer', fontSize: 14,
                                fontWeight: item.active ? 600 : 400, transition: 'all 0.2s',
                                width: '100%', textAlign: 'right', fontFamily: 'inherit',
                            }}>
                                <Icon size={20} style={{ flexShrink: 0 }} />
                                {!sidebarCollapsed && item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Bottom controls */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 12, padding: sidebarCollapsed ? '14px 16px' : '12px 24px', width: '100%', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}>
                        <LogOut size={18} /> {!sidebarCollapsed && 'تسجيل الخروج'}
                    </button>
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{
                        padding: '14px 16px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)',
                        background: 'transparent', color: '#94a3b8', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        border: 'none', transition: 'color 0.2s',
                    }}>
                        <ChevronLeft size={18} style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }} />
                    </button>
                </div>
            </aside>

            {/* ====== MAIN CONTENT ====== */}
            <div style={{ flex: 1, marginRight: sidebarCollapsed ? 72 : 260, transition: 'margin 0.25s ease' }}>
                {/* Header */}
                <header style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 32px', background: 'white',
                    borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 40,
                }}>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>لوحة تحكم المشغل</h1>
                        <p style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>مرحباً كريم 👋</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                            <Search size={18} />
                        </button>
                        <button style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', position: 'relative' }}>
                            <Bell size={18} />
                            <span style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '2px solid white' }} />
                        </button>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0e7c3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                            كب
                        </div>
                    </div>
                </header>

                <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                    {/* ====== PANIC BUTTON ====== */}
                    <button
                        onClick={() => setReportModal(true)}
                        style={{
                            width: '100%', padding: '40px 32px', borderRadius: 24,
                            background: '#b91c1c',
                            color: 'white', border: 'none', cursor: 'pointer',
                            textAlign: 'center', marginBottom: 28,
                            boxShadow: '0 16px 48px rgba(220,38,38,0.35)',
                            transition: 'transform 0.3s, box-shadow 0.3s',
                            position: 'relative', overflow: 'hidden',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(220,38,38,0.45)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(220,38,38,0.35)'; }}
                    >
                        <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.2)', borderRadius: 24, animation: 'pulse-soft 2s infinite' }} />
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 36 }}>⚠️</div>
                        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>الإبلاغ عن عطل</h2>
                        <p style={{ fontSize: 15, opacity: 0.9 }}>اضغط هنا للإبلاغ عن مشكلة في 3 خطوات بسيطة</p>
                    </button>

                    {/* ====== KPI CARDS ====== */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                        {kpis.map((kpi, i) => {
                            const Icon = kpi.icon;
                            return (
                                <div key={i} style={{
                                    background: 'white', border: '1px solid #e2e8f0', borderRadius: 16,
                                    padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.25s', position: 'relative', overflow: 'hidden',
                                    borderRight: `4px solid ${kpi.color}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{kpi.label}</span>
                                        <Icon size={18} color={kpi.color} />
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                                        {kpi.value}
                                        {kpi.total && <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 400 }}> / {kpi.total}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ====== MACHINE STATUS CARDS ====== */}
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={20} color="#3b82f6" /> حالة الآلات
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 32 }}>
                        {machines.map(m => {
                            const st = statusAr[m.status];
                            const Icon = st.icon;
                            return (
                                <div key={m.id} style={{
                                    background: 'white', border: '1px solid #e2e8f0', borderRadius: 14,
                                    padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                                    transition: 'all 0.2s',
                                    borderRight: `4px solid ${st.color}`,
                                }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={22} color={st.color} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{m.code}</div>
                                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{m.name}</div>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100, background: st.bg, color: st.color }}>{st.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* ====== RECENT REPORTS ====== */}
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        📋 بلاغاتي الأخيرة
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {arReports.map(r => (
                            <div key={r.id} style={{
                                background: 'white', borderRadius: 14, padding: '18px 20px',
                                border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: r.statusBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <AlertTriangle size={22} color={r.statusColor} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.machine}</div>
                                    <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{r.problem}</div>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100, background: r.statusBg, color: r.statusColor }}>{r.status}</span>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{r.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ====== PRODUCTION PROGRESS ====== */}
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={20} color="#8b5cf6" /> تقدم الإنتاج اليومي
                    </h3>
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24 }}>
                        {[
                            { label: 'خط النسيج', value: 85, color: '#22c55e' },
                            { label: 'خط الغزل', value: 62, color: '#f59e0b' },
                            { label: 'خط الصباغة', value: 91, color: '#3b82f6' },
                            { label: 'خط التشطيب', value: 45, color: '#ef4444' },
                        ].map((line, i) => (
                            <div key={i} style={{ marginBottom: i < 3 ? 20 : 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600 }}>{line.label}</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: line.color }}>{line.value}%</span>
                                </div>
                                <div style={{ height: 10, borderRadius: 100, background: '#f1f5f9', overflow: 'hidden' }}>
                                    <div className="reliability-bar-fill" style={{
                                        width: `${line.value}%`, height: '100%', borderRadius: 100,
                                        background: `linear-gradient(90deg, ${line.color}, ${line.color}dd)`,
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            {/* ====== REPORT MODAL ====== */}
            {reportModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={() => setReportModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
                    <div style={{ position: 'relative', background: 'white', borderRadius: 20, width: '90%', maxWidth: 500, padding: 32, zIndex: 201, animation: 'fadeIn 0.3s ease' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>🚨 الإبلاغ عن عطل جديد</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>الآلة المعنية</label>
                                <select style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', direction: 'rtl' }}>
                                    <option>اختيار الآلة</option>
                                    {machines.map(m => <option key={m.id}>{m.code} — {m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>وصف المشكلة</label>
                                <textarea style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', minHeight: 80, resize: 'vertical', direction: 'rtl' }} placeholder="مثال: تسرب زيت من المحرك" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>مستوى الأولوية</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {[{ l: 'عالي', c: '#ef4444', b: '#fef2f2' }, { l: 'متوسط', c: '#f59e0b', b: '#fffbeb' }, { l: 'منخفض', c: '#22c55e', b: '#f0fdf4' }].map((p, i) => (
                                        <button key={i} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${p.c}30`, background: p.b, color: p.c, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{p.l}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                            <button onClick={() => setReportModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', color: '#475569' }}>إلغاء</button>
                            <button onClick={() => { setReportModal(false); }} style={{ flex: 1, padding: '12px', borderRadius: 10, background: '#b91c1c', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>إرسال البلاغ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Google Fonts for Arabic */}
            <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700;800&display=swap');`}</style>
        </div>
    );
}
