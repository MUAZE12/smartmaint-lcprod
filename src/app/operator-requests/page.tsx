'use client';

// ============================================================
// Operator requests — admin (maintenance) view of:
//   O4 consumable_requests   — missing PPE / consumables (magasin)
// Relief requests (O3) belong to production / chef d'équipe and
// are intentionally NOT shown here.
// ============================================================

import Header from '@/components/Header';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { consumableRequestsDb } from '@/lib/db';
import type { ConsumableRequest } from '@/lib/types';
import { useMemo } from 'react';
import { ShieldAlert, X, CheckCircle2 } from 'lucide-react';

export default function OperatorRequestsPage() {
    const { user } = useAuth();
    const { consumableRequests } = useData();
    const { showToast } = useToast();

    const openConsum = consumableRequests.filter(r => r.status === 'ouverte').length;

    return (
        <>
            <Header title="Demandes EPI & consommables" subtitle="Demandes magasin — vue responsable maintenance" />
            <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }} className="animate-fade-in">
                <div data-tour="op-req-header" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <ShieldAlert size={18} color="#1d4ed8" />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1d4ed8' }}>EPI / consommables ouverts</span>
                    {openConsum > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: '#dc2626', color: 'white' }}>{openConsum}</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>Les demandes de relais sont gérées côté production.</span>
                </div>

                <ConsumableTable items={consumableRequests} adminName={user?.name ?? 'Admin'} showToast={showToast} />
            </main>
        </>
    );
}

function ConsumableTable({ items, adminName, showToast }: { items: ConsumableRequest[]; adminName: string; showToast: (m: string, k?: 'success' | 'error' | 'info') => void }) {
    const sorted = useMemo(() => [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [items]);
    const markHandled = async (id: string) => {
        try {
            await consumableRequestsDb.update(id, { status: 'traitée', handledBy: adminName, handledAt: new Date().toISOString() });
            showToast('✅ Demande traitée');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };
    const cancel = async (id: string) => {
        try {
            await consumableRequestsDb.update(id, { status: 'annulée', handledBy: adminName, handledAt: new Date().toISOString() });
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };

    if (sorted.length === 0) return <EmptyCard text="Aucune demande d'EPI / consommable." />;
    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ border: 'none' }}>
                <table className="data-table">
                    <thead><tr>
                        <th>Opérateur</th><th>Catégorie</th><th>Élément</th><th>Qté</th>
                        <th>Urgence</th><th>Date</th><th>Statut</th><th></th>
                    </tr></thead>
                    <tbody>
                        {sorted.map(r => {
                            const sBg = r.status === 'ouverte' ? '#fffbeb' : r.status === 'traitée' ? '#f0fdf4' : '#f1f5f9';
                            const sCol = r.status === 'ouverte' ? '#b45309' : r.status === 'traitée' ? '#15803d' : '#64748b';
                            return (
                                <tr key={r.id} data-tour="op-req-consum-row" data-status={r.status}>
                                    <td style={{ fontWeight: 600 }}>{r.operatorName}</td>
                                    <td>
                                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: r.category === 'EPI' ? '#fef2f2' : '#eff6ff', color: r.category === 'EPI' ? '#dc2626' : '#1d4ed8' }}>{r.category}</span>
                                    </td>
                                    <td style={{ fontSize: 13 }}>{r.item}</td>
                                    <td style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{r.quantity}</td>
                                    <td>
                                        {r.urgency === 'urgente' && (
                                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}>⚠️ urgente</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleString('fr-FR')}</td>
                                    <td><span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 100, color: sCol, background: sBg }}>{r.status}</span></td>
                                    <td>
                                        {r.status === 'ouverte' && (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button data-tour="op-req-consum-accept" onClick={() => markHandled(r.id)} title="Marquer traitée" style={actionBtn('#16a34a')}><CheckCircle2 size={13} /></button>
                                                <button data-tour="op-req-consum-cancel" onClick={() => cancel(r.id)} title="Annuler" style={actionBtn('#94a3b8')}><X size={13} /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function EmptyCard({ text }: { text: string }) {
    return <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{text}</div>;
}

function actionBtn(color: string): React.CSSProperties {
    return {
        width: 28, height: 28, borderRadius: 7,
        border: '1px solid ' + color + '40', background: color + '15', color,
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
    };
}
