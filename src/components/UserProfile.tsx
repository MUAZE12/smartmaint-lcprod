'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/lib/supabase';
import { personnelDb, techniciansDb } from '@/lib/db';
import SlideOver from '@/components/ui/SlideOver';
import { useToast } from '@/components/ui/Toast';
import {
    Camera, User, Mail, Phone, Lock, Eye, EyeOff,
    Sun, Moon, Monitor, Bell, BellOff, Shield,
    Award, MapPin, Wrench, Save, Sparkles,
} from 'lucide-react';
import { resetTutorial } from '@/components/TutorialTour';

interface UserProfileProps {
    isOpen: boolean;
    onClose: () => void;
}

const iS: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--background)',
    fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none',
};

const lS: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 16, paddingBottom: 10,
    borderBottom: '1px solid var(--border-light)',
};

// Mock user profile data per role
const profileData = {
    admin: {
        name: 'Mounir El Idrissi',
        phone: '+212 6 00 11 22 33',
        email: 'mounir.elidrissi@smartmaint.ma',
        role: 'Administrateur',
        workshop: 'Tous les ateliers',
        specialties: ['Gestion', 'Planification', 'Analyse KPI'],
    },
    technician: {
        name: 'Ahmed El Amrani',
        phone: '+212 6 12 34 56 78',
        email: 'ahmed.elamrani@smartmaint.ma',
        role: 'Technicien',
        workshop: 'Ligne de remplissage',
        specialties: ['Mécanique', 'Électrique', 'Hydraulique'],
    },
    operator: {
        name: 'Karim Benjelloun',
        phone: '+212 6 55 66 77 88',
        email: 'karim.benjelloun@smartmaint.ma',
        role: 'Opérateur',
        workshop: 'Ligne de conditionnement',
        specialties: ['Conduite de ligne', 'Contrôle qualité'],
    },
};

type ThemeOption = 'light' | 'dark' | 'system';

const DEFAULT_ALERTS = { breakdowns: true, stock: true, reports: false, preventive: true };

/** Downscale + re-encode the avatar so it fits in user_metadata
 *  (Supabase soft-limit ≈ 64 KB) and in technicians.imageUrl (JSONB row).
 *  Mirrors compressPhoto from technician/report — 256 px square @ jpeg .8 → ~25 KB. */
async function compressAvatar(file: File): Promise<string> {
    const reader = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = reader;
    });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reader;
    // Square crop, centered
    const min = Math.min(img.width, img.height);
    const sx = (img.width - min) / 2;
    const sy = (img.height - min) / 2;
    ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.8);
}

