'use client';

// ============================================================
// Validations — admin maintenance approves only the purchase
// orders whose amount exceeds the approval threshold defined in
// Paramètres → "Seuil d'approbation". Below the threshold the PO
// is auto-approved by the Procurement workflow itself; nothing
// to do here.
//
// Interventions are NOT validated here anymore — they live on
// /interventions where the WO drawer offers Démarrer / Terminer /
// Valider directly to whoever is operating the work order.
// ============================================================

import Header from '@/components/Header';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { purchaseOrdersDb } from '@/lib/db';
import { settingsDb } from '@/lib/db';
import type { PurchaseOrder } from '@/lib/types';
import { CheckCircle, Ban, FileText, Inbox, Info } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ApprovalsPage() {
    const { showToast } = useToast();
    const { user } = useAuth();
    const { purchaseOrders, suppliers } = useData();
    const [busy, setBusy] = useState(false);
    const [rejectPo, setRejectPo] = useState<PurchaseOrder | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    // Approval threshold from app_settings — same key the Procurement
    // workflow reads when deciding whether a new PO needs sign-off.
    const [threshold, setThreshold] = useState(5000);
    useEffect(() => {
        settingsDb.get('po_approval_threshold')
            .then(v => { if (v) setThreshold(parseInt(v, 10) || 5000); })
            .catch(() => { /* settings table may not exist yet */ });
    }, []);

    const pendingPOs = purchaseOrders.filter(po => po.approvalStatus === 'en attente');

    const approvePO = async (po: PurchaseOrder) => {
        setBusy(true);
        try {
            await purchaseOrdersDb.update(po.id, {
                approvalStatus: 'approuvé', approvedBy: user?.name || 'Responsable', approvedAt: new Date().toISOString(),
            });
            showToast('✅ Bon de commande approuvé');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };
    const doRejectPO = async () => {
        if (!rejectPo) return;
        setBusy(true);
        try {
            await purchaseOrdersDb.update(rejectPo.id, {
                approvalStatus: 'rejeté', rejectionReason: rejectReason.trim() || 'Non précisé',
            });
            showToast('Bon de commande rejeté', 'info');
            setRejectPo(null); setRejectReason('');
        } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
        finally { setBusy(false); }
    };

    return (
        <>
            <Header title="Validations achats" subtitle="Bons de commande dépassant le seuil d'approbation" />
            <main style={{ padding: '24px 32px', maxWidth: 980, margin: '0 auto' }}>

                {/* Threshold reminder — admin always sees the active rule */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', borderRadius: 12, marginBottom: 20,
                    background: 'var(--primary-lighter)', border: '1px solid var(--primary-light)',
                    fontSize: 13, color: 'var(--primary)',
                }}>
                    <Info size={16} style={{ flexShrink: 0 }} />
                    <div>
                        <b>Règle active :</b> seuls les bons de commande &gt; <b>{threshold.toLocaleString('fr-FR')} MAD</b> demandent votre approbation. Modifiable dans <b>Paramètres → Seuil d&apos;approbation</b>.
                    </div>
                </div>

                {pendingPOs.length === 0 ? (
                    <div data-tour="approvals-empty" style={{ textAlign: 'center', padding: 70, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 14 }}>
                        <Inbox size={44} style={{ opacity: 0.4 }} />
                        <p style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>Aucun bon de commande à valider</p>
                        <p style={{ fontSize: 13, marginTop: 4 }}>Les commandes en-dessous de {threshold.toLocaleString('fr-FR')} MAD sont approuvées automatiquement.</p>
                    </div>
                ) : (
                    <section data-tour="approvals-po">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
                            <span className="section-eyebrow">Bons de commande à approuver</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#f0edfa', color: '#5b21b6', letterSpacing: '0' }}>{pendingPOs.length}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {pendingPOs.map(po => {
                                const sup = suppliers.find(s => s.id === po.supplierId);
                                const overBudget = (po.totalAmount || 0) - threshold;
                                return (
                                    <div key={po.id} data-tour="approvals-po-card" className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <FileText size={17} color="#5b21b6" />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 650, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', fontSize: 13.5, color: 'var(--text-primary)' }}>{po.poNumber}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sup?.name || '—'}</div>
                                            {overBudget > 0 && (
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#b45309', marginTop: 4, letterSpacing: '0.005em' }}>
                                                    +{overBudget.toLocaleString('fr-FR')} MAD au-dessus du seuil
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', marginRight: 8 }}>
                                            <div className="section-eyebrow" style={{ fontSize: 10 }}>Montant</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{(po.totalAmount || 0).toLocaleString('fr-FR')} MAD</div>
                                        </div>
                                        <button data-tour="approvals-po-approve" onClick={() => approvePO(po)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                                            <CheckCircle size={15} /> Approuver
                                        </button>
                                        <button data-tour="approvals-po-reject" onClick={() => { setRejectPo(po); setRejectReason(''); }} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--accent-red-light)', color: '#ef4444', border: 'none', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                                            <Ban size={15} /> Rejeter
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </main>

            {/* Reject reason modal */}
            <Modal isOpen={!!rejectPo} onClose={() => setRejectPo(null)} title="Rejeter le bon de commande" size="sm"
                footer={<>
                    <button onClick={() => setRejectPo(null)} disabled={busy} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}>Annuler</button>
                    <button onClick={doRejectPO} disabled={busy} style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>Rejeter</button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Rejeter <b>{rejectPo?.poNumber}</b> ?</p>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Motif du rejet</label>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: budget dépassé, fournisseur à renégocier…"
                            style={{ width: '100%', minHeight: 80, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
                    </div>
                </div>
            </Modal>
        </>
    );
}
