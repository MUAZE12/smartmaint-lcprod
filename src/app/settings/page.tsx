'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useApp, Currency, Timezone } from '@/context/AppContext';
import { useTheme, Theme } from '@/context/ThemeContext';
import { useData } from '@/context/DataContext';
import type { Locale } from '@/lib/translations';
import { Database, Bell, Shield, Globe, Palette, ChevronRight, Calculator, Sun, Moon, Monitor, RefreshCw, TrendingUp, Wifi, CheckCircle2, FileCheck, Building2, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { resetTutorial } from '@/components/TutorialTour';
import { useState, useEffect } from 'react';
import { settingsDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import KPIFormulaBuilder from '@/components/industry40/KPIFormulaBuilder';

const iS: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,fontFamily:'inherit',color:'var(--text-primary)',outline:'none' };
const lS: React.CSSProperties = { display:'block',fontSize:12,fontWeight:600,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.04em' };

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (<button onClick={onChange} style={{ width:48,height:26,borderRadius:13,border:'none',cursor:'pointer',background:on?'#22c55e':'var(--surface-active)',position:'relative',transition:'background 0.2s' }}>
        <div style={{ width:22,height:22,borderRadius:'50%',background:'white',position:'absolute',top:2,left:on?24:2,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>);
}

// Live currency rates — fetched from open.er-api.com (free, no key, CORS OK).
// See handleSync below for the fetch. Falls back to the last cached value in
// localStorage if the network is down (offline shop-floor friendly).
interface LiveRate { from: string; to: 'MAD'; rate: number; change: string }
const FALLBACK_RATES: LiveRate[] = [
    { from: 'EUR', to: 'MAD', rate: 10.85, change: '—' },
    { from: 'USD', to: 'MAD', rate: 9.87, change: '—' },
    { from: 'GBP', to: 'MAD', rate: 12.43, change: '—' },
];

export default function SettingsPage() {
    const { showToast } = useToast();
    const { user, logout } = useAuth();
    const { t, locale, setLanguage, setCurrency, setTimezone, setConversionRate } = useApp();
    const { theme, setTheme } = useTheme();

    const replayTutorial = () => {
        resetTutorial(user?.supabaseId);
        window.dispatchEvent(new Event('smartmaint-replay-tutorial'));
        showToast('🎓 Tutoriel relancé');
    };
    const {
        machines, technicians, interventions, spareParts,
        suppliers, purchaseOrders, productionMetrics, personnel,
        refresh, loading: dataLoading,
    } = useData();
    const [activeModal, setActiveModal] = useState<string|null>(null);
    const close = () => setActiveModal(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const tableCounts = [
        { label: 'Machines', count: machines.length },
        { label: 'Techniciens', count: technicians.length },
        { label: 'Interventions', count: interventions.length },
        { label: 'Pièces de rechange', count: spareParts.length },
        { label: 'Fournisseurs', count: suppliers.length },
        { label: 'Bons de commande', count: purchaseOrders.length },
        { label: 'Métriques production', count: productionMetrics.length },
        { label: 'Personnel', count: personnel.length },
    ];
    const totalRows = tableCounts.reduce((s, t) => s + t.count, 0);

    const handleRefreshData = async () => {
        await refresh();
        showToast('✅ Données rechargées depuis Supabase');
    };

    // PO approval threshold (stored in app_settings)
    const [approvalThreshold, setApprovalThreshold] = useState('5000');
    const [tempThreshold, setTempThreshold] = useState('5000');
    const [savingThreshold, setSavingThreshold] = useState(false);
    useEffect(() => {
        settingsDb.get('po_approval_threshold')
            .then(v => { if (v) { setApprovalThreshold(v); setTempThreshold(v); } })
            .catch(() => { /* table may not exist yet */ });
        // Restore notification + security preferences from app_settings
        settingsDb.get('notif_prefs')
            .then(v => {
                if (v) {
                    try { setNotifs(JSON.parse(v)); } catch { /* ignore */ }
                    try { localStorage.setItem('smartmaint-notif-prefs', v); } catch { /* SSR */ }
                }
            })
            .catch(() => { /* ignore */ });
        settingsDb.get('session_expiry')
            .then(v => {
                if (v) {
                    setSessionExpiry(v);
                    const minutes = v === '15min' ? 15 : v === '1h' ? 60 : v === '8h' ? 480 : 0; // 'never' → 0
                    try { localStorage.setItem('smartmaint-idle-min', String(minutes)); } catch { /* SSR */ }
                }
            })
            .catch(() => { /* ignore */ });
    }, []);
    const openThreshold = () => { setTempThreshold(approvalThreshold); setActiveModal('approval'); };
    const saveThreshold = async () => {
        const n = parseInt(tempThreshold, 10);
        if (isNaN(n) || n < 0) { showToast('Entrez un montant valide', 'error'); return; }
        setSavingThreshold(true);
        try {
            await settingsDb.set('po_approval_threshold', String(n));
            setApprovalThreshold(String(n));
            close();
            showToast(`✅ Seuil d'approbation fixé à ${n.toLocaleString('fr-FR')} MAD`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setSavingThreshold(false); }
    };

    const [notifs, setNotifs] = useState({ stock:true,panne:true,validation:true,email:false });
    const [sessionExpiry, setSessionExpiry] = useState('1h');

    // Password change (real Supabase updateUser)
    const [pwOpen, setPwOpen] = useState(false);
    const [pwNew, setPwNew] = useState('');
    const [pwConfirm, setPwConfirm] = useState('');
    const [pwBusy, setPwBusy] = useState(false);
    const savePassword = async () => {
        if (pwNew.length < 8) { showToast('8 caractères minimum', 'error'); return; }
        if (pwNew !== pwConfirm) { showToast('Les deux mots de passe ne correspondent pas', 'error'); return; }
        setPwBusy(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: pwNew });
            if (error) throw error;
            showToast('✅ Mot de passe modifié');
            setPwOpen(false);
            setPwNew(''); setPwConfirm('');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setPwBusy(false); }
    };
    // Force logout (real — signs out everywhere via Supabase, then bounces to /login)
    const [confirmForceLogout, setConfirmForceLogout] = useState(false);
    const doForceLogout = async () => {
        try {
            // scope 'global' revokes every refresh token, so every device the
            // user is signed in on is disconnected on its next fetch.
            await supabase.auth.signOut({ scope: 'global' });
            showToast('🚫 Toutes les sessions révoquées — reconnexion nécessaire');
            await logout();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
    };

    // Company info — used on PDF print headers and email signatures.
    const DEFAULT_COMPANY = {
        name: 'L.C PROD',
        sector: 'Agroalimentaire — Huile d\'olive et produits dérivés',
        address: 'Maroc',
        phone: '',
        email: '',
        ice: '',
    };
    const [company, setCompany] = useState(DEFAULT_COMPANY);
    const [tempCompany, setTempCompany] = useState(DEFAULT_COMPANY);
    const [savingCompany, setSavingCompany] = useState(false);
    useEffect(() => {
        settingsDb.get('company_info').then(v => {
            if (!v) return;
            try {
                const parsed = JSON.parse(v);
                setCompany(prev => ({ ...prev, ...parsed }));
            } catch { /* ignore */ }
        }).catch(() => { /* ignore */ });
    }, []);
    const openCompany = () => { setTempCompany(company); setActiveModal('company'); };
    const saveCompany = async () => {
        if (!tempCompany.name.trim()) { showToast('Le nom de l\'entreprise est obligatoire', 'error'); return; }
        setSavingCompany(true);
        try {
            await settingsDb.set('company_info', JSON.stringify(tempCompany));
            setCompany(tempCompany);
            close();
            showToast('✅ Informations de l\'entreprise enregistrées');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setSavingCompany(false); }
    };

    // Persist notification + security preferences to app_settings
    const saveNotifs = async () => {
        try {
            const json = JSON.stringify(notifs);
            await settingsDb.set('notif_prefs', json);
            // Mirror to localStorage so NotifWatcher can read without a
            // network round-trip on every state change.
            try { localStorage.setItem('smartmaint-notif-prefs', json); } catch { /* SSR */ }
            close();
            showToast('✅ Préférences de notification enregistrées');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
    };
    const saveSecurity = async () => {
        try {
            await settingsDb.set('session_expiry', sessionExpiry);
            // Mirror the value into localStorage so AuthContext's idle
            // timer picks it up without needing a network round-trip on
            // every keystroke.
            const minutes = sessionExpiry === '15min' ? 15
                : sessionExpiry === '1h' ? 60
                : sessionExpiry === '8h' ? 480
                : 0; // 'never' → 0 → AuthContext skips idle timer
            try { localStorage.setItem('smartmaint-idle-min', String(minutes)); } catch { /* SSR */ }
            close();
            showToast('✅ Paramètres de sécurité enregistrés');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
    };
    const [tempLang, setTempLang] = useState<Locale>(locale.language);
    const [tempCur, setTempCur] = useState<Currency>(locale.currency);
    const [tempTz, setTempTz] = useState<Timezone>(locale.timezone);
    const [tempRate, setTempRate] = useState(locale.conversionRates[locale.currency]);
    const [lastSync, setLastSync] = useState('—');
    const [syncing, setSyncing] = useState(false);
    // Real rates state — hydrated from localStorage on mount, refreshed
    // from open.er-api.com on demand.
    const [liveRates, setLiveRates] = useState<LiveRate[]>(FALLBACK_RATES);
    useEffect(() => {
        try {
            const cached = localStorage.getItem('smartmaint-fx-cache');
            if (cached) {
                const parsed = JSON.parse(cached) as { rates: LiveRate[]; at: string };
                setLiveRates(parsed.rates);
                setLastSync(parsed.at);
            }
        } catch { /* ignore parse errors */ }
    }, []);

    const openLocale = () => {
        setTempLang(locale.language); setTempCur(locale.currency); setTempTz(locale.timezone);
        setTempRate(locale.conversionRates[locale.currency]); setActiveModal('locale');
    };

    const saveLocale = () => {
        setLanguage(tempLang); setCurrency(tempCur); setTimezone(tempTz);
        if(tempCur!=='MAD') setConversionRate(tempCur, tempRate);
        close(); showToast('✅ Paramètres régionaux appliqués instantanément');
    };


    const handleSync = async () => {
        setSyncing(true);
        try {
            // Free, key-less, CORS-friendly. Returns { rates: { EUR, USD, GBP, ... } }
            // where each value is 1 MAD in that currency, so we invert to get
            // "1 X = Y MAD" which is what the widget displays.
            const res = await fetch('https://open.er-api.com/v6/latest/MAD', { cache: 'no-store' });
            const data = await res.json();
            if (!data || data.result !== 'success' || !data.rates) throw new Error('Réponse invalide');
            const inv = (code: string) => {
                const v = data.rates[code];
                return typeof v === 'number' && v > 0 ? +(1 / v).toFixed(2) : 0;
            };
            const fresh: LiveRate[] = ([
                { from: 'EUR', to: 'MAD', rate: inv('EUR'), change: '' },
                { from: 'USD', to: 'MAD', rate: inv('USD'), change: '' },
                { from: 'GBP', to: 'MAD', rate: inv('GBP'), change: '' },
            ] as LiveRate[]).filter(r => r.rate > 0);
            // Compute delta vs. previously displayed rates so the user sees
            // the direction of the move ("+0.12", "-0.05").
            const withDelta: LiveRate[] = fresh.map(r => {
                const prev = liveRates.find(x => x.from === r.from);
                if (!prev || prev.rate === 0) return { ...r, change: '' };
                const d = +(r.rate - prev.rate).toFixed(2);
                return { ...r, change: d === 0 ? '±0.00' : (d > 0 ? `+${d}` : `${d}`) };
            });
            const at = new Date().toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            setLiveRates(withDelta);
            setLastSync(at);
            try { localStorage.setItem('smartmaint-fx-cache', JSON.stringify({ rates: withDelta, at })); } catch { /* ignore */ }
            showToast('✅ Taux mis à jour depuis open.er-api.com');
        } catch (err) {
            showToast(err instanceof Error ? `Erreur — ${err.message}` : 'Erreur réseau', 'error');
        } finally { setSyncing(false); }
    };
    // Auto-refresh once on first open so the widget isn't stuck on fallback.
    useEffect(() => {
        if (lastSync === '—') handleSync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
        showToast(newTheme === 'dark' ? '🌙 Dark mode activated' : newTheme === 'light' ? '☀️ Light mode activated' : '💻 System theme applied');
    };

    const langLabels: Record<string,string> = {fr:'Français',en:'English',ar:'العربية'};
    const themeLabels: Record<string,string> = {light:'☀️ Clair',dark:'🌙 Sombre',system:'💻 Système'};

    const cards = [
        {key:'company',icon:Building2,label:'Société',desc:'Identité de l\'entreprise (impressions, e-mails, en-têtes)',badge:company.name,badgeColor:'#3b82f6',color:'#3b82f6'},
        {key:'db',icon:Database,label:t('settings.database'),desc:'État de la connexion Supabase et des données',badge:`${totalRows} lignes`,badgeColor:'#22c55e',color:'#3b82f6'},
        {key:'notif',icon:Bell,label:t('settings.notifications'),desc:'Alertes et préférences',badge:`${Object.values(notifs).filter(Boolean).length}/4`,badgeColor:'#f59e0b',color:'#f59e0b'},
        {key:'security',icon:Shield,label:t('settings.security'),desc:'Accès et authentification',badge:`Session: ${sessionExpiry}`,badgeColor:'#8b5cf6',color:'#8b5cf6'},
        {key:'locale',icon:Globe,label:t('settings.locale'),desc:'Paramètres régionaux',badge:`${langLabels[locale.language]} · ${locale.currency}`,badgeColor:'#10b981',color:'#10b981'},
        {key:'approval',icon:FileCheck,label:'Seuil d\'approbation des achats',desc:'Montant au-delà duquel un bon de commande exige une validation',badge:`${parseInt(approvalThreshold,10).toLocaleString('fr-FR')} MAD`,badgeColor:'#f59e0b',color:'#f59e0b'},
        {key:'kpi',icon:Calculator,label:'KPI Formula Builder',desc:'Créer des indicateurs personnalisés',badge:'Notion-style',badgeColor:'#8b5cf6',color:'#8b5cf6'},
    ];

    const themeOptions: { key: Theme; label: string; icon: React.ElementType; desc: string }[] = [
        { key: 'light', label: 'Clair', icon: Sun, desc: 'Interface classique' },
        { key: 'dark', label: 'Sombre', icon: Moon, desc: 'Futuriste industriel' },
        { key: 'system', label: 'Système', icon: Monitor, desc: 'Suit l\'OS' },
    ];

    return (
        <>
            <Header title={t('page.settings.title')} subtitle={t('page.settings.subtitle')} />
            <main style={{padding:'24px 32px',maxWidth:900,margin:'0 auto'}}>

                {/* ========== TUTORIAL REPLAY ========== */}
                <div data-tour="settings-tutorial" style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={18} color="#3b82f6" /> Aide & tutoriel
                    </h2>
                    <button onClick={replayTutorial} className="card" style={{
                        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                        padding: '16px 20px', cursor: 'pointer', textAlign: 'left',
                        border: '1px solid var(--border)', background: 'var(--surface)',
                        fontFamily: 'inherit',
                    }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Sparkles size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Revoir le tutoriel</div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                Relance le tour guidé qui explique chaque fonctionnalité de votre interface.
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </button>
                </div>

                {/* ========== APPEARANCE SECTION ========== */}
                <div data-tour="settings-appearance" style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Palette size={18} color="var(--primary)" /> Apparence
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        {themeOptions.map(th => {
                            const Icon = th.icon;
                            const isActive = theme === th.key;
                            return (
                                <button key={th.key} data-tour="settings-theme-btn" data-theme={th.key} onClick={() => handleThemeChange(th.key)} style={{
                                    padding: '24px 16px', borderRadius: 16,
                                    border: isActive ? '2px solid var(--primary)' : '2px solid var(--border)',
                                    background: isActive ? 'var(--primary-lighter)' : 'var(--surface)',
                                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                                    transition: 'all 0.25s ease', position: 'relative', overflow: 'hidden',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--primary-light)'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
                                >
                                    <div style={{
                                        width: 52, height: 52, borderRadius: 14,
                                        background: isActive ? 'var(--primary)' : 'var(--surface-hover)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.25s ease',
                                    }}>
                                        <Icon size={24} color={isActive ? 'white' : 'var(--text-muted)'} />
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: 14, color: isActive ? 'var(--primary)' : 'var(--text-primary)' }}>{th.label}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{th.desc}</span>
                                    {isActive && <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ========== LIVE CURRENCY WIDGET ========== */}
                <div data-tour="settings-currency" style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={18} color="#10b981" /> Taux de Change en Direct
                    </h2>
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    🇲🇦
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>MAD — Dirham Marocain</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Devise de base — dernière maj : {lastSync}</div>
                                </div>
                            </div>
                            <button onClick={handleSync} disabled={syncing} style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
                                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
                                transition: 'all 0.2s',
                            }}>
                                <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                                {syncing ? 'Syncing...' : 'Refresh'}
                            </button>
                        </div>

                        {/* Live rates ticker */}
                        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {liveRates.map(rate => (
                                <div key={rate.from} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 14px', borderRadius: 10, background: 'var(--surface-hover)',
                                    transition: 'all 0.2s',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>1 {rate.from}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>=</span>
                                        <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>{rate.rate} MAD</span>
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                        background: !rate.change || rate.change === '—' || rate.change === '±0.00' ? 'var(--surface-hover)'
                                            : rate.change.startsWith('+') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: !rate.change || rate.change === '—' || rate.change === '±0.00' ? 'var(--text-muted)'
                                            : rate.change.startsWith('+') ? '#10b981' : '#ef4444',
                                    }}>{rate.change || '—'}</span>
                                </div>
                            ))}
                        </div>

                        {/* Sync badge */}
                        <div style={{
                            padding: '10px 20px', borderTop: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 2s infinite' }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <Wifi size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                Synced Live via API: <b style={{ color: 'var(--text-secondary)' }}>{lastSync}</b>
                            </span>
                        </div>
                    </div>
                </div>

                {/* ========== SETTINGS CARDS ========== */}
                <div data-tour="settings-cards" style={{display:'flex',flexDirection:'column',gap:12}}>
                    {cards.map(card=>{
                        const Icon=card.icon;
                        return (
                            <button key={card.key} data-tour="settings-card" data-card={card.key} onClick={()=>card.key==='locale'?openLocale():card.key==='approval'?openThreshold():card.key==='company'?openCompany():setActiveModal(card.key)} style={{
                                display:'flex',alignItems:'center',gap:16,padding:'20px 24px',borderRadius:16,
                                background:'var(--surface)',border:'1px solid var(--border)',cursor:'pointer',textAlign:'left',width:'100%',transition:'all 0.2s',
                            }} onMouseEnter={e=>{e.currentTarget.style.borderColor=card.color;e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.06)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='none';}}>
                                <div style={{width:48,height:48,borderRadius:12,background:`${card.color}15`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon size={24} color={card.color}/></div>
                                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>{card.label}</div><div style={{fontSize:13,color:'var(--text-muted)',marginTop:2}}>{card.desc}</div></div>
                                <span style={{fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:100,background:`${card.badgeColor}15`,color:card.badgeColor}}>{card.badge}</span>
                                <ChevronRight size={18} color="var(--text-muted)"/>
                            </button>
                        );
                    })}
                </div>
            </main>

            {/* DB Status Modal — live Supabase connection + data overview */}
            <Modal isOpen={activeModal==='db'} onClose={close} title="🗄️ Base de données" size="md"
                footer={<><button onClick={close} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button onClick={handleRefreshData} disabled={dataLoading} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:dataLoading?'wait':'pointer',opacity:dataLoading?0.7:1,display:'flex',alignItems:'center',gap:6}}><RefreshCw size={14} style={{animation:dataLoading?'spin 1s linear infinite':'none'}}/>{dataLoading?'Chargement...':'Recharger les données'}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:18}}>
                    {/* Connection status */}
                    <div style={{display:'flex',alignItems:'center',gap:12,padding:16,background:'rgba(34,197,94,0.08)',borderRadius:12,border:'1px solid rgba(34,197,94,0.2)'}}>
                        <div style={{width:40,height:40,borderRadius:10,background:'rgba(34,197,94,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <CheckCircle2 size={22} color="#22c55e"/>
                        </div>
                        <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:14,color:'var(--text-primary)'}}>Connecté à Supabase Cloud</div>
                            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Synchronisation temps réel active sur 8 tables</div>
                        </div>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',animation:'dotPulse 2s infinite'}}/>
                    </div>

                    {/* Project URL */}
                    <div>
                        <label style={lS}>Projet</label>
                        <div style={{padding:'10px 14px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:13,fontFamily:'monospace',color:'var(--text-secondary)',wordBreak:'break-all'}}>
                            {supabaseUrl || 'Non configuré'}
                        </div>
                    </div>

                    {/* Table row counts */}
                    <div>
                        <label style={lS}>Données stockées ({totalRows} lignes au total)</label>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                            {tableCounts.map(tc=>(
                                <div key={tc.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border-light)'}}>
                                    <span style={{fontSize:13,color:'var(--text-secondary)'}}>{tc.label}</span>
                                    <span style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{tc.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{padding:12,borderRadius:10,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)',fontSize:12,color:'var(--primary)'}}>
                        💡 Toutes les modifications sont enregistrées automatiquement et synchronisées en temps réel entre les utilisateurs.
                    </div>
                </div>
            </Modal>

            {/* Notif Modal — these toggles used to save to app_settings.notif_prefs
                but nothing consumed them. Now they mirror the master switches in
                Alertes and additionally control the in-app pop-ups so the admin
                sees a coherent story. Real routing (emails, WhatsApp) lives on
                /alertes with per-recipient control. */}
            <Modal isOpen={activeModal==='notif'} onClose={close} title={`🔔 ${t('settings.notifications')}`} size="md"
                footer={<><button onClick={close} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button onClick={saveNotifs} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:'pointer'}}>{t('action.save')}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div style={{padding:'12px 14px',borderRadius:10,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)',fontSize:12.5,color:'var(--primary)',lineHeight:1.55}}>
                        Ces bascules contrôlent les <b>pop-ups à l&apos;écran</b> pour VOUS sur ce navigateur. Pour l&apos;envoi <b>e-mail / WhatsApp</b> à toute votre équipe, allez sur <a href="/alertes" style={{color:'var(--primary)',fontWeight:700}}>Alertes</a> — routage fin par personne et par canal.
                    </div>
                    {[{key:'stock' as const,label:'Rupture de stock',desc:'Pop-up quand une pièce atteint le seuil minimal'},
                      {key:'panne' as const,label:'Panne critique',desc:'Pop-up dès qu\'un opérateur signale une panne'},
                      {key:'validation' as const,label:'Bons de commande à valider',desc:'Rappel des BC en attente d\'approbation'},
                      {key:'email' as const,label:'Résumé quotidien',desc:'Une notification récap le matin à 8 h'},
                    ].map(item=>(<div key={item.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--border-light)'}}>
                        <div><div style={{fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>{item.label}</div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{item.desc}</div></div>
                        <Toggle on={notifs[item.key]} onChange={()=>setNotifs(n=>({...n,[item.key]:!n[item.key]}))}/>
                    </div>))}
                </div>
            </Modal>

            {/* Security */}
            <Modal isOpen={activeModal==='security'} onClose={close} title={`🛡️ ${t('settings.security')}`} size="md"
                footer={<button onClick={saveSecurity} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:'pointer'}}>{t('action.save')}</button>}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <button onClick={()=>{ setPwNew(''); setPwConfirm(''); setPwOpen(true); }} style={{width:'100%',padding:'12px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',cursor:'pointer',fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>🔑 Changer le mot de passe</button>
                    <div>
                        <label style={lS}>Auto-déconnexion après inactivité</label>
                        <select style={iS} value={sessionExpiry} onChange={e=>setSessionExpiry(e.target.value)}>
                            <option value="15min">15 minutes sans activité</option>
                            <option value="1h">1 heure sans activité</option>
                            <option value="8h">8 heures sans activité</option>
                            <option value="never">Jamais (session sans limite)</option>
                        </select>
                        <div style={{marginTop:8,padding:10,borderRadius:8,background:'var(--surface-hover)',border:'1px solid var(--border-light)',fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>
                            💡 Après cette période <b>sans clic / clavier / souris</b>, vous êtes redirigé vers l&apos;écran de connexion. Vous vous reconnectez avec <b>votre mot de passe habituel</b> — ce paramètre <b>ne change pas votre mot de passe</b>. Utile pour les postes partagés ou l&apos;écran de contrôle laissé ouvert.
                        </div>
                    </div>
                    <button onClick={()=>setConfirmForceLogout(true)} style={{width:'100%',padding:'12px',borderRadius:10,background:'var(--accent-red-light)',border:'1px solid var(--accent-red)',cursor:'pointer',fontWeight:600,fontSize:14,color:'var(--accent-red)'}}>🚫 Forcer la déconnexion sur tous les appareils</button>
                </div>
            </Modal>

            {/* Password change modal */}
            <Modal isOpen={pwOpen} onClose={()=>setPwOpen(false)} title="🔑 Changer le mot de passe" size="sm"
                footer={<>
                    <button onClick={()=>setPwOpen(false)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                    <button onClick={savePassword} disabled={pwBusy} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:pwBusy?'wait':'pointer',opacity:pwBusy?0.7:1}}>{pwBusy?'...':t('action.save')}</button>
                </>}>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    <div><label style={lS}>Nouveau mot de passe (8 caractères min.)</label><input type="password" style={iS} value={pwNew} onChange={e=>setPwNew(e.target.value)} autoComplete="new-password" /></div>
                    <div><label style={lS}>Confirmer</label><input type="password" style={iS} value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} autoComplete="new-password" /></div>
                    <div style={{padding:12,borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border-light)',fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.5}}>
                        💡 Le changement s&apos;applique immédiatement — vous restez connecté sur cet appareil. Utilisez « Forcer la déconnexion » pour révoquer vos autres sessions.
                    </div>
                </div>
            </Modal>

            {/* Force logout confirmation — real signOut(scope:global) */}
            <Modal isOpen={confirmForceLogout} onClose={()=>setConfirmForceLogout(false)} title="🚫 Forcer la déconnexion" size="sm"
                footer={<>
                    <button onClick={()=>setConfirmForceLogout(false)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                    <button onClick={async()=>{ setConfirmForceLogout(false); await doForceLogout(); }} style={{padding:'10px 20px',borderRadius:10,background:'#b91c1c',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',cursor:'pointer'}}>Oui, tout révoquer</button>
                </>}>
                <div style={{fontSize:14,color:'var(--text-primary)',lineHeight:1.6}}>
                    Toutes vos sessions actives (ordinateur, téléphone, tablette) seront révoquées.
                    <div style={{marginTop:10,fontSize:12.5,color:'var(--text-muted)'}}>Vous serez redirigé vers la page de connexion sur chaque appareil.</div>
                </div>
            </Modal>

            {/* Locale Modal */}
            <Modal isOpen={activeModal==='locale'} onClose={close} title={`🌍 ${t('settings.locale')}`} size="md"
                footer={<><button onClick={close} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button onClick={saveLocale} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:'pointer'}}>{t('action.save')}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div><label style={lS}>{t('settings.language')}</label><select style={iS} value={tempLang} onChange={e=>setTempLang(e.target.value as Locale)}><option value="fr">🇫🇷 Français</option><option value="en">🇬🇧 English</option><option value="ar">🇲🇦 العربية</option></select></div>
                    <div><label style={lS}>{t('settings.currency')}</label><select style={iS} value={tempCur} onChange={e=>{const c=e.target.value as Currency;setTempCur(c);setTempRate(locale.conversionRates[c]);}}><option value="MAD">🇲🇦 MAD — Dirham Marocain</option><option value="EUR">🇪🇺 EUR — Euro</option><option value="USD">🇺🇸 USD — Dollar US</option></select></div>
                    <div><label style={lS}>{t('settings.timezone')}</label><select style={iS} value={tempTz} onChange={e=>setTempTz(e.target.value as Timezone)}><option value="Africa/Casablanca">(GMT+1) Casablanca</option><option value="Europe/Paris">(GMT+1) Paris</option><option value="America/New_York">(GMT-5) New York</option><option value="Asia/Dubai">(GMT+4) Dubai</option></select></div>
                    <div style={{padding:12,borderRadius:10,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)',fontSize:12,color:'var(--primary)'}}>
                        💡 Les changements s&apos;appliquent <b>instantanément</b> — pas besoin de recharger la page.
                    </div>
                </div>
            </Modal>

            {/* Approval threshold Modal */}
            <Modal isOpen={activeModal==='approval'} onClose={close} title="✅ Seuil d'approbation des achats" size="md"
                footer={<><button onClick={close} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button onClick={saveThreshold} disabled={savingThreshold} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:savingThreshold?'wait':'pointer',opacity:savingThreshold?0.7:1}}>{t('action.save')}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div>
                        <label style={lS}>Montant du seuil (MAD)</label>
                        <input type="number" min={0} step={500} style={iS} value={tempThreshold} onChange={e=>setTempThreshold(e.target.value)} />
                    </div>
                    <div style={{padding:14,borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:13,color:'var(--text-secondary)',lineHeight:1.6}}>
                        <b style={{color:'var(--text-primary)'}}>Comment ça marche :</b><br/>
                        • Un bon de commande dont le total <b>dépasse {parseInt(tempThreshold||'0',10).toLocaleString('fr-FR')} MAD</b> passe en statut <span style={{color:'#f59e0b',fontWeight:700}}>« En attente d'approbation »</span> et ne peut pas être envoyé tant qu'il n'est pas validé par un responsable.<br/>
                        • En dessous de ce montant, le bon est <span style={{color:'#22c55e',fontWeight:700}}>auto-approuvé</span> et peut être envoyé directement.
                    </div>
                </div>
            </Modal>

            {/* Company Info Modal — drives PDF headers, e-mail signatures, etc. */}
            <Modal isOpen={activeModal==='company'} onClose={close} title="🏭 Société" size="md"
                footer={<><button onClick={close} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button onClick={saveCompany} disabled={savingCompany} style={{padding:'10px 20px',borderRadius:10,background:'var(--primary)',color:'white',border:'none',fontSize:13.5,fontWeight:600,boxShadow:'0 1px 0 rgba(11,18,32,0.08)',transition:'background 0.15s ease',cursor:savingCompany?'wait':'pointer',opacity:savingCompany?0.7:1}}>{t('action.save')}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    <div>
                        <label style={lS}>Nom de l&apos;entreprise *</label>
                        <input style={iS} value={tempCompany.name} onChange={e=>setTempCompany(c=>({...c,name:e.target.value}))} placeholder="L.C PROD" />
                    </div>
                    <div>
                        <label style={lS}>Secteur d&apos;activité</label>
                        <input style={iS} value={tempCompany.sector} onChange={e=>setTempCompany(c=>({...c,sector:e.target.value}))} placeholder="Agroalimentaire — Huile d&apos;olive et produits dérivés" />
                    </div>
                    <div>
                        <label style={lS}>Adresse</label>
                        <input style={iS} value={tempCompany.address} onChange={e=>setTempCompany(c=>({...c,address:e.target.value}))} placeholder="Zone industrielle, Maroc" />
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div>
                            <label style={lS}>Téléphone</label>
                            <input style={iS} value={tempCompany.phone} onChange={e=>setTempCompany(c=>({...c,phone:e.target.value}))} placeholder="+212 5 XX XX XX XX" />
                        </div>
                        <div>
                            <label style={lS}>Email</label>
                            <input style={iS} type="email" value={tempCompany.email} onChange={e=>setTempCompany(c=>({...c,email:e.target.value}))} placeholder="contact@lcprod.ma" />
                        </div>
                    </div>
                    <div>
                        <label style={lS}>ICE / Identifiant fiscal</label>
                        <input style={iS} value={tempCompany.ice} onChange={e=>setTempCompany(c=>({...c,ice:e.target.value}))} placeholder="00XXXXXXXXXXXXX" />
                    </div>
                    <div style={{padding:12,borderRadius:10,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)',fontSize:12,color:'var(--primary)',lineHeight:1.5}}>
                        💡 Ces informations apparaissent en en-tête des dossiers imprimés (HACCP, étalonnage) et dans les rapports automatiques.
                    </div>
                </div>
            </Modal>

            {/* KPI Formula Builder Modal */}
            <Modal isOpen={activeModal==='kpi'} onClose={close} title="📊 KPI Formula Builder" size="lg">
                <KPIFormulaBuilder />
            </Modal>

            <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
