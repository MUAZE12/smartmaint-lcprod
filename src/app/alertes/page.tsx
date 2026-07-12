'use client';

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { settingsDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, useCallback } from 'react';
import { BellRing, Send, Save, Info, AlertTriangle, ShieldCheck, Package, Loader2, ShoppingCart, FileText, Plus, Trash2, MessageCircle, CheckCircle2, ExternalLink, Copy, ChevronRight } from 'lucide-react';

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none' };
const lS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

function Toggle({ on, set, label, desc, icon, color }: { on: boolean; set: (v: boolean) => void; label: string; desc: string; icon: React.ReactNode; color: string }) {
    return (
        <button onClick={() => set(!on)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
            background: on ? `${color}0d` : 'var(--surface)', border: `1px solid ${on ? `${color}55` : 'var(--border)'}`,
        }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? color : 'var(--surface-hover)', color: on ? 'white' : 'var(--text-muted)' }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{desc}</div>
            </div>
            <div style={{ width: 42, height: 24, borderRadius: 100, flexShrink: 0, background: on ? color : 'var(--border)', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
        </button>
    );
}

export default function AlertesPage() {
    const { showToast } = useToast();
    const [email, setEmail] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [breakdowns, setBreakdowns] = useState(true);
    const [haccp, setHaccp] = useState(true);
    const [stock, setStock] = useState(true);
    const [autoreorder, setAutoreorder] = useState(false);
    const [report, setReport] = useState(false);
    // ── Phase 2 controls ──
    const [quietStart, setQuietStart] = useState(22);
    const [quietEnd, setQuietEnd] = useState(6);
    const [cooldownMin, setCooldownMin] = useState(60);
    const [scheduleHour, setScheduleHour] = useState(7);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [e, en, b, h, s, ar, rp, ar2, qs, qe, cd, sh] = await Promise.all([
                    settingsDb.get('alert_email'), settingsDb.get('alert_enabled'),
                    settingsDb.get('alert_breakdowns'), settingsDb.get('alert_haccp'), settingsDb.get('alert_stock'),
                    settingsDb.get('autoreorder_enabled'), settingsDb.get('report_enabled'),
                    settingsDb.get('alert_autoreorder'),
                    settingsDb.get('alert_quiet_start'), settingsDb.get('alert_quiet_end'),
                    settingsDb.get('alert_cooldown_min'), settingsDb.get('alert_schedule_hour'),
                ]);
                if (e) setEmail(e);
                setEnabled(en !== 'off');
                setBreakdowns(b !== 'off');
                setHaccp(h !== 'off');
                setStock(s !== 'off');
                setAutoreorder(ar === 'on' || ar2 === 'on');
                setReport(rp === 'on');
                if (qs) setQuietStart(parseInt(qs, 10));
                if (qe) setQuietEnd(parseInt(qe, 10));
                if (cd) setCooldownMin(parseInt(cd, 10));
                if (sh) setScheduleHour(parseInt(sh, 10));
            } catch { /* keep defaults */ }
            setLoaded(true);
        })();
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            await Promise.all([
                settingsDb.set('alert_email', email.trim()),
                settingsDb.set('alert_enabled', enabled ? 'on' : 'off'),
                settingsDb.set('alert_breakdowns', breakdowns ? 'on' : 'off'),
                settingsDb.set('alert_haccp', haccp ? 'on' : 'off'),
                settingsDb.set('alert_stock', stock ? 'on' : 'off'),
                settingsDb.set('autoreorder_enabled', autoreorder ? 'on' : 'off'),
                settingsDb.set('alert_autoreorder', autoreorder ? 'on' : 'off'),
                settingsDb.set('report_enabled', report ? 'on' : 'off'),
                settingsDb.set('alert_quiet_start', String(quietStart)),
                settingsDb.set('alert_quiet_end', String(quietEnd)),
                settingsDb.set('alert_cooldown_min', String(cooldownMin)),
                settingsDb.set('alert_schedule_hour', String(scheduleHour)),
            ]);
            showToast('Préférences enregistrées');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setSaving(false); }
    };

    const sendTest = async () => {
        if (!email.trim()) { showToast('Saisissez d\'abord une adresse e-mail', 'error'); return; }
        setTesting(true);
        try {
            const res = await fetch('/api/send-alert', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: email.trim(), subject: '✅ Test — SmartMaint L.C PROD',
                    html: '<p>Ceci est un e-mail de test depuis <b>SmartMaint — L.C PROD</b>.</p><p>Vos alertes automatiques sont correctement configurées.</p>',
                }),
            });
            const data = await res.json();
            if (data.ok) showToast('✅ E-mail de test envoyé — vérifiez la boîte de réception');
            else showToast(data.error || 'Échec de l\'envoi', 'error');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setTesting(false); }
    };

    return (
        <>
            <Header title="Alertes e-mail" subtitle="Notifications automatiques pour le responsable maintenance" />
            <main style={{ padding: '24px 32px', maxWidth: 720 }}>
                {/* Setup note */}
                <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)', marginBottom: 20 }}>
                    <Info size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12.5, color: 'var(--primary)', lineHeight: 1.55 }}>
                        <b>Les alertes sont 100 % automatiques.</b><br />
                        Une fois activées, le système surveille votre parc <b>toutes les 90 secondes</b> tant que cette
                        application est ouverte par un compte admin. Dès qu&apos;une panne, un stock critique ou un contrôle
                        HACCP en retard apparaît, un e-mail est envoyé automatiquement à tous les destinataires listés
                        ci-dessous — <b>aucun clic nécessaire</b>.<br />
                        <em>Le bouton « Envoyer un test » sert uniquement à vérifier la configuration la première fois.</em>
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--primary-light)' }}>
                            <b>⚠️ Plan gratuit Resend &mdash; restriction importante :</b> par défaut, l&apos;expéditeur est <code>onboarding@resend.dev</code>
                            et les destinataires <strong>doivent tous être l&apos;email du compte Resend lui-même</strong>.<br />
                            Pour envoyer à plusieurs destinataires différents (équipe, client…), vérifiez votre domaine
                            sur <a href="https://resend.com/domains" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>resend.com/domains</a> (5 minutes via DNS),
                            puis ajoutez sur Vercel la variable <code>ALERT_FROM=alertes@votre-domaine.ma</code>.
                        </div>
                    </div>
                </div>

                <div data-tour="alerts-card" className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Master toggle */}
                    <div data-tour="alerts-master"><Toggle on={enabled} set={setEnabled} color="#3b82f6"
                        icon={<BellRing size={19} />}
                        label="Alertes automatiques activées"
                        desc="Surveille le parc et envoie un e-mail dès qu'un problème apparaît." /></div>

                    {/* Recipients — multiple supported, comma-separated */}
                    <div data-tour="alerts-recipients">
                        <label style={lS}>Adresses e-mail des destinataires</label>
                        <textarea
                            data-tour="alerts-recipients-input"
                            style={{ ...iS, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                            placeholder="responsable.maintenance@lcprod.ma, qualite@lcprod.ma, achats@lcprod.ma"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                            Plusieurs adresses : séparez-les par des virgules. L&apos;alerte sera envoyée à toutes simultanément.
                        </div>
                    </div>

                    {/* Alert types */}
                    <div data-tour="alerts-triggers">
                        <label style={lS}>Déclencheurs d&apos;alerte</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Toggle on={breakdowns} set={setBreakdowns} color="#ef4444"
                                icon={<AlertTriangle size={18} />}
                                label="Pannes machine" desc="Une machine passe en panne." />
                            <Toggle on={haccp} set={setHaccp} color="#16a34a"
                                icon={<ShieldCheck size={18} />}
                                label="Contrôles HACCP en retard" desc="Un contrôle de sécurité alimentaire dépasse son échéance." />
                            <Toggle on={stock} set={setStock} color="#f59e0b"
                                icon={<Package size={18} />}
                                label="Stock critique" desc="Une pièce de rechange atteint son seuil minimum." />
                        </div>
                    </div>

                    {/* Automation */}
                    <div data-tour="alerts-automation">
                        <label style={lS}>Automatisation</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Toggle on={autoreorder} set={setAutoreorder} color="#8b5cf6"
                                icon={<ShoppingCart size={18} />}
                                label="Réapprovisionnement automatique" desc="Crée une demande d'achat dès qu'une pièce atteint son seuil minimum." />
                            <Toggle on={report} set={setReport} color="#0ea5e9"
                                icon={<FileText size={18} />}
                                label="Rapport hebdomadaire" desc="Envoie chaque lundi à 07:00 UTC un e-mail de synthèse 7 j (cron Vercel, sans admin connecté)." />
                        </div>
                        <ReorderTestButton />
                    </div>

                    {/* ── Phase 2 advanced controls ── */}
                    <div data-tour="alerts-antispam" style={{ marginTop: 4, padding: 16, borderRadius: 12, border: '1px dashed var(--border)', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Anti-spam et planification</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                            <div>
                                <label style={lS}>Cooldown (min)</label>
                                <input style={iS} type="number" min={0} max={1440} value={cooldownMin}
                                    onChange={e => setCooldownMin(Math.max(0, parseInt(e.target.value, 10) || 0))} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Délai mini entre 2 alertes identiques (anti-flapping). 0 = désactivé.</div>
                            </div>
                            <div>
                                <label style={lS}>Heure début silence (UTC)</label>
                                <input style={iS} type="number" min={0} max={23} value={quietStart}
                                    onChange={e => setQuietStart(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                            </div>
                            <div>
                                <label style={lS}>Heure fin silence (UTC)</label>
                                <input style={iS} type="number" min={0} max={23} value={quietEnd}
                                    onChange={e => setQuietEnd(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                            </div>
                            <div>
                                <label style={lS}>Heure rapport quotidien (UTC)</label>
                                <input style={iS} type="number" min={0} max={23} value={scheduleHour}
                                    onChange={e => setScheduleHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Cron Vercel : modifier <code>vercel.json</code> pour vraiment changer l&apos;heure d&apos;envoi.</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
                            <b>Silence&nbsp;:</b> de {String(quietStart).padStart(2,'0')}:00 à {String(quietEnd).padStart(2,'0')}:00 UTC, seules les alertes critiques (pannes) passent.
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, paddingTop: 4, flexWrap: 'wrap' }}>
                        <button data-tour="alerts-save" onClick={save} disabled={saving || !loaded} className="btn btn-primary btn-sm" style={{ opacity: saving || !loaded ? 0.6 : 1 }}>
                            {saving ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={15} />}
                            Enregistrer
                        </button>
                        <button data-tour="alerts-test" onClick={sendTest} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, background: 'var(--surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: testing ? 'wait' : 'pointer' }}>
                            {testing ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={15} />}
                            Envoyer un test
                        </button>
                        <a data-tour="alerts-history" href="/alert-history" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 10, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary-light)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
                            <FileText size={14} /> Voir l&apos;historique des alertes
                        </a>
                    </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
                    <b>Côté serveur (sans admin connecté)&nbsp;:</b> les alertes instantanées passent par les webhooks Supabase&nbsp;→&nbsp;<code>/api/instant-alert</code>.
                    Le rapport quotidien (07:00 UTC) et hebdomadaire (lundi 07:00 UTC) sont déclenchés par Vercel Cron.
                </p>

                {/* ── WhatsApp Green API test (send a real message) ── */}
                <WhatsAppSetupCard />

                {/* ── Phase 2 — Per-recipient subscriptions ── */}
                <SubscriptionsCard />

                <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </main>
        </>
    );
}

// ────────────────────────────────────────────────────────────
// Subscriptions card — fine-grained routing per recipient
// ────────────────────────────────────────────────────────────
interface Subscription {
    id: string;
    email: string;
    category: string;
    channels: string[];
    hours_start: number;
    hours_end: number;
    active: boolean;
    phone: string | null;
    callmebot_apikey: string | null;
}
const CATEGORIES = ['all', 'panne', 'stock', 'haccp', 'digest', 'weekly'] as const;
const CHANNELS = ['email', 'whatsapp'] as const;

function SubscriptionsCard() {
    const { showToast } = useToast();
    const [rows, setRows] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from('alert_subscriptions').select('*').order('email');
        setRows((data ?? []) as Subscription[]);
        setLoading(false);
    }, []);
    useEffect(() => { reload(); }, [reload]);

    const addRow = async () => {
        const id = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await supabase.from('alert_subscriptions').insert({
            id, email: '', category: 'all', channels: ['email'],
            hours_start: 0, hours_end: 24, active: true, phone: null, callmebot_apikey: null,
        });
        if (error) showToast(error.message, 'error'); else { showToast('Ligne ajoutée'); reload(); }
    };

    // Pull every employee from personnel + technicians and materialize a
    // subscription row for each email that isn't already listed. Sensible
    // defaults: email channel, all categories, 24/24. Admin fine-tunes after.
    const [importing, setImporting] = useState(false);
    const importTeam = async () => {
        setImporting(true);
        try {
            // Guard against the Supabase client failing to load (e.g. missing
            // env vars in a stale build). The prior code called
            // `supabase.from(...)` unconditionally and threw
            //   "Cannot read properties of undefined (reading 'from')"
            // when the module resolved to undefined during HMR.
            if (!supabase || typeof supabase.from !== 'function') {
                showToast('Client Supabase indisponible — rechargez la page (Ctrl+F5)', 'error');
                return;
            }

            interface T { email: string | null; phone: string | null }
            interface P { email: string | null; telephone: string | null }

            // Query each table independently so a missing column or table on
            // one side doesn't wipe out the other's rows.
            let techs: T[] = [];
            let pers: P[] = [];
            try {
                const tRes = await supabase.from('technicians').select('email, phone');
                if (!tRes.error) techs = (tRes.data ?? []) as T[];
            } catch { /* ignore, empty roster */ }
            try {
                const pRes = await supabase.from('personnel').select('email, telephone');
                if (!pRes.error) pers = (pRes.data ?? []) as P[];
            } catch { /* ignore */ }

            const roster: Array<{ email: string; phone: string | null }> = [
                ...techs.filter(x => x.email).map(x => ({ email: x.email as string, phone: x.phone })),
                ...pers.filter(x => x.email).map(x => ({ email: x.email as string, phone: x.telephone })),
            ];
            if (roster.length === 0) {
                showToast('Aucun membre trouvé dans « Personnel » ou « Techniciens »', 'error');
                return;
            }

            const existing = new Set(rows.map(r => r.email.toLowerCase()));
            const toCreate = roster.filter(r => !existing.has(r.email.toLowerCase()));
            if (toCreate.length === 0) { showToast('Tous les membres sont déjà abonnés'); return; }
            const inserts = toCreate.map(r => ({
                id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${r.email.slice(0, 3)}`,
                email: r.email, category: 'all', channels: ['email'],
                hours_start: 0, hours_end: 24, active: true, phone: r.phone, callmebot_apikey: null,
            }));
            const { error } = await supabase.from('alert_subscriptions').insert(inserts);
            if (error) { showToast(error.message, 'error'); return; }
            showToast(`✅ ${toCreate.length} membre(s) importé(s) — configurez les canaux ci-dessous`);
            reload();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[importTeam] failed:', err);
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        }
        finally { setImporting(false); }
    };
    const updateRow = async (id: string, patch: Partial<Subscription>) => {
        const { error } = await supabase.from('alert_subscriptions').update(patch).eq('id', id);
        if (error) showToast(error.message, 'error'); else reload();
    };
    const removeRow = async (id: string) => {
        if (!confirm('Supprimer cet abonnement ?')) return;
        const { error } = await supabase.from('alert_subscriptions').delete().eq('id', id);
        if (error) showToast(error.message, 'error'); else { showToast('Supprimé'); reload(); }
    };

    return (
        <div className="card" style={{ marginTop: 22, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <BellRing size={18} color="#3b82f6" />
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800 }}>Abonnements par destinataire</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Routage fin&nbsp;: chaque personne choisit quelles catégories elle reçoit, sur quel canal, à quelles heures.</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={importTeam} disabled={importing} title="Créer un abonnement pour chaque email de l'équipe" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 12.5, cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: importing ? 0.7 : 1 }}>
                        {importing ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : '👥'} Importer l&apos;équipe
                    </button>
                    <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Plus size={14} /> Ajouter
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</div>
            ) : rows.length === 0 ? (
                <div style={{ padding: 18, borderRadius: 10, background: 'var(--surface-hover)', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Aucun abonnement individuel — tous les destinataires de la liste ci-dessus reçoivent tout par e-mail.
                </div>
            ) : (
                <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table className="data-table" style={{ minWidth: 720 }}>
                        <thead><tr>
                            <th>Email</th><th>Catégorie</th><th>Canaux</th><th>Heures (UTC)</th><th>Téléphone (WA)</th><th>Clé CallMeBot</th><th>Actif</th><th></th>
                        </tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id}>
                                    <td>
                                        <input className="input" style={{ minWidth: 180 }} value={r.email}
                                            onChange={e => updateRow(r.id, { email: e.target.value })}
                                            onBlur={e => updateRow(r.id, { email: e.target.value.trim() })}
                                            placeholder="user@gmail.com" />
                                    </td>
                                    <td>
                                        <select className="input" value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })}>
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {CHANNELS.map(ch => {
                                                const on = r.channels?.includes(ch);
                                                return (
                                                    <button key={ch}
                                                        onClick={() => updateRow(r.id, { channels: on ? r.channels.filter(c => c !== ch) : [...(r.channels ?? []), ch] })}
                                                        style={{
                                                            padding: '5px 9px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                                                            border: '1px solid ' + (on ? '#3b82f6' : 'var(--border)'),
                                                            background: on ? '#3b82f6' : 'transparent',
                                                            color: on ? 'white' : 'var(--text-secondary)',
                                                            cursor: 'pointer', fontFamily: 'inherit',
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        }}
                                                    >
                                                        {ch === 'whatsapp' ? <MessageCircle size={11} /> : null} {ch}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>
                                            <input className="input" type="number" min={0} max={23} style={{ width: 56, padding: '6px 8px' }}
                                                value={r.hours_start}
                                                onChange={e => updateRow(r.id, { hours_start: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) })} />
                                            <span>→</span>
                                            <input className="input" type="number" min={0} max={24} style={{ width: 56, padding: '6px 8px' }}
                                                value={r.hours_end}
                                                onChange={e => updateRow(r.id, { hours_end: Math.min(24, Math.max(0, parseInt(e.target.value) || 0)) })} />
                                        </div>
                                    </td>
                                    <td>
                                        <input className="input" style={{ minWidth: 130 }} value={r.phone ?? ''}
                                            onChange={e => updateRow(r.id, { phone: e.target.value || null })}
                                            placeholder="+212 6 12 34 56 78" />
                                    </td>
                                    <td>
                                        <input className="input" style={{ minWidth: 110, fontFamily: 'monospace' }} value={r.callmebot_apikey ?? ''}
                                            onChange={e => updateRow(r.id, { callmebot_apikey: e.target.value.trim() || null })}
                                            placeholder="1234567" />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={r.active}
                                            onChange={e => updateRow(r.id, { active: e.target.checked })}
                                            style={{ width: 18, height: 18, cursor: 'pointer' }} />
                                    </td>
                                    <td>
                                        <button onClick={() => removeRow(r.id)} style={{ padding: 6, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }} title="Supprimer">
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.55 }}>
                <b>Aucune ligne&nbsp;:</b> back-compat — tous les emails listés en haut reçoivent toutes les catégories.<br />
                <b>Avec des lignes&nbsp;:</b> seul les abonnés correspondants pour chaque catégorie reçoivent. Plages horaires UTC.<br />
                <b>WhatsApp&nbsp;:</b> voyez la carte « Canal WhatsApp » plus haut pour l&apos;activer en 3 étapes.
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// Manual "kick" for auto-reorder — scans every spare part and creates
// a REQ for anything below threshold that doesn't already have an open PR.
// Also acts as an end-to-end smoke test before enabling the webhook path.
// ────────────────────────────────────────────────────────────
function ReorderTestButton() {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const [last, setLast] = useState<{ created: number; scanned: number; low: number; skipped: number } | null>(null);

    const run = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/reorder/scan', { method: 'POST' });
            const data = await res.json();
            if (!data.ok) { showToast(data.error || 'Erreur', 'error'); return; }
            setLast({ created: data.created, scanned: data.scanned, low: data.low, skipped: data.skipped });
            if (data.created > 0) {
                showToast(`✅ ${data.created} demande(s) d'achat créée(s) — voyez Achats → Demandes d'achat`);
            } else {
                showToast(data.message || 'Aucune demande créée');
            }
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur réseau', 'error'); }
        finally { setBusy(false); }
    };

    return (
        <div data-tour="alerts-reorder-test" style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <ShoppingCart size={16} color="#7c3aed" />
                <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    <b>Tester le réapprovisionnement</b> — force un balayage immédiat du stock et crée les demandes d&apos;achat pour toutes les pièces sous seuil (sans doublon).
                </div>
                <button onClick={run} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#5b21b6', color: 'white', fontWeight: 600, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit', boxShadow: '0 1px 0 rgba(11,18,32,0.08)', transition: 'background 0.15s ease' }}>
                    {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ShoppingCart size={13} />}
                    Lancer un scan
                </button>
            </div>
            {last && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📦 {last.scanned} pièce(s) analysée(s)</span>
                    <span>⚠️ {last.low} sous seuil</span>
                    <span style={{ color: last.created > 0 ? '#16a34a' : undefined, fontWeight: last.created > 0 ? 700 : undefined }}>✅ {last.created} nouvelle(s) demande(s)</span>
                    <span>♻️ {last.skipped} déjà couverte(s)</span>
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// Green API test only — no wizard, no CallMeBot, no Meta fallback.
// Admin plugs in a phone number and clicks Tester. The message is
// dispatched via Green API + Cloudflare Worker proxy, exactly the
// same path the automatic alerts use.
// ────────────────────────────────────────────────────────────
function WhatsAppSetupCard() {
    const { showToast } = useToast();
    const [testPhone, setTestPhone] = useState('');
    const [testing, setTesting] = useState(false);

    const sendTest = async () => {
        if (!testPhone.trim()) {
            showToast('Renseignez un numéro au format international (+212…)', 'error'); return;
        }
        setTesting(true);
        try {
            // Green API env vars only live on Vercel (server-side, hidden).
            // The Windows launcher runs a LOCAL Next.js server that doesn't
            // have those secrets, so a relative `/api/whatsapp/test` would
            // hit the local server → fall through to "non configuré".
            // Always target the Vercel deployment for this test.
            const res = await fetch('https://smartmaint-lcprod.vercel.app/api/whatsapp/test', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: testPhone.trim() }),
            });
            const data = await res.json();
            if (data.ok) showToast('✅ Message WhatsApp envoyé — vérifiez le téléphone');
            else showToast(data.error || 'Échec de l\'envoi', 'error');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setTesting(false); }
    };

    return (
        <div data-tour="alerts-whatsapp" className="card" style={{ marginTop: 22, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MessageCircle size={20} />
                </div>
                <div style={{ flex: '1 1 220px' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Envoyer un test WhatsApp</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Utilise Green API en direct. Le message arrive en quelques secondes.
                    </div>
                </div>
                <input className="input" style={{ flex: '1 1 180px', minWidth: 160 }} value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+212 6 12 34 56 78" />
                <button onClick={sendTest} disabled={testing} className="btn btn-sm" style={{ background: '#0e7c3f', color: 'white', border: 'none', opacity: testing ? 0.7 : 1, flexShrink: 0 }}>
                    {testing ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />} Tester
                </button>
            </div>
        </div>
    );
}
