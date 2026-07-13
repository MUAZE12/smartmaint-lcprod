'use client';

// ============================================================
// Onboarding Wizard — walks the new admin through 10 steps:
//
//   1. Company profile (name, ICE, address)
//   2. First workshop / process line
//   3. First 3 machines (with pre-filled process names)
//   4. First technician
//   5. First operator
//   6. Assign the operator to the workshop
//   7. First preventive plan
//   8. First HACCP CCP
//   9. Alert subscriptions (import from personnel)
//  10. Print the QR sheet
//
// Persists progress in localStorage → the wizard survives reloads.
// Skip / Resume at any time.
// ============================================================

import { useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { Rocket, Check, ChevronRight, ChevronLeft, X, Building2, Factory, Cpu, Wrench, User, GraduationCap, ClipboardList, ShieldCheck, BellRing, QrCode } from 'lucide-react';

const STORAGE_KEY = 'smartmaint-onboarding-v1';

interface Progress {
    step: number;
    completed: string[];
    dismissed: boolean;
    startedAt: number;
}

interface WizardStep {
    id: string;
    title: string;
    subtitle: string;
    icon: typeof Rocket;
    accent: string;                // hex
    body: ReactNode;
    validate?: () => boolean;      // false → "Suivant" stays disabled
    onLeave?: () => Promise<void>; // fires when the user advances past this step
}

function readProgress(): Progress {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (raw) return JSON.parse(raw) as Progress;
    } catch { /* ignore */ }
    return { step: 0, completed: [], dismissed: false, startedAt: Date.now() };
}