export default function UserProfile({ isOpen, onClose }: UserProfileProps) {
    const { user } = useAuth();
    const { personnel, technicians } = useData();
    const { showToast } = useToast();
    // Theme comes from the real ThemeContext — applies + persists to localStorage instantly.
    const { theme, setTheme } = useTheme();

    const role = user?.role || 'admin';
    const profile = profileData[role];
    const isArabic = role === 'operator';
    // localStorage key namespaced per user so each account keeps its own profile prefs
    const prefsKey = `smartmaint-profile-${user?.supabaseId || role}`;

    // The matching row for this user (so admin's Personnel page sees edits live).
    // Operators live in `personnel`, technicians live in `technicians` — match in
    // the right table by email first, then by full name.
    const myPersonnel = useMemo(() => {
        if (!user || user.role !== 'operator') return null;
        const e = user.email?.toLowerCase();
        if (e) {
            const byEmail = personnel.find(p => p.email && p.email.toLowerCase() === e);
            if (byEmail) return byEmail;
        }
        const n = user.name?.toLowerCase();
        if (n) {
            const byName = personnel.find(p => p.nom && p.nom.toLowerCase() === n);
            if (byName) return byName;
        }
        return null;
    }, [personnel, user]);

    const myTechnician = useMemo(() => {
        if (!user || user.role !== 'technician') return null;
        const e = user.email?.toLowerCase();
        if (e) {
            const byEmail = technicians.find(t => t.email && t.email.toLowerCase() === e);
            if (byEmail) return byEmail;
        }
        const n = user.name?.toLowerCase();
        if (n) {
            const byName = technicians.find(t => t.fullName && t.fullName.toLowerCase() === n);
            if (byName) return byName;
        }
        return null;
    }, [technicians, user]);

    // Form state — seeded from the live auth user (avatar + phone come from
    // user_metadata, so they appear instantly after a previous save).
    const [name, setName] = useState(user?.name || profile.name);
    const [phone, setPhone] = useState(user?.phone || profile.phone);
    const [email, setEmail] = useState(user?.email || profile.email);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Prefill from the live employee row when it's found (and only when its identity
    // changes, so we don't clobber the user's in-progress typing on every realtime tick).
    useEffect(() => {
        if (myTechnician) {
            if (myTechnician.fullName) setName(myTechnician.fullName);
            if (myTechnician.phone) setPhone(myTechnician.phone);
            if (myTechnician.email) setEmail(myTechnician.email);
            if (myTechnician.imageUrl) setAvatarPreview(myTechnician.imageUrl);
        } else if (myPersonnel) {
            if (myPersonnel.nom) setName(myPersonnel.nom);
            if (myPersonnel.telephone) setPhone(myPersonnel.telephone);
            if (myPersonnel.email) setEmail(myPersonnel.email);
            if (myPersonnel.imageUrl) setAvatarPreview(myPersonnel.imageUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myPersonnel?.id, myTechnician?.id]);

    // Security
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [showCurrentPwd, setShowCurrentPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);

    // Preferences
    const [emailAlerts, setEmailAlerts] = useState(DEFAULT_ALERTS);

    // Load per-device prefs (email-alert toggles only — profile fields
    // come from Supabase via useAuth so they sync across devices).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(prefsKey);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved.emailAlerts) setEmailAlerts({ ...DEFAULT_ALERTS, ...saved.emailAlerts });
            }
        } catch { /* ignore */ }
    }, [prefsKey]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await compressAvatar(file);
            setAvatarPreview(dataUrl);
            showToast('Photo prête — cliquez Enregistrer pour la sauvegarder');
        } catch {
            showToast('Erreur lors du traitement de l\'image', 'error');
        }
    };

    const handleSave = async () => {
        if (newPwd && newPwd !== confirmPwd) {
            showToast('Les mots de passe ne correspondent pas', 'error');
            return;
        }
        setSaving(true);
        try {
            // 1) Password change via Supabase Auth (if a new password was entered)
            if (newPwd) {
                if (newPwd.length < 6) {
                    showToast('Le mot de passe doit faire au moins 6 caractères', 'error');
                    setSaving(false);
                    return;
                }
                const { error } = await supabase.auth.updateUser({ password: newPwd });
                if (error) {
                    showToast(`Mot de passe : ${error.message}`, 'error');
                    setSaving(false);
                    return;
                }
                setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
            }

            // 2) Single source of truth for the user's identity: Supabase auth
            //    user_metadata. Header / Sidebar / UserProfile all read from
            //    here via the AuthContext, so the change shows up everywhere
            //    after the next auth refresh (instant in this session).
            if (user) {
                const metaPatch: Record<string, string | null> = {};
                if (name.trim() && name.trim() !== user.name) metaPatch.full_name = name.trim();
                if (phone.trim() !== (user.phone ?? '')) metaPatch.phone = phone.trim();
                if (avatarPreview !== (user.avatarUrl ?? null)) metaPatch.avatar_url = avatarPreview;
                if (Object.keys(metaPatch).length > 0) {
                    const { error } = await supabase.auth.updateUser({ data: metaPatch });
                    if (error) console.warn('[profile] auth metadata update failed:', error.message);
                    // Force the session to refresh so useAuth picks up the new
                    // metadata immediately (without waiting for the next
                    // onAuthStateChange tick).
                    try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
                }
            }

            // 3) Mirror the profile to the right table so other roles (admin) see
            //    the change live. Technicians live in `technicians`, operators in
            //    `personnel`. Both tables are realtime-subscribed via DataContext.
            if (user?.role === 'technician') {
                const payload = {
                    fullName: name.trim() || user.name || '',
                    specialty: myTechnician?.specialty ?? '',
                    phone: phone.trim(),
                    email: email.trim(),
                    availability: myTechnician?.availability ?? 'disponible',
                    imageUrl: avatarPreview || undefined,
                };
                try {
                    if (myTechnician) await techniciansDb.update(myTechnician.id, payload);
                    else await techniciansDb.create(payload);
                } catch (e) {
                    console.warn('[profile] technicians sync failed:', e);
                    showToast('Profil enregistré localement, mais la sync admin a échoué', 'error');
                }
            } else if (user?.role === 'operator') {
                const payload = {
                    nom: name.trim() || user.name || '',
                    role: 'operateur' as const,
                    telephone: phone.trim(),
                    email: email.trim(),
                    imageUrl: avatarPreview || undefined,
                    specialite: myPersonnel?.specialite ?? '',
                    statut: (myPersonnel?.statut ?? 'actif') as 'actif' | 'inactif',
                };
                try {
                    if (myPersonnel) await personnelDb.update(myPersonnel.id, payload);
                    else await personnelDb.create(payload);
                } catch (e) {
                    console.warn('[profile] personnel sync failed:', e);
                    showToast('Profil enregistré localement, mais la sync admin a échoué', 'error');
                }
            }
            // Admin: nothing to mirror (no admin listing table). user_metadata
            // is enough — Header / Sidebar pick up the avatar from there.

            // 4) Local prefs that are purely per-device (email-alerts toggles).
            //    Avatar + phone no longer live here — they're in Supabase.
            try {
                localStorage.setItem(prefsKey, JSON.stringify({ emailAlerts }));
            } catch { /* ignore quota errors */ }

            // 5) Theme is already applied + persisted by ThemeContext on click.
            showToast('Profil enregistré avec succès');
            onClose();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error');
        } finally {
            setSaving(false);
        }
    };

    const themeOptions: { key: ThemeOption; label: string; icon: React.ElementType }[] = [
        { key: 'light', label: isArabic ? 'فاتح' : 'Clair', icon: Sun },
        { key: 'dark', label: isArabic ? 'داكن' : 'Sombre', icon: Moon },
        { key: 'system', label: isArabic ? 'النظام' : 'Système', icon: Monitor },
    ];

    const roleColors: Record<string, { bg: string; color: string }> = {
        'Administrateur': { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
        'Technicien': { bg: 'rgba(249,115,22,0.1)', color: '#f97316' },
        'Opérateur': { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    };

    return (
        <SlideOver
            isOpen={isOpen}
            onClose={onClose}
            title={isArabic ? 'ملفي الشخصي' : 'Mon Compte'}
            subtitle={isArabic ? 'إدارة ملفك الشخصي والتفضيلات' : 'Gérer votre profil et vos préférences'}
            width={520}
            footer={
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: '12px', borderRadius: 12,
                        background: 'var(--surface-hover)', border: '1px solid var(--border)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)',
                    }}>
                        {isArabic ? 'إلغاء' : 'Annuler'}
                    </button>
                    <button onClick={handleSave} disabled={saving} style={{
                        flex: 1, padding: '12px', borderRadius: 12,
                        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                        color: 'white', border: 'none', fontSize: 14, fontWeight: 600,
                        cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                        <Save size={16} /> {saving ? (isArabic ? 'جارٍ الحفظ…' : 'Enregistrement…') : (isArabic ? 'حفظ' : 'Enregistrer')}
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {/* ====== AVATAR SECTION ====== */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            width: 100, height: 100, borderRadius: '50%',
                            background: avatarPreview
                                ? `url(${avatarPreview}) center/cover`
                                : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', position: 'relative',
                            border: '3px solid var(--border)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                    >
                        {!avatarPreview && (
                            <span style={{ color: 'white', fontSize: 32, fontWeight: 700 }}>
                                {user?.avatar || 'ME'}
                            </span>
                        )}
                        <div style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            border: '2px solid var(--surface)',
                        }}>
                            <Camera size={14} color="white" />
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        style={{ display: 'none' }}
                    />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{name || profile.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                            {isArabic ? 'اضغط على الصورة لتغييرها' : 'Cliquer sur l\'avatar pour modifier la photo'}
                        </div>
                    </div>
                </div>

                {/* ====== TUTORIAL REPLAY (visible to all roles) ====== */}
                <button
                    type="button"
                    onClick={() => {
                        resetTutorial(user?.supabaseId);
                        window.dispatchEvent(new Event('smartmaint-replay-tutorial'));
                        onClose();
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px', borderRadius: 14,
                        border: '1px solid rgba(59,130,246,0.25)',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05))',
                        cursor: 'pointer', textAlign: isArabic ? 'right' : 'left', fontFamily: 'inherit',
                        width: '100%',
                    }}
                >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sparkles size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isArabic ? '🎓 إعادة عرض الدليل' : 'Revoir le tutoriel'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {isArabic ? 'استعرض ميزات واجهتك مرة أخرى' : 'Découvrez à nouveau les fonctionnalités de votre interface'}
                        </div>
                    </div>
                </button>

                {/* ====== PERSONAL INFO ====== */}
                <div>
                    <div style={sectionTitle}>
                        <User size={16} color="var(--primary)" /> {isArabic ? 'المعلومات الشخصية' : 'Informations Personnelles'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={lS}><User size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> {isArabic ? 'الاسم الكامل' : 'Nom complet'}</label>
                            <input style={iS} value={name} onChange={e => setName(e.target.value)} placeholder={isArabic ? 'الاسم الكامل' : 'Votre nom'} />
                        </div>
                        <div>
                            <label style={lS}><Phone size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> {isArabic ? 'الهاتف' : 'Téléphone'}</label>
                            <input style={iS} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+212 6 XX XX XX XX" />
                        </div>
                        <div>
                            <label style={lS}><Mail size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> {isArabic ? 'البريد الإلكتروني' : 'Email'}</label>
                            <input style={iS} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre.email@smartmaint.ma" />
                        </div>
                    </div>
                </div>

                {/* ====== SECURITY ====== */}
                <div>
                    <div style={sectionTitle}>
                        <Shield size={16} color="#ef4444" /> {isArabic ? 'الأمان' : 'Sécurité'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={lS}><Lock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> {isArabic ? 'كلمة المرور الحالية' : 'Mot de passe actuel'}</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    style={iS}
                                    type={showCurrentPwd ? 'text' : 'password'}
                                    value={currentPwd}
                                    onChange={e => setCurrentPwd(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                                >
                                    {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={lS}>{isArabic ? 'كلمة المرور الجديدة' : 'Nouveau mot de passe'}</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        style={iS}
                                        type={showNewPwd ? 'text' : 'password'}
                                        value={newPwd}
                                        onChange={e => setNewPwd(e.target.value)}
                                        placeholder="••••••••"
                                    />
                                    <button
                                        onClick={() => setShowNewPwd(!showNewPwd)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                                    >
                                        {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label style={lS}>{isArabic ? 'تأكيد كلمة المرور' : 'Confirmer le mot de passe'}</label>
                                <input
                                    style={{
                                        ...iS,
                                        borderColor: confirmPwd && newPwd !== confirmPwd ? '#ef4444' : 'var(--border)',
                                    }}
                                    type="password"
                                    value={confirmPwd}
                                    onChange={e => setConfirmPwd(e.target.value)}
                                    placeholder="••••••••"
                                />
                                {confirmPwd && newPwd !== confirmPwd && (
                                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>
                                        {isArabic ? 'كلمات المرور غير متطابقة' : 'Les mots de passe ne correspondent pas'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ====== PREFERENCES ====== */}
                <div>
                    <div style={sectionTitle}>
                        <Sun size={16} color="#f59e0b" /> {isArabic ? 'التفضيلات' : 'Préférences'}
                    </div>

                    {/* Theme Toggle */}
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ ...lS, marginBottom: 10 }}>{isArabic ? 'الوضع الداكن / الفاتح' : 'Thème'}</label>
                        <div style={{ display: 'flex', gap: 6, background: 'var(--surface-hover)', borderRadius: 12, padding: 4 }}>
                            {themeOptions.map(opt => {
                                const Icon = opt.icon;
                                const isActive = theme === opt.key;
                                return (
                                    <button
                                        key={opt.key}
                                        onClick={() => setTheme(opt.key)}
                                        style={{
                                            flex: 1, padding: '10px 12px', borderRadius: 8,
                                            background: isActive ? 'var(--surface)' : 'transparent',
                                            border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            fontSize: 13, fontWeight: isActive ? 700 : 500,
                                            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                            boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <Icon size={14} /> {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Email Alerts */}
                    <div>
                        <label style={{ ...lS, marginBottom: 10 }}>{isArabic ? 'تنبيهات البريد الإلكتروني' : 'Alertes par email'}</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { key: 'breakdowns' as const, label: isArabic ? 'الأعطال الحرجة' : 'Pannes critiques', icon: Bell, desc: isArabic ? 'إشعار في حالة عطل الآلة' : 'Notifié en cas de panne machine' },
                                { key: 'stock' as const, label: isArabic ? 'تنبيهات المخزون' : 'Alertes stock', icon: Bell, desc: isArabic ? 'عند بلوغ الحد الأدنى للمخزون' : 'Seuils de stock minimum atteints' },
                                { key: 'reports' as const, label: isArabic ? 'التقارير الأسبوعية' : 'Rapports hebdomadaires', icon: BellOff, desc: isArabic ? 'ملخص مؤشرات الأداء كل إثنين' : 'Résumé des KPI chaque lundi' },
                                { key: 'preventive' as const, label: isArabic ? 'الصيانة الوقائية' : 'Maintenance préventive', icon: Bell, desc: isArabic ? 'تذكيرات الصيانة المخططة' : 'Rappels des maintenances planifiées' },
                            ].map(alert => (
                                <label
                                    key={alert.key}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 10,
                                        border: '1px solid var(--border-light)',
                                        cursor: 'pointer',
                                        background: emailAlerts[alert.key] ? 'rgba(59,130,246,0.03)' : 'transparent',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={emailAlerts[alert.key]}
                                        onChange={() => setEmailAlerts(prev => ({ ...prev, [alert.key]: !prev[alert.key] }))}
                                        style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'pointer' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600 }}>{alert.label}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{alert.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ====== BADGES & SKILLS ====== */}
                <div>
                    <div style={sectionTitle}>
                        <Award size={16} color="#8b5cf6" /> {isArabic ? 'الشارات والمهارات' : 'Badges & Compétences'}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Role */}
                        <div>
                            <label style={lS}>{isArabic ? 'الدور' : 'Rôle'}</label>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px', borderRadius: 100,
                                background: roleColors[profile.role]?.bg || '#f1f5f9',
                                color: roleColors[profile.role]?.color || '#64748b',
                                fontSize: 13, fontWeight: 700,
                            }}>
                                <Shield size={13} /> {profile.role}
                            </span>
                        </div>

                        {/* Workshop */}
                        <div>
                            <label style={lS}>{isArabic ? 'الورشة المعينة' : 'Atelier assigné'}</label>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px', borderRadius: 100,
                                background: '#f1f5f9', color: '#475569',
                                fontSize: 13, fontWeight: 600,
                            }}>
                                <MapPin size={13} /> {profile.workshop}
                            </span>
                        </div>

                        {/* Specialties */}
                        <div>
                            <label style={lS}>{isArabic ? 'التخصصات' : 'Spécialités'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {profile.specialties.map(spec => (
                                    <span key={spec} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '5px 12px', borderRadius: 100,
                                        background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(139,92,246,0.12))',
                                        color: '#7c3aed', fontSize: 12, fontWeight: 600,
                                        border: '1px solid rgba(124,58,237,0.15)',
                                    }}>
                                        <Wrench size={11} /> {spec}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </SlideOver>
    );
}
