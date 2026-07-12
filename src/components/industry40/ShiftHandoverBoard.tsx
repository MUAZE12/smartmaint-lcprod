'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2, User, LogIn } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const handoverEntries = [
    {
        id: 1,
        technicianOut: 'Ahmed El Amrani',
        avatar: 'AE',
        shiftEnd: '14:00',
        date: 'Aujourd\'hui',
        tasksLeft: [
            { task: 'Remplacement garniture pompe POM-001', priority: 'high' },
            { task: 'Vérification buses remplisseuse REM-001', priority: 'normal' },
        ],
        quirks: 'Bruit intermittent sur CNV-001 après 12h — surveiller vibrations.',
        accepted: false,
    },
    {
        id: 2,
        technicianOut: 'Youssef Bennani',
        avatar: 'YB',
        shiftEnd: '06:00',
        date: 'Aujourd\'hui',
        tasksLeft: [
            { task: 'Graissage préventif CMP-001', priority: 'normal' },
        ],
        quirks: 'RAS — Tout est stable.',
        accepted: true,
    },
];

export default function ShiftHandoverBoard() {
    const { showToast } = useToast();
    const [entries, setEntries] = useState(handoverEntries);

    const acceptShift = (id: number) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, accepted: true } : e));
        showToast('✅ Poste accepté — Bonne équipe !');
    };
    const revertShift = (id: number) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, accepted: false } : e));
        showToast('↩️ Acceptation annulée', 'info');
    };

    return (
        <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={18} color="#f59e0b" />
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Relève de Poste</h3>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {entries.map(entry => (
                    <div key={entry.id} style={{
                        padding: 16, borderRadius: 14,
                        background: 'var(--surface-hover)',
                        border: entry.accepted ? '1px solid #bbf7d0' : '1px solid #fde68a',
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0,
                            }}>
                                {entry.avatar}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.technicianOut}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Fin de poste : {entry.shiftEnd} · {entry.date}
                                </div>
                            </div>
                            {entry.accepted ? (
                                <button
                                    data-tour="handover-revert"
                                    onClick={() => revertShift(entry.id)}
                                    title="Annuler l'acceptation"
                                    style={{
                                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                        background: '#f0fdf4', color: '#22c55e', border: '1px solid transparent',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.borderColor = '#86efac'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.borderColor = 'transparent'; }}
                                >
                                    ✅ Accepté · annuler
                                </button>
                            ) : (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: '#fffbeb', color: '#f59e0b' }}>
                                    ⏳ En attente
                                </span>
                            )}
                        </div>

                        {/* Tasks Left */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                                Tâches restantes ({entry.tasksLeft.length})
                            </div>
                            {entry.tasksLeft.map((task, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
                                    {task.priority === 'high' ? <AlertTriangle size={13} color="#ef4444" /> : <CheckCircle2 size={13} color="#22c55e" />}
                                    <span style={{ color: task.priority === 'high' ? '#dc2626' : 'var(--text-secondary)', fontWeight: task.priority === 'high' ? 600 : 400 }}>
                                        {task.task}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Machine Quirks */}
                        <div style={{
                            padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(249,115,22,0.08)', fontSize: 12, color: 'var(--text-secondary)',
                            lineHeight: 1.5, marginBottom: entry.accepted ? 0 : 10,
                        }}>
                            <User size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            <b>Note :</b> {entry.quirks}
                        </div>

                        {/* Accept button */}
                        {!entry.accepted && (
                            <button data-tour="handover-accept" onClick={() => acceptShift(entry.id)} style={{
                                width: '100%', padding: '12px', borderRadius: 10,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                boxShadow: '0 4px 16px rgba(34,197,94,0.25)',
                                transition: 'transform 0.15s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <LogIn size={18} /> Pointer &amp; accepter le poste
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
