'use client';

import Header from '@/components/Header';
import QRScanner from '@/components/QRScanner';
import { useData } from '@/context/DataContext';
import { getInterventionsByMachine } from '@/lib/data';
import { getMachineKPI, getCriticalityLevel } from '@/lib/calculations';
import { interventionsDb, machinesDb } from '@/lib/db';
import { useToast } from '@/components/ui/Toast';
import {
    ScanLine, Cpu, ChevronRight, Search, Wrench, TrendingUp, Activity, Clock,
    X, AlertTriangle, Crosshair,
} from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; class: string }> = {
    'opérationnelle': { label: 'Opérationnelle', class: 'badge-operational' },
    'en panne': { label: 'En panne', class: 'badge-broken' },
    'en maintenance': { label: 'En maintenance', class: 'badge-maintenance' },
    'arrêtée': { label: 'Arrêtée', class: 'badge-stopped' },
};

export default function TechnicianScanner() {
    const { machines } = useData();
    const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
    const [scannedMachineId, setScannedMachineId] = useState<string | null>(null);
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);

    const filtered = machines.filter(m =>
        m.code.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase())
    );

    const machine = machines.find(m => m.id === selectedMachine);
    const kpi = selectedMachine ? getMachineKPI(selectedMachine) : null;
    const history = selectedMachine ? getInterventionsByMachine(selectedMachine) : [];

    // Bottom sheet machine data
    const bsMachine = machines.find(m => m.id === scannedMachineId);
    const bsHistory = scannedMachineId ? getInterventionsByMachine(scannedMachineId) : [];
    const lastIntervention = bsHistory.length > 0 ? bsHistory[0] : null;

    // A scanned QR resolved to a real machine → show its quick sheet.
    const handleMatch = (m: typeof machines[number]) => {
        setScannerOpen(false);
        setScannedMachineId(m.id);
        setBottomSheetOpen(true);
        showToast(`✅ Machine identifiée : ${m.code}`);
    };

    // QR-driven work order — report a breakdown straight from the scanned machine.
    const reportBreakdown = async () => {
        if (!bsMachine) return;
        setBusy(true);
        try {
            await interventionsDb.create({
                machineId: bsMachine.id, technicianId: null, interventionType: 'corrective',
                description: 'Panne signalée via scan QR', probableCause: '', actionDone: '',
                startDate: new Date().toISOString(), endDate: null,
                downtimeHours: 0, laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0,
                status: 'en cours',
            });
            await machinesDb.update(bsMachine.id, { status: 'en panne' });
            showToast(`🔴 Panne signalée — ${bsMachine.code}. Ordre de travail créé.`);
            setBottomSheetOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de la création', 'error');
        } finally { setBusy(false); }
    };

    // Machine detail view (when selected from list)
    if (selectedMachine && machine && kpi) {
        const status = statusConfig[machine.status];
        const critLevel = getCriticalityLevel(kpi.criticalityScore);
        return (
            <>
                <Header title={`${machine.code} — ${machine.name}`} subtitle="Fiche machine scannée" />
                <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                    <button
                        onClick={() => setSelectedMachine(null)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 14, color: 'var(--primary)', background: 'none', border: 'none',
                            cursor: 'pointer', fontWeight: 500, marginBottom: 20, padding: 0,
                        }}
                    >
                        ← Retour au scanner
                    </button>

                    {/* Machine info card */}
                    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 14,
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Cpu size={28} color="white" />
                            </div>
                            <div>
                                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{machine.name}</h2>
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <span className={`badge ${status.class}`}>{status.label}</span>
                                    <span className={`badge badge-${critLevel === 'élevé' ? 'critical' : critLevel === 'moyen' ? 'medium' : 'low'}`}>
                                        Criticité : {critLevel}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                            <div><span style={{ color: 'var(--text-muted)' }}>Atelier :</span> <b>{machine.workshop}</b></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Emplacement :</span> <b>{machine.location}</b></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Coût arrêt/h :</span> <b>{machine.hourlyDowntimeCost} MAD</b></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Importance :</span> <b>{machine.importanceLevel}/10</b></div>
                        </div>
                    </div>

                    {/* Quick KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                            { label: 'MTBF', value: `${kpi.mtbf}h`, icon: TrendingUp, color: '#22c55e' },
                            { label: 'MTTR', value: `${kpi.mttr}h`, icon: Activity, color: '#f59e0b' },
                            { label: 'Pannes', value: `${kpi.breakdownCount}`, icon: Wrench, color: '#ef4444' },
                            { label: 'Arrêt', value: `${kpi.totalDowntime}h`, icon: Clock, color: '#8b5cf6' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} className="kpi-card blue" style={{ padding: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</span>
                                        <Icon size={16} color={item.color} />
                                    </div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{item.value}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Intervention history */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Wrench size={18} /> Historique ({history.length})
                            </h3>
                        </div>
                        <div className="table-container" style={{ border: 'none' }}>
                            <table className="data-table">
                                <thead>
                                    <tr><th>Date</th><th>Type</th><th>Description</th><th>Durée</th><th>Statut</th></tr>
                                </thead>
                                <tbody>
                                    {history.map(int => (
                                        <tr key={int.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{format(new Date(int.startDate), 'dd/MM/yyyy', { locale: fr })}</td>
                                            <td>
                                                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: '#f1f5f9' }}>
                                                    {int.interventionType}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{int.description}</td>
                                            <td>{int.downtimeHours}h</td>
                                            <td><span className="badge badge-operational">{int.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </>
        );
    }

    return (
        <>
            <Header title="Scanner Machine" subtitle="Scannez ou sélectionnez une machine" />
            <main style={{ padding: '24px 32px' }} className="animate-fade-in">
                {/* ====== SCAN MACHINE ACTION BUTTON ====== */}
                <button
                    onClick={() => setScannerOpen(true)}
                    id="scan-machine-btn"
                    data-tour="scan-start"
                    style={{
                        width: '100%', padding: '32px', borderRadius: 24,
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
                        color: 'white', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 20,
                        boxShadow: '0 12px 32px rgba(249,115,22,0.35)',
                        marginBottom: 32, fontSize: 18, fontWeight: 700,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        position: 'relative', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(249,115,22,0.45)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(249,115,22,0.35)'; }}
                >
                    {/* Background pattern */}
                    <div style={{
                        position: 'absolute', inset: 0, opacity: 0.06,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 21px)',
                    }} />
                    <div style={{
                        width: 64, height: 64, borderRadius: 18,
                        background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <ScanLine size={32} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', position: 'relative' }}>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>Scanner une Machine</div>
                        <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 400, marginTop: 4 }}>
                            Ouvrez la caméra et scannez le QR Code de la machine
                        </div>
                    </div>
                    <Crosshair size={28} style={{ opacity: 0.6 }} />
                </button>

                {/* Search */}
                <div style={{ position: 'relative', maxWidth: 400, marginBottom: 20 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Rechercher une machine..."
                        className="input"
                        style={{ paddingLeft: 40, fontSize: 16, padding: '14px 14px 14px 40px' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Machine list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filtered.map(m => {
                        const st = statusConfig[m.status];
                        return (
                            <button
                                key={m.id}
                                onClick={() => setSelectedMachine(m.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: '18px 20px', borderRadius: 16,
                                    background: 'var(--surface)', border: '1px solid var(--border)',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.2s ease', width: '100%',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(249,115,22,0.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: '#fff7ed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Cpu size={24} color="#f97316" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.code} — {m.name}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{m.workshop} · {m.location}</div>
                                </div>
                                <span className={`badge ${st.class}`}>{st.label}</span>
                                <ChevronRight size={20} color="var(--text-muted)" />
                            </button>
                        );
                    })}
                </div>
            </main>

            {/* ====== REAL QR SCANNER ====== */}
            {scannerOpen && (
                <QRScanner
                    machines={machines}
                    onMatch={handleMatch}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {/* ====== BOTTOM SHEET — QUICK MACHINE DETAILS ====== */}
            {bottomSheetOpen && bsMachine && (
                <>
                    {/* Backdrop */}
                    <div
                        onClick={() => setBottomSheetOpen(false)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 149,
                            background: 'rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(3px)',
                            animation: 'fadeIn 0.2s ease',
                        }}
                    />
                    {/* Sheet */}
                    <div className="bottom-sheet" style={{ padding: '24px 28px 32px', maxWidth: 600, margin: '0 auto' }}>
                        {/* Handle */}
                        <div style={{ width: 40, height: 4, borderRadius: 100, background: 'var(--border)', margin: '0 auto 20px' }} />

                        {/* Machine header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: 14,
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Cpu size={26} color="white" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700 }}>{bsMachine.code} — {bsMachine.name}</h3>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {bsMachine.workshop} · {bsMachine.location}
                                </div>
                            </div>
                            <button
                                onClick={() => setBottomSheetOpen(false)}
                                style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'var(--surface-hover)', border: 'none',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Quick details grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                            <div style={{
                                background: 'var(--surface-hover)', borderRadius: 12, padding: '14px 16px',
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Statut</div>
                                <div style={{
                                    fontSize: 15, fontWeight: 700,
                                    color: bsMachine.status === 'opérationnelle' ? '#22c55e' : bsMachine.status === 'en panne' ? '#ef4444' : '#f59e0b',
                                }}>
                                    {statusConfig[bsMachine.status]?.label || bsMachine.status}
                                </div>
                            </div>
                            <div style={{
                                background: 'var(--surface-hover)', borderRadius: 12, padding: '14px 16px',
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Dernière intervention</div>
                                <div style={{ fontSize: 15, fontWeight: 700 }}>
                                    {lastIntervention
                                        ? format(new Date(lastIntervention.startDate), 'dd/MM/yyyy', { locale: fr })
                                        : 'Aucune'}
                                </div>
                            </div>
                        </div>

                        {lastIntervention && (
                            <div style={{
                                padding: '12px 16px', borderRadius: 10,
                                background: '#f8fafc', border: '1px solid var(--border-light)',
                                fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5,
                            }}>
                                <strong>Dernière action :</strong> {lastIntervention.description}
                                <br />
                                <span style={{ color: 'var(--text-muted)' }}>Durée : {lastIntervention.downtimeHours}h — {lastIntervention.status}</span>
                            </div>
                        )}

                        {/* QR work-order actions — sticky on mobile so the
                            "OK" / action buttons stay visible without scroll */}
                        <div className="scan-captured-actions" style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={reportBreakdown}
                                disabled={busy}
                                style={{
                                    flex: 1, padding: '15px', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    color: 'white', border: 'none', cursor: busy ? 'wait' : 'pointer',
                                    fontSize: 15, fontWeight: 700, opacity: busy ? 0.7 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <AlertTriangle size={19} /> Signaler une panne
                            </button>
                            <button
                                onClick={() => { setBottomSheetOpen(false); setSelectedMachine(bsMachine.id); }}
                                style={{
                                    flex: 1, padding: '15px', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #f97316, #c2410c)',
                                    color: 'white', border: 'none', cursor: 'pointer',
                                    fontSize: 15, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <Wrench size={19} /> Ouvrir la fiche
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