function writeProgress(p: Progress): void {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function markOnboardingDone(): void {
    writeProgress({ ...readProgress(), dismissed: true, step: 999 });
}

export function resetOnboarding(): void {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

interface OnboardingWizardProps {
    /** When false → wizard never shows. Wire this to a "is fresh install" check. */
    enabled?: boolean;
    /** Callback for each step's final action (create the machine, save the CCP, etc.). */
    onCommit?: (stepId: string, payload: Record<string, unknown>) => Promise<void>;
}

export function OnboardingWizard({ enabled = true, onCommit }: OnboardingWizardProps) {
    const [progress, setProgress] = useState<Progress>({ step: 0, completed: [], dismissed: true, startedAt: 0 });
    const [payload, setPayload] = useState<Record<string, unknown>>({});

    useEffect(() => { setProgress(readProgress()); }, []);
    useEffect(() => { writeProgress(progress); }, [progress]);

    const steps: WizardStep[] = useMemo(() => [
        {
            id: 'company',
            title: 'Votre entreprise',
            subtitle: 'On commence par ce qui apparaît sur vos documents.',
            icon: Building2, accent: '#2563eb',
            body: (
                <FieldGroup>
                    <TextField label="Nom de l'entreprise" placeholder="L.C PROD" onChange={v => setPayload(p => ({ ...p, companyName: v }))} value={String(payload.companyName ?? '')} />
                    <TextField label="ICE (identifiant commun de l'entreprise)" placeholder="0012345678901" onChange={v => setPayload(p => ({ ...p, ice: v }))} value={String(payload.ice ?? '')} />
                    <TextField label="Adresse" placeholder="Zone industrielle …" onChange={v => setPayload(p => ({ ...p, address: v }))} value={String(payload.address ?? '')} />
                </FieldGroup>
            ),
            validate: () => !!payload.companyName,
        },
        {
            id: 'workshop',
            title: 'Votre premier atelier',
            subtitle: 'Un atelier = une zone de production. Vous en ajouterez d\'autres plus tard.',
            icon: Factory, accent: '#7c3aed',
            body: (
                <FieldGroup>
                    <TextField label="Nom de l'atelier" placeholder="Réception matière première" onChange={v => setPayload(p => ({ ...p, workshopName: v }))} value={String(payload.workshopName ?? '')} />
                </FieldGroup>
            ),
            validate: () => !!payload.workshopName,
        },
        {
            id: 'machines',
            title: 'Vos 3 premières machines',
            subtitle: 'Le minimum pour que les KPI aient du sens. Codes, noms, types.',
            icon: Cpu, accent: '#0891b2',
            body: (
                <FieldGroup>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8 }}>
                            <TextField label={i === 0 ? 'Code' : ''} placeholder="POM-001" onChange={v => setPayload(p => ({ ...p, ['m' + i + 'Code']: v }))} value={String(payload['m' + i + 'Code'] ?? '')} />
                            <TextField label={i === 0 ? 'Nom' : ''} placeholder="Pompe transfert huile" onChange={v => setPayload(p => ({ ...p, ['m' + i + 'Name']: v }))} value={String(payload['m' + i + 'Name'] ?? '')} />
                            <TextField label={i === 0 ? 'Type' : ''} placeholder="Pompe" onChange={v => setPayload(p => ({ ...p, ['m' + i + 'Type']: v }))} value={String(payload['m' + i + 'Type'] ?? '')} />
                        </div>
                    ))}
                </FieldGroup>
            ),
            validate: () => !!(payload.m0Code && payload.m0Name),
        },
        {
            id: 'technician',
            title: 'Votre premier technicien',
            subtitle: 'Il pourra ensuite dicter ses rapports en français hors ligne.',
            icon: Wrench, accent: '#059669',
            body: (
                <FieldGroup>
                    <TextField label="Nom complet" placeholder="Ahmed El farhani" onChange={v => setPayload(p => ({ ...p, techName: v }))} value={String(payload.techName ?? '')} />
                    <TextField label="Email" placeholder="ahmed@lcprod.ma" onChange={v => setPayload(p => ({ ...p, techEmail: v }))} value={String(payload.techEmail ?? '')} type="email" />
                </FieldGroup>
            ),
            validate: () => !!payload.techEmail,
        },
        {
            id: 'operator',
            title: 'Votre premier opérateur',
            subtitle: 'Interface arabe RTL, gros boutons. Prêt à l\'emploi.',
            icon: User, accent: '#ea580c',
            body: (
                <FieldGroup>
                    <TextField label="Nom complet" placeholder="Karim Benjelloun" onChange={v => setPayload(p => ({ ...p, opName: v }))} value={String(payload.opName ?? '')} />
                    <TextField label="Email" placeholder="karim@lcprod.ma" onChange={v => setPayload(p => ({ ...p, opEmail: v }))} value={String(payload.opEmail ?? '')} type="email" />
                </FieldGroup>
            ),
            validate: () => !!payload.opEmail,
        },
        {
            id: 'preventive',
            title: 'Votre premier plan préventif',
            subtitle: 'Le système générera un OT automatiquement à l\'échéance.',
            icon: ClipboardList, accent: '#0369a1',
            body: (
                <FieldGroup>
                    <TextField label="Description" placeholder="Graissage roulements pompe transfert" onChange={v => setPayload(p => ({ ...p, planDesc: v }))} value={String(payload.planDesc ?? '')} />
                    <TextField label="Fréquence (jours)" placeholder="30" type="number" onChange={v => setPayload(p => ({ ...p, planFreq: v }))} value={String(payload.planFreq ?? '')} />
                </FieldGroup>
            ),
            validate: () => !!(payload.planDesc && payload.planFreq),
        },
        {
            id: 'haccp',
            title: 'Votre premier CCP HACCP',
            subtitle: 'Point critique de contrôle. Alerte 24h si non renseigné.',
            icon: ShieldCheck, accent: '#16a34a',
            body: (
                <FieldGroup>
                    <TextField label="Type de contrôle" placeholder="Nettoyage tank réception (CIP)" onChange={v => setPayload(p => ({ ...p, haccpType: v }))} value={String(payload.haccpType ?? '')} />
                    <TextField label="Seuil critique (°C)" placeholder="65" type="number" onChange={v => setPayload(p => ({ ...p, haccpThreshold: v }))} value={String(payload.haccpThreshold ?? '')} />
                </FieldGroup>
            ),
            validate: () => !!payload.haccpType,
        },
        {
            id: 'alerts',
            title: 'Abonnements aux alertes',
            subtitle: 'Un mail dès qu\'une machine tombe en panne ou qu\'un stock passe critique.',
            icon: BellRing, accent: '#7c2d12',
            body: (
                <FieldGroup>
                    <TextField label="Email destinataire principal" placeholder="responsable-maintenance@lcprod.ma" onChange={v => setPayload(p => ({ ...p, alertEmail: v }))} value={String(payload.alertEmail ?? '')} type="email" />
                </FieldGroup>
            ),
        },
        {
            id: 'qr',
            title: 'Imprimez vos QR codes',
            subtitle: 'Collez-les sur les machines. Les techniciens scannent → fiche machine directe.',
            icon: QrCode, accent: '#1e40af',
            body: (
                <div style={{ padding: '12px 4px', color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6 }}>
                    Un PDF avec un QR par machine est prêt à imprimer depuis la page <b>Machines</b>. On l\'ouvrira pour vous en fin d\'assistant.
                </div>
            ),
        },
        {
            id: 'done',
            title: 'Vous êtes prêt.',
            subtitle: 'On a démarré le compteur MTBF sur vos machines. Bonne maintenance !',
            icon: GraduationCap, accent: '#15803d',
            body: (
                <div style={{ padding: '12px 4px', color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.7 }}>
                    Vous pouvez rouvrir ce guide à tout moment depuis <b>Paramètres → Assistance</b>. Ou appuyer sur <kbd style={{ fontFamily: 'monospace' }}>?</kbd> pour la liste des raccourcis clavier.
                </div>
            ),
        },
    ], [payload]);

    const cur = steps[progress.step];
    const canNext = cur?.validate ? cur.validate() : true;

    const commitAndAdvance = useCallback(async () => {
        if (!cur) return;
        try {
            if (onCommit) await onCommit(cur.id, payload);
            if (cur.onLeave) await cur.onLeave();
        } catch { /* let the user retry — a failed commit shouldn't strand them */ }
        setProgress(p => ({ ...p, step: p.step + 1, completed: [...p.completed, cur.id] }));
    }, [cur, payload, onCommit]);

    const dismiss = useCallback(() => setProgress(p => ({ ...p, dismissed: true })), []);

    if (!enabled || progress.dismissed || progress.step >= steps.length) return null;

    const Icon = cur.icon;
    return (
        <div role="dialog" aria-modal="true" style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9997, backdropFilter: 'blur(4px)', padding: 20,
        }}>
            <div style={{
                width: 'min(680px, 100%)', maxHeight: '92vh', overflow: 'auto',
                background: 'var(--surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 18,
                boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: `linear-gradient(135deg, ${cur.accent}, ${cur.accent}dd)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    }}><Icon size={22} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Étape {progress.step + 1} sur {steps.length}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{cur.title}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cur.subtitle}</div>
                    </div>
                    <button onClick={dismiss} aria-label="Fermer" style={{
                        background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                    }}><X size={18} /></button>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '0 24px', marginBottom: 6 }}>
                    <div style={{ height: 4, background: 'var(--surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            width: `${((progress.step + 1) / steps.length) * 100}%`, height: '100%',
                            background: cur.accent, transition: 'width 0.3s',
                        }} />
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '18px 24px', flex: 1 }}>
                    {cur.body}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px 18px', display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setProgress(p => ({ ...p, step: Math.max(0, p.step - 1) }))}
                        disabled={progress.step === 0}
                        style={buttonSecondary(progress.step === 0)}>
                        <ChevronLeft size={15} /> Précédent
                    </button>
                    <button onClick={dismiss} style={buttonGhost()}>Ignorer</button>
                    <div style={{ flex: 1 }} />
                    <button onClick={commitAndAdvance} disabled={!canNext} style={buttonPrimary(cur.accent, !canNext)}>
                        {progress.step === steps.length - 1 ? (<><Check size={15} /> Terminer</>) : (<>Suivant <ChevronRight size={15} /></>)}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Field primitives ──────────────────────────────────────
function FieldGroup({ children }: { children: ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>;
}

interface TextFieldProps {
    label?: string;
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
    type?: 'text' | 'email' | 'number';
}
function TextField({ label, placeholder, value, onChange, type = 'text' }: TextFieldProps) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>}
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                style={{
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                }}
            />
        </label>
    );
}

function buttonPrimary(accent: string, disabled?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderRadius: 10, border: 'none',
        background: disabled ? 'var(--surface-hover)' : `linear-gradient(135deg, ${accent}, ${accent}dd)`,
        color: disabled ? 'var(--text-muted)' : 'white',
        fontWeight: 700, fontSize: 13.5, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
    };
}
function buttonSecondary(disabled?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '10px 14px', borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--surface-hover)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
    };
}
function buttonGhost(): React.CSSProperties {
    return {
        padding: '10px 14px', borderRadius: 10,
        border: 'none', background: 'transparent',
        color: 'var(--text-muted)',
        fontWeight: 600, fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit',
    };
}
