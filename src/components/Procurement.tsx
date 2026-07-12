'use client';
import { useState, useEffect, Fragment } from 'react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { sparePartsDb, suppliersDb, purchaseOrdersDb, purchaseOrderLinesDb, settingsDb, quoteRequestsDb, quotesDb, quoteRequestLinesDb, quoteLinesDb, goodsReceiptsDb, purchaseRequisitionsDb } from '@/lib/db';
import type { Supplier, PurchaseOrder, SparePart, QuoteRequest, Quote, ReceiptCondition } from '@/lib/types';
import { Plus, Edit, Trash2, Package, Truck, AlertTriangle, TrendingDown, CheckCircle, Info, ChevronRight, ChevronDown, X, Ban, Clock, FileText, Star, Send, PackageCheck, ShoppingCart } from 'lucide-react';

const iS: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,fontFamily:'inherit',color:'var(--text-primary)',outline:'none' };
const lS: React.CSSProperties = { display:'block',fontSize:12,fontWeight:600,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.04em' };

const poStatusColors: Record<string,{label:string;color:string;bg:string}> = {
  'brouillon':{label:'Brouillon',color:'#64748b',bg:'rgba(100,116,139,0.1)'},
  'envoyée':{label:'Envoyée',color:'#3b82f6',bg:'rgba(59,130,246,0.1)'},
  'partielle':{label:'Partielle',color:'#f59e0b',bg:'rgba(245,158,11,0.1)'},
  'réceptionnée':{label:'Réceptionnée',color:'#22c55e',bg:'rgba(34,197,94,0.1)'},
};

const approvalColors: Record<string,{label:string;color:string;bg:string}> = {
  'en attente':{label:'En attente d\'approbation',color:'#f59e0b',bg:'rgba(245,158,11,0.12)'},
  'approuvé':{label:'Approuvé',color:'#22c55e',bg:'rgba(34,197,94,0.12)'},
  'rejeté':{label:'Rejeté',color:'#ef4444',bg:'rgba(239,68,68,0.12)'},
};

/**
 * Smart quote scoring — weighs price (50%), supplier reliability (30%)
 * and delivery speed (20%). Returns a 0..1 score per quote id.
 * The highest score is the recommended supplier.
 */
function scoreQuotes(quotes: Quote[], suppliers: Supplier[]): Map<string, number> {
  const received = quotes.filter(q => (q.status === 'reçu' || q.status === 'retenu') && q.totalAmount > 0);
  const scores = new Map<string, number>();
  if (received.length === 0) return scores;
  const minPrice = Math.min(...received.map(q => q.totalAmount));
  const deliveries = received.map(q => q.deliveryDays || 0).filter(d => d > 0);
  const minDelivery = deliveries.length ? Math.min(...deliveries) : 0;
  received.forEach(q => {
    const sup = suppliers.find(s => s.id === q.supplierId);
    const priceScore = minPrice / q.totalAmount;                              // 1.0 = cheapest
    const reliabilityScore = (sup?.reliability ?? 50) / 100;                  // supplier's track record
    const deliveryScore = (q.deliveryDays && minDelivery) ? minDelivery / q.deliveryDays : 0.5; // 1.0 = fastest
    scores.set(q.id, 0.5 * priceScore + 0.3 * reliabilityScore + 0.2 * deliveryScore);
  });
  return scores;
}

const quoteStatusColors: Record<string,{label:string;color:string;bg:string}> = {
  'en attente':{label:'En attente',color:'#64748b',bg:'rgba(100,116,139,0.1)'},
  'reçu':{label:'Reçu',color:'#3b82f6',bg:'rgba(59,130,246,0.1)'},
  'refusé':{label:'Refusé',color:'#ef4444',bg:'rgba(239,68,68,0.1)'},
  'retenu':{label:'Retenu',color:'#22c55e',bg:'rgba(34,197,94,0.12)'},
};

// SVG Circular Progress Ring component
function ReliabilityRing({ value, size = 48 }: { value: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 90 ? '#22c55e' : value >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border-light)" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 11, fontWeight: 800, color }}>{value}%</span>
    </div>
  );
}

interface Props { parts: SparePart[]; }

// A draft PO line being edited in the create modal.
// `lockedCost` = the cost came from a retained devis — don't overwrite it
// with the catalog price when the part is changed.
interface DraftLine { sparePartId: string; quantity: number; unitCost: number; lockedCost?: boolean; }

export default function Procurement({ parts }: Props) {
  const { showToast } = useToast();
  const { t, formatCurrency } = useApp();
  const { user } = useAuth();
  // Live data from Supabase (realtime-subscribed)
  const { suppliers: sups, purchaseOrders: pos, purchaseOrderLines, quoteRequests, quotes, quoteRequestLines, quoteLines, goodsReceipts, machines, purchaseRequisitions, purchaseRequisitionLines } = useData();
  const [tab, setTab] = useState<'suppliers'|'rfq'|'requisitions'|'orders'|'receipts'|'alerts'>('requisitions');
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === 'admin';

  // PO approval threshold (MAD) — loaded from app_settings
  const [approvalThreshold, setApprovalThreshold] = useState(5000);
  useEffect(() => {
    settingsDb.get('po_approval_threshold')
      .then(v => { if (v) setApprovalThreshold(parseInt(v, 10) || 5000); })
      .catch(() => { /* settings table may not exist yet */ });
  }, []);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder|null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── RFQ (Demandes de Devis) — itemized ──
  const [rfqModal, setRfqModal] = useState(false);
  const [rfqForm, setRfqForm] = useState({ machineId: '', notes: '' });
  // draft RFQ lines: the parts + quantities being sourced
  const [rfqDraftLines, setRfqDraftLines] = useState<{ sparePartId: string; quantity: number }[]>([]);
  const [expandedRfq, setExpandedRfq] = useState<string|null>(null);
  const [delRfqTarget, setDelRfqTarget] = useState<QuoteRequest|null>(null);
  // record-a-quote modal — per-line unit prices
  const [quoteResp, setQuoteResp] = useState<Quote|null>(null);
  const [respDeliveryDays, setRespDeliveryDays] = useState(7);
  const [respLines, setRespLines] = useState<{ rfqLineId: string; sparePartId: string; quantity: number; unitPrice: number }[]>([]);
  // supplier picker for "add supplier to RFQ" (one RFQ expanded at a time)
  const [addQuoteSupplier, setAddQuoteSupplier] = useState('');

  // ── Goods receipt (Bon de Réception) ──
  const [grnPo, setGrnPo] = useState<PurchaseOrder|null>(null);
  const [grnLines, setGrnLines] = useState<{ poLineId:string; sparePartId:string; ordered:number; alreadyReceived:number; receiveNow:number; condition:ReceiptCondition }[]>([]);
  const [grnNotes, setGrnNotes] = useState('');
  const [expandedGrn, setExpandedGrn] = useState<string|null>(null);

  // Supplier modal
  const [supModal, setSupModal] = useState(false);
  const [editSup, setEditSup] = useState<Supplier|null>(null);
  const [sf, setSf] = useState({name:'',contactName:'',email:'',phone:'',avgDeliveryDays:7});

  // PO modal (multi-line)
  const [poModal, setPoModal] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poLines, setPoLines] = useState<DraftLine[]>([]);
  const [poFromQuote, setPoFromQuote] = useState<Quote|null>(null);  // set when the PO is built from a retained devis
  const [delPoTarget, setDelPoTarget] = useState<PurchaseOrder|null>(null);
  const [expandedPo, setExpandedPo] = useState<string|null>(null);

  // ── Supplier CRUD ──
  const openAddSup = () => { setEditSup(null); setSf({name:'',contactName:'',email:'',phone:'',avgDeliveryDays:7}); setSupModal(true); };
  const openEditSup = (s:Supplier) => { setEditSup(s); setSf({name:s.name,contactName:s.contactName,email:s.email,phone:s.phone,avgDeliveryDays:s.avgDeliveryDays}); setSupModal(true); };
  const saveSup = async () => {
    if(!sf.name.trim()) { showToast('Le nom du fournisseur est obligatoire','error'); return; }
    setBusy(true);
    try {
      if(editSup) { await suppliersDb.update(editSup.id, sf); showToast('Fournisseur mis à jour'); }
      else { await suppliersDb.create({ ...sf, reliability: Math.floor(Math.random()*20)+75 }); showToast('Fournisseur ajouté'); }
      setSupModal(false);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };
  const delSup = async (id:string) => {
    try { await suppliersDb.remove(id); showToast('Fournisseur supprimé','error'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };

  // ── Multi-line PO ──
  const linesFor = (poId:string) => purchaseOrderLines.filter(l => l.poId === poId);

  const openCreatePO = () => {
    setPoFromQuote(null);
    setPoSupplierId(sups[0]?.id || '');
    setPoLines(parts[0] ? [{ sparePartId: parts[0].id, quantity: 1, unitCost: parts[0].unitCost }] : []);
    setPoModal(true);
  };
  const addLine = () => {
    const p = parts[0];
    setPoLines(prev => [...prev, { sparePartId: p?.id || '', quantity: 1, unitCost: p?.unitCost || 0 }]);
  };
  const removeLine = (idx:number) => setPoLines(prev => prev.filter((_,i) => i !== idx));
  const updateLine = (idx:number, patch:Partial<DraftLine>) => {
    setPoLines(prev => prev.map((l,i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // When the part changes, auto-fill its catalog cost — UNLESS the cost
      // is locked because it came from a retained devis.
      if (patch.sparePartId && !l.lockedCost) {
        const part = parts.find(p => p.id === patch.sparePartId);
        if (part) next.unitCost = part.unitCost;
      }
      return next;
    }));
  };
  const poDraftTotal = poLines.reduce((s,l) => s + l.quantity * l.unitCost, 0);

  const createPO = async () => {
    const validLines = poLines.filter(l => l.sparePartId && l.quantity > 0);
    if (!poSupplierId || validLines.length === 0) {
      showToast('Sélectionnez un fournisseur et au moins une ligne', 'error'); return;
    }
    const total = validLines.reduce((s,l) => s + l.quantity * l.unitCost, 0);
    const sup = sups.find(s => s.id === poSupplierId);
    const exp = new Date(); exp.setDate(exp.getDate() + (sup?.avgDeliveryDays || 7));
    // Above the threshold → needs sign-off; below → auto-approved.
    const needsApproval = total > approvalThreshold;
    setBusy(true);
    try {
      const po = await purchaseOrdersDb.create({
        poNumber: `PO-${new Date().getFullYear()}-${String(pos.length+1).padStart(3,'0')}`,
        supplierId: poSupplierId,
        totalAmount: total,
        status: 'brouillon',
        orderDate: new Date().toISOString(),
        expectedDelivery: exp.toISOString(),
        approvalStatus: needsApproval ? 'en attente' : 'non requis',
        rfqId: poFromQuote?.rfqId ?? null,   // link back to the originating RFQ
      });
      await Promise.all(validLines.map(l => purchaseOrderLinesDb.create({
        poId: po.id, sparePartId: l.sparePartId, quantity: l.quantity, unitCost: l.unitCost, receivedQty: 0,
      })));
      showToast(needsApproval
        ? `Bon de commande créé — en attente d'approbation (> ${approvalThreshold.toLocaleString('fr-FR')} MAD)`
        : `Bon de commande créé — ${validLines.length} ligne(s)`);
      setPoModal(false);
      setPoFromQuote(null);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const sendPO = async (po:PurchaseOrder) => {
    if (po.approvalStatus === 'en attente') { showToast('Ce bon doit d\'abord être approuvé', 'error'); return; }
    if (po.approvalStatus === 'rejeté') { showToast('Ce bon a été rejeté — impossible de l\'envoyer', 'error'); return; }
    try { await purchaseOrdersDb.update(po.id, { status:'envoyée' }); showToast('Commande envoyée'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };

  const approvePO = async (po:PurchaseOrder) => {
    try {
      await purchaseOrdersDb.update(po.id, {
        approvalStatus: 'approuvé', approvedBy: user?.name || 'Responsable', approvedAt: new Date().toISOString(),
      });
      showToast('✅ Bon de commande approuvé');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };

  const rejectPO = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await purchaseOrdersDb.update(rejectTarget.id, {
        approvalStatus: 'rejeté', rejectionReason: rejectReason.trim() || 'Non précisé',
      });
      showToast('Bon de commande rejeté', 'info');
      setRejectTarget(null); setRejectReason('');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  // ── Goods receipt (Bon de Réception) ──
  // Open the GRN modal — one row per PO line, prefilled with the qty still due.
  const openReceive = (po:PurchaseOrder) => {
    setGrnLines(linesFor(po.id).map(l => ({
      poLineId: l.id, sparePartId: l.sparePartId || '',
      ordered: l.quantity, alreadyReceived: l.receivedQty,
      receiveNow: Math.max(0, l.quantity - l.receivedQty),
      condition: 'conforme' as ReceiptCondition,
    })));
    setGrnNotes('');
    setGrnPo(po);
  };

  const createGRN = async () => {
    if (!grnPo) return;
    const toReceive = grnLines.filter(l => l.receiveNow > 0);
    if (toReceive.length === 0) { showToast('Saisissez au moins une quantité reçue', 'error'); return; }
    setBusy(true);
    try {
      // 1) Record the goods-receipt note
      await goodsReceiptsDb.create({
        grnNumber: `BR-${new Date().getFullYear()}-${String(goodsReceipts.length+1).padStart(3,'0')}`,
        poId: grnPo.id,
        receivedBy: user?.name || 'Réception',
        receivedDate: new Date().toISOString(),
        notes: grnNotes,
        lines: toReceive.map(l => ({
          poLineId: l.poLineId, sparePartId: l.sparePartId,
          receivedQty: l.receiveNow, condition: l.condition,
        })),
      });
      // 2) Update PO lines; only CONFORME items enter usable stock
      await Promise.all(toReceive.map(async l => {
        await purchaseOrderLinesDb.update(l.poLineId, { receivedQty: l.alreadyReceived + l.receiveNow });
        if (l.condition === 'conforme') {
          const part = parts.find(p => p.id === l.sparePartId);
          if (part) await sparePartsDb.update(part.id, { quantity: part.quantity + l.receiveNow });
        }
      }));
      // 3) Recompute PO status — fully vs partially received
      const allFull = grnLines.every(l => (l.alreadyReceived + l.receiveNow) >= l.ordered);
      await purchaseOrdersDb.update(grnPo.id, {
        status: allFull ? 'réceptionnée' : 'partielle',
        receivedDate: new Date().toISOString(),
      });
      showToast(allFull ? '✅ Réception complète — stock mis à jour' : '✅ Réception partielle enregistrée');
      setGrnPo(null);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur de réception', 'error'); }
    finally { setBusy(false); }
  };

  const delPO = async () => {
    if (!delPoTarget) return;
    setBusy(true);
    try {
      await purchaseOrdersDb.remove(delPoTarget.id);   // PO lines cascade-delete in the DB
      showToast('Bon de commande supprimé', 'error');
      setDelPoTarget(null);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  // ── RFQ handlers (itemized) ──
  const quotesFor = (rfqId:string) => quotes.filter(q => q.rfqId === rfqId);
  const rfqLinesFor = (rfqId:string) => quoteRequestLines.filter(l => l.rfqId === rfqId);
  const quoteLinesFor = (quoteId:string) => quoteLines.filter(l => l.quoteId === quoteId);
  /** Total of a quote = Σ (quoted unit price × the RFQ line quantity). */
  const quoteTotal = (q:Quote) => {
    const rls = rfqLinesFor(q.rfqId);
    return quoteLinesFor(q.id).reduce((s, ql) => {
      const rl = rls.find(r => r.id === ql.rfqLineId);
      return s + ql.unitPrice * (rl?.quantity || 0);
    }, 0);
  };

  // RFQ draft-line editor (create modal)
  const addRfqLine = () => setRfqDraftLines(prev => [...prev, { sparePartId: parts[0]?.id || '', quantity: 1 }]);
  const removeRfqLine = (idx:number) => setRfqDraftLines(prev => prev.filter((_,i)=>i!==idx));
  const updateRfqLine = (idx:number, patch:Partial<{sparePartId:string;quantity:number}>) =>
    setRfqDraftLines(prev => prev.map((l,i)=>i===idx?{...l,...patch}:l));

  const createRFQ = async () => {
    const validLines = rfqDraftLines.filter(l => l.sparePartId && l.quantity > 0);
    if (validLines.length === 0) { showToast('Ajoutez au moins une pièce à la demande', 'error'); return; }
    setBusy(true);
    try {
      const rfq = await quoteRequestsDb.create({
        rfqNumber: `RFQ-${new Date().getFullYear()}-${String(quoteRequests.length+1).padStart(3,'0')}`,
        requisitionId: null,
        status: 'ouverte',
        machineId: rfqForm.machineId || null,
        notes: rfqForm.notes,
      });
      await Promise.all(validLines.map(l => quoteRequestLinesDb.create({
        rfqId: rfq.id, sparePartId: l.sparePartId, quantity: l.quantity,
      })));
      showToast(`Demande de devis créée — ${validLines.length} article(s)`);
      setRfqModal(false);
      setRfqForm({ machineId: '', notes: '' });
      setRfqDraftLines([]);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const delRFQ = async () => {
    if (!delRfqTarget) return;
    setBusy(true);
    try {
      await quoteRequestsDb.remove(delRfqTarget.id);   // lines + quotes cascade-delete
      showToast('Demande de devis supprimée', 'error');
      setDelRfqTarget(null);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const addQuoteToRfq = async (rfqId:string, supplierId:string) => {
    if (!supplierId) return;
    try {
      await quotesDb.create({ rfqId, supplierId, status:'en attente', totalAmount:0, deliveryDays:null, notes:'' });
      showToast('Fournisseur consulté — devis en attente');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };

  // Open the per-line price-entry modal — one row per RFQ line.
  const openRecordQuote = (q:Quote) => {
    const rls = rfqLinesFor(q.rfqId);
    const existing = quoteLinesFor(q.id);
    setRespLines(rls.map(rl => {
      const ex = existing.find(e => e.rfqLineId === rl.id);
      return { rfqLineId: rl.id, sparePartId: rl.sparePartId || '', quantity: rl.quantity, unitPrice: ex?.unitPrice || 0 };
    }));
    const sup = sups.find(s => s.id === q.supplierId);
    setRespDeliveryDays(q.deliveryDays || sup?.avgDeliveryDays || 7);
    setQuoteResp(q);
  };
  const respTotal = respLines.reduce((s,l) => s + l.unitPrice * l.quantity, 0);
  const recordQuote = async () => {
    if (!quoteResp) return;
    if (respTotal <= 0) { showToast('Saisissez au moins un prix de ligne', 'error'); return; }
    setBusy(true);
    try {
      // Replace this quote's lines with the freshly entered prices
      const existing = quoteLinesFor(quoteResp.id);
      await Promise.all(existing.map(ql => quoteLinesDb.remove(ql.id)));
      await Promise.all(respLines.map(l => quoteLinesDb.create({
        quoteId: quoteResp.id, rfqLineId: l.rfqLineId, sparePartId: l.sparePartId, unitPrice: l.unitPrice,
      })));
      await quotesDb.update(quoteResp.id, {
        status:'reçu', totalAmount: respTotal, deliveryDays: respDeliveryDays,
      });
      showToast('Devis enregistré');
      setQuoteResp(null);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setBusy(false); }
  };
  const declineQuote = async (q:Quote) => {
    try { await quotesDb.update(q.id, { status:'refusé' }); showToast('Devis refusé', 'info'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };
  const selectQuote = async (q:Quote, rfqId:string) => {
    try {
      await quotesDb.update(q.id, { status:'retenu' });
      await quoteRequestsDb.update(rfqId, { status:'clôturée' });
      showToast('✅ Devis retenu — vous pouvez créer le bon de commande');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  };

  // Convert a retained quote into a PO — built EXACTLY from the quote lines:
  // every RFQ part, its quantity, and the supplier's quoted unit price.
  const openCreatePOFromQuote = (q:Quote) => {
    const qLines = quoteLinesFor(q.id);
    const rls = rfqLinesFor(q.rfqId);
    const builtLines: DraftLine[] = qLines.map(ql => {
      const rl = rls.find(r => r.id === ql.rfqLineId);
      return { sparePartId: ql.sparePartId || '', quantity: rl?.quantity || 1, unitCost: ql.unitPrice, lockedCost: true };
    });
    setPoFromQuote(q);
    setPoSupplierId(q.supplierId || '');
    setPoLines(builtLines.length ? builtLines
      : [{ sparePartId: parts[0]?.id || '', quantity: 1, unitCost: q.totalAmount, lockedCost: true }]);
    setPoModal(true);
    setTab('orders');
  };

  const getActiveOrders = (supId: string) => pos.filter(p => p.supplierId === supId && p.status !== 'réceptionnée').length;

  // Predictive alerts
  const alerts = parts.filter(p=>p.quantity<=p.minimumStock*1.5).map(p=>{
    const sup = sups[0];
    const daysLeft = p.quantity > 0 ? Math.max(1, Math.round(p.quantity / (p.minimumStock/30))) : 0;
    return { part:p, daysLeft, supplier:sup, orderBefore: daysLeft > (sup?.avgDeliveryDays||7) ? daysLeft-(sup?.avgDeliveryDays||7) : 0 };
  });

  const tabs = [
    {k:'requisitions' as const, l:'Demandes d\'achat', icon:<ShoppingCart size={14}/>},
    {k:'suppliers' as const, l:t('procurement.suppliers'), icon:<Truck size={14}/>},
    {k:'rfq' as const, l:'Devis', icon:<FileText size={14}/>},
    {k:'orders' as const, l:t('procurement.orders'), icon:<Package size={14}/>},
    {k:'receipts' as const, l:'Réceptions', icon:<PackageCheck size={14}/>},
    {k:'alerts' as const, l:t('procurement.alerts'), icon:<TrendingDown size={14}/>},
  ];

  return (
    <>
      <div data-tour="proc-tabs" style={{display:'flex',gap:4,marginBottom:20,background:'var(--surface-hover)',borderRadius:10,padding:4}}>
        {tabs.map(tb=>(
          <button key={tb.k} data-tour="proc-tab" data-proc-tab={tb.k} onClick={()=>setTab(tb.k)} style={{flex:1,padding:'10px 16px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',border:'none',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            background:tab===tb.k?'var(--surface)':'transparent',color:tab===tb.k?'var(--text-primary)':'var(--text-muted)',boxShadow:tab===tb.k?'var(--shadow-sm)':'none'}}>{tb.icon}{tb.l}</button>
        ))}
      </div>

      {/* REQUISITIONS TAB — auto-reorder output lands here */}
      {tab==='requisitions' && (
        <>
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:12,padding:'10px 14px',background:'var(--surface-hover)',borderRadius:10,borderInlineStart:'3px solid #8b5cf6'}}>
            📥 Les demandes créées par le réapprovisionnement automatique et par le bouton « Réapprovisionner maintenant » apparaissent ici. Approuvez-les pour lancer un devis ou une commande.
          </div>
          {purchaseRequisitions.length===0 ? (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:12}}>
              <ShoppingCart size={36} style={{opacity:0.4}}/>
              <p style={{marginTop:10,fontSize:14}}>Aucune demande d&apos;achat pour l&apos;instant.<br/>Cliquez « Réapprovisionner maintenant » sur l&apos;onglet Stock pour lancer un balayage.</p>
            </div>
          ) : (
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div className="table-container" style={{border:'none'}}>
                <table className="data-table">
                  <thead><tr><th>N°</th><th>Créée le</th><th>Statut</th><th>Pièce(s)</th><th>Quantité</th><th>Coût estimé</th><th>Demandeur</th><th style={{minWidth:160}}>Actions</th></tr></thead>
                  <tbody>{[...purchaseRequisitions].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(req => {
                    const lines = purchaseRequisitionLines.filter(l => l.requisitionId === req.id);
                    const partsList = lines.map(l => {
                      const p = parts.find(x => x.id === l.sparePartId);
                      return { name: p?.name || l.sparePartId, ref: p?.reference || '', qty: l.quantity, cost: l.estimatedUnitCost };
                    });
                    const totalQty = partsList.reduce((s,x) => s + (x.qty||0), 0);
                    const totalCost = partsList.reduce((s,x) => s + (x.qty||0)*(x.cost||0), 0);
                    const statusColor = req.status === 'convertie' ? '#22c55e'
                      : req.status === 'rejetée' ? '#94a3b8'
                      : req.status === 'approuvée' ? '#3b82f6'
                      : req.status === 'soumise' ? '#f59e0b'
                      : '#64748b';
                    const statusBg = req.status === 'convertie' ? '#f0fdf4'
                      : req.status === 'rejetée' ? '#f1f5f9'
                      : req.status === 'approuvée' ? '#eff6ff'
                      : req.status === 'soumise' ? '#fffbeb'
                      : '#f8fafc';
                    const canApprove = req.status === 'soumise' || req.status === 'brouillon';
                    const canReject = req.status !== 'convertie' && req.status !== 'rejetée';
                    const canConvert = req.status === 'approuvée';
                    return (
                      <tr key={req.id}>
                        <td><span style={{fontFamily:'monospace',fontWeight:700,fontSize:12}}>{req.reqNumber}</span></td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                        <td><span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:statusBg,color:statusColor,textTransform:'uppercase'}}>{req.status}</span></td>
                        <td>{partsList.length === 0 ? <span style={{fontSize:12,color:'var(--text-muted)'}}>—</span> : partsList.map((x,i)=>(
                          <div key={i} style={{fontSize:12.5}}>
                            <b>{x.name}</b> {x.ref && <span style={{color:'var(--text-muted)',fontFamily:'monospace',fontSize:11}}>· {x.ref}</span>} <span style={{color:'var(--text-muted)'}}>× {x.qty}</span>
                          </div>
                        ))}</td>
                        <td style={{fontWeight:700}}>{totalQty}</td>
                        <td style={{fontWeight:700}}>{formatCurrency(totalCost)}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{req.requestedBy || '—'}</td>
                        <td>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {canApprove && (
                              <button
                                title="Approuver et transformer en demande de devis"
                                onClick={async () => {
                                  try {
                                    await purchaseRequisitionsDb.update(req.id, { status: 'approuvée' });
                                    showToast('✅ Approuvée — création du devis…');
                                    // Pre-fill the RFQ form from this requisition's lines and jump to Devis tab.
                                    const draftFromReq = lines.map(l => ({ sparePartId: l.sparePartId ?? '', quantity: l.quantity ?? 1 })).filter(x => x.sparePartId);
                                    if (draftFromReq.length > 0) {
                                      setRfqDraftLines(draftFromReq);
                                      setRfqForm({ machineId: req.machineId ?? '', notes: `Depuis demande d'achat ${req.reqNumber}` });
                                      setRfqModal(true);
                                    }
                                    setTab('rfq');
                                  } catch (e) {
                                    showToast(e instanceof Error ? e.message : 'Erreur', 'error');
                                  }
                                }}
                                style={{padding:'5px 10px',borderRadius:8,fontSize:11,fontWeight:700,background:'#eef2fb',color:'#0b3a86',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
                              >
                                <CheckCircle size={11}/> Approuver &amp; devis
                              </button>
                            )}
                            {canConvert && (
                              <button
                                title="Convertir en commande — passe la demande en 'convertie'"
                                onClick={async () => { try { await purchaseRequisitionsDb.update(req.id, { status: 'convertie' }); showToast('✅ Convertie en commande'); } catch (e) { showToast(e instanceof Error?e.message:'Erreur','error'); } }}
                                style={{padding:'5px 10px',borderRadius:8,fontSize:11,fontWeight:700,background:'#f0fdf4',color:'#22c55e',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
                              >
                                <Package size={11}/> Convertir
                              </button>
                            )}
                            {canReject && (
                              <button
                                title="Rejeter — passe la demande en 'rejetée'"
                                onClick={async () => { if (!confirm('Rejeter cette demande ?')) return; try { await purchaseRequisitionsDb.update(req.id, { status: 'rejetée' }); showToast('Demande rejetée'); } catch (e) { showToast(e instanceof Error?e.message:'Erreur','error'); } }}
                                style={{padding:'5px 10px',borderRadius:8,fontSize:11,fontWeight:700,background:'#fef2f2',color:'#ef4444',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
                              >
                                <Ban size={11}/> Rejeter
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* SUPPLIERS TAB */}
      {tab==='suppliers' && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={openAddSup} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontWeight:600,fontSize:14,cursor:'pointer'}}><Plus size={16}/>{t('procurement.addSupplier')}</button>
          </div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-container" style={{border:'none'}}>
              <table className="data-table">
                <thead><tr>
                  <th>{t('procurement.supplierName')}</th>
                  <th>Commandes en cours</th>
                  <th>Délai moyen</th>
                  <th style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Indice de fiabilité
                      <div style={{ position: 'relative', display: 'inline-flex' }} title="Calculé automatiquement à partir des retards de livraison et des taux de défauts des pièces reçues.">
                        <Info size={12} color="var(--text-muted)" />
                      </div>
                    </div>
                    <div style={{ fontWeight: 400, fontSize: 9, textTransform: 'none', letterSpacing: 'normal', color: 'var(--text-muted)', marginTop: 2 }}>
                      Calculé sur les retards de livraison &amp; défauts
                    </div>
                  </th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>{sups.map(s=>(
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'var(--primary-lighter)', color: 'var(--primary)' }}>
                        {getActiveOrders(s.id)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.avgDeliveryDays} jours</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ReliabilityRing value={s.reliability} />
                      </div>
                    </td>
                    <td><div style={{display:'flex',gap:4}}>
                      <button onClick={()=>openEditSup(s)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--primary-lighter)',color:'var(--primary)',border:'none',cursor:'pointer'}}><Edit size={13}/></button>
                      <button onClick={()=>delSup(s.id)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--accent-red-light)',color:'var(--accent-red)',border:'none',cursor:'pointer'}}><Trash2 size={13}/></button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* RFQ / DEVIS TAB */}
      {tab==='rfq' && (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>Consultez plusieurs fournisseurs et comparez leurs devis avant de commander.</p>
            <button onClick={()=>{setRfqForm({machineId:'',notes:''});setRfqDraftLines(parts[0]?[{sparePartId:parts[0].id,quantity:1}]:[]);setRfqModal(true);}} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontWeight:600,fontSize:14,cursor:'pointer',whiteSpace:'nowrap'}}><Plus size={16}/>Nouvelle demande de devis</button>
          </div>
          {quoteRequests.length===0 && (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:12}}>
              <FileText size={36} style={{opacity:0.4}}/>
              <p style={{marginTop:10,fontSize:14}}>Aucune demande de devis. Créez-en une pour comparer les fournisseurs.</p>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {quoteRequests.map(rfq=>{
              const rfqQuotes = quotesFor(rfq.id);
              const rfqLines = rfqLinesFor(rfq.id);
              const scores = scoreQuotes(rfqQuotes, sups);
              let bestId:string|null = null; let bestScore = -1;
              scores.forEach((sc,id)=>{ if(sc>bestScore){ bestScore=sc; bestId=id; } });
              const machine = machines.find(m=>m.id===rfq.machineId);
              const isOpen = expandedRfq===rfq.id;
              const receivedCount = rfqQuotes.filter(q=>q.status==='reçu'||q.status==='retenu').length;
              const availableSups = sups.filter(s=>!rfqQuotes.some(q=>q.supplierId===s.id));
              const bestQuote = bestId ? rfqQuotes.find(q=>q.id===bestId) : null;
              const bestSup = bestQuote ? sups.find(s=>s.id===bestQuote.supplierId) : null;
              return (
                <div key={rfq.id} className="card" style={{padding:0,overflow:'hidden'}}>
                  {/* RFQ header */}
                  <div onClick={()=>{setExpandedRfq(isOpen?null:rfq.id);setAddQuoteSupplier('');}} style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
                    <span style={{color:'var(--text-muted)'}}>{isOpen?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</span>
                    <div style={{width:38,height:38,borderRadius:10,background:'var(--primary-lighter)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><FileText size={18} color="var(--primary)"/></div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontFamily:'monospace',fontSize:14}}>{rfq.rfqNumber}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{machine?`Machine ${machine.code}`:'Demande générale'} · {rfqQuotes.length} fournisseur(s) · {receivedCount} devis reçu(s)</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:rfq.status==='ouverte'?'rgba(59,130,246,0.1)':'rgba(34,197,94,0.12)',color:rfq.status==='ouverte'?'#3b82f6':'#22c55e'}}>{rfq.status==='ouverte'?'Ouverte':'Clôturée'}</span>
                    <button onClick={e=>{e.stopPropagation();setDelRfqTarget(rfq);}} title="Supprimer" style={{width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer'}}><Trash2 size={13}/></button>
                  </div>

                  {/* RFQ expanded — quote comparison */}
                  {isOpen && (
                    <div style={{padding:'14px 18px 18px',borderTop:'1px solid var(--border-light)'}}>
                      {rfq.notes && <p style={{fontSize:13,color:'var(--text-secondary)',margin:'0 0 12px',fontStyle:'italic'}}>« {rfq.notes} »</p>}

                      {/* Articles demandés — the RFQ line items */}
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>Articles demandés ({rfqLines.length})</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                          {rfqLines.length===0 && <span style={{fontSize:12,color:'var(--text-muted)'}}>Aucun article (ancienne demande).</span>}
                          {rfqLines.map(rl=>{
                            const part=parts.find(p=>p.id===rl.sparePartId);
                            return <span key={rl.id} style={{fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:8,background:'var(--surface-hover)',color:'var(--text-secondary)'}}>{part?.reference||'—'} × {rl.quantity}</span>;
                          })}
                        </div>
                      </div>

                      {/* Smart recommendation */}
                      {receivedCount>=2 && bestSup && (
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.25)',marginBottom:14}}>
                          <Star size={18} color="#22c55e" fill="#22c55e"/>
                          <div style={{fontSize:13,color:'var(--text-secondary)'}}>
                            <b style={{color:'#16a34a'}}>Recommandation : {bestSup.name}</b> — meilleur rapport prix / fiabilité / délai
                            <span style={{marginLeft:6,fontWeight:700,color:'#16a34a'}}>(score {Math.round(bestScore*100)}%)</span>
                          </div>
                        </div>
                      )}

                      {/* Add a supplier to consult */}
                      {rfq.status==='ouverte' && (
                        <div style={{display:'flex',gap:8,marginBottom:14}}>
                          <select value={addQuoteSupplier} onChange={e=>setAddQuoteSupplier(e.target.value)} style={{...iS,flex:1}}>
                            <option value="">— Ajouter un fournisseur à consulter —</option>
                            {availableSups.map(s=><option key={s.id} value={s.id}>{s.name} · fiabilité {s.reliability}%</option>)}
                          </select>
                          <button disabled={!addQuoteSupplier} onClick={()=>{addQuoteToRfq(rfq.id,addQuoteSupplier);setAddQuoteSupplier('');}} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 16px',borderRadius:10,background:addQuoteSupplier?'var(--primary-lighter)':'var(--surface-hover)',color:addQuoteSupplier?'var(--primary)':'var(--text-muted)',border:'none',fontSize:13,fontWeight:600,cursor:addQuoteSupplier?'pointer':'not-allowed',whiteSpace:'nowrap'}}><Send size={14}/>Consulter</button>
                        </div>
                      )}

                      {/* Quote rows */}
                      {rfqQuotes.length===0 && <div style={{fontSize:13,color:'var(--text-muted)',padding:'8px 0'}}>Aucun fournisseur consulté pour le moment.</div>}
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {rfqQuotes.map(q=>{
                          const sup = sups.find(s=>s.id===q.supplierId);
                          const qc = quoteStatusColors[q.status]||quoteStatusColors['en attente'];
                          const score = scores.get(q.id);
                          const isBest = q.id===bestId && receivedCount>=2;
                          return (
                            <div key={q.id} style={{
                              display:'grid',
                              gridTemplateColumns:'44px minmax(0,1fr) 116px 200px',
                              alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,
                              border:`1px solid ${isBest?'rgba(34,197,94,0.4)':q.status==='retenu'?'rgba(34,197,94,0.4)':'var(--border-light)'}`,
                              background:isBest||q.status==='retenu'?'rgba(34,197,94,0.05)':'var(--surface)',
                              opacity:q.status==='refusé'?0.55:1,
                            }}>
                              <ReliabilityRing value={sup?.reliability??0} size={38}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sup?.name||'—'}</span>
                                  {isBest && <span style={{flexShrink:0,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'#22c55e',color:'white',display:'flex',alignItems:'center',gap:3}}><Star size={9} fill="white"/>Recommandé</span>}
                                </div>
                                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>
                                  {q.status==='en attente' ? 'Devis non reçu'
                                    : `${formatCurrency(q.totalAmount)} · livraison ${q.deliveryDays||'?'} j${score!==undefined?` · score ${Math.round(score*100)}%`:''}`}
                                </div>
                              </div>
                              {/* fixed-width status column so badges align across rows */}
                              <div>
                                <span style={{display:'inline-block',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:qc.bg,color:qc.color,whiteSpace:'nowrap'}}>{qc.label}</span>
                              </div>
                              {/* fixed-width actions column, right-aligned so buttons line up */}
                              <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                                {q.status==='en attente' && <button onClick={()=>openRecordQuote(q)} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--primary-lighter)',color:'var(--primary)',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>Saisir le devis</button>}
                                {q.status==='reçu' && <>
                                  <button onClick={()=>selectQuote(q,rfq.id)} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--accent-green-light)',color:'var(--accent-green)',border:'none',cursor:'pointer'}}>Retenir</button>
                                  <button onClick={()=>declineQuote(q)} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer'}}>Refuser</button>
                                </>}
                                {q.status==='retenu' && <button onClick={()=>openCreatePOFromQuote(q)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}><Package size={12}/>Créer le BC</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ORDERS TAB — multi-line POs */}
      {tab==='orders' && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={openCreatePO} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontWeight:600,fontSize:14,cursor:'pointer'}}><Plus size={16}/>{t('procurement.createPO')}</button>
          </div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="table-container" style={{border:'none'}}>
              <table className="data-table">
                <thead><tr><th style={{width:32}}></th><th>{t('procurement.poNumber')}</th><th>{t('procurement.supplier')}</th><th>Lignes</th><th>{t('procurement.amount')}</th><th>{t('procurement.poStatus')}</th><th>Actions</th></tr></thead>
                <tbody>{pos.map(po=>{
                  const sup=sups.find(s=>s.id===po.supplierId);
                  const st=poStatusColors[po.status]||poStatusColors['brouillon'];
                  const lines=linesFor(po.id);
                  const isOpen=expandedPo===po.id;
                  return(
                    <Fragment key={po.id}>
                      <tr style={{cursor:'pointer'}} onClick={()=>setExpandedPo(isOpen?null:po.id)}>
                        <td style={{textAlign:'center',color:'var(--text-muted)'}}>{isOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</td>
                        <td style={{fontWeight:700,fontFamily:'monospace',fontSize:13}}>{po.poNumber}</td>
                        <td>{sup?.name||'—'}</td>
                        <td><span style={{fontSize:12,fontWeight:600,padding:'2px 8px',borderRadius:100,background:'var(--surface-hover)',color:'var(--text-secondary)'}}>{lines.length} pièce(s)</span></td>
                        <td style={{fontWeight:600}}>{formatCurrency(po.totalAmount)}</td>
                        <td>
                          <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-start'}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:st.bg,color:st.color}}>{st.label}</span>
                            {po.approvalStatus && po.approvalStatus!=='non requis' && approvalColors[po.approvalStatus] && (
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:100,background:approvalColors[po.approvalStatus].bg,color:approvalColors[po.approvalStatus].color}}>
                                {approvalColors[po.approvalStatus].label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                          {/* Approval actions — pending PO, admin only */}
                          {po.status==='brouillon' && po.approvalStatus==='en attente' && isAdmin && (<>
                            <button onClick={()=>approvePO(po)} style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--accent-green-light)',color:'var(--accent-green)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><CheckCircle size={12}/>Approuver</button>
                            <button onClick={()=>{setRejectTarget(po);setRejectReason('');}} style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><Ban size={12}/>Rejeter</button>
                          </>)}
                          {/* Pending PO, non-admin — info badge */}
                          {po.status==='brouillon' && po.approvalStatus==='en attente' && !isAdmin && (
                            <span style={{fontSize:11,fontWeight:600,color:'#f59e0b',display:'flex',alignItems:'center',gap:4}}><Clock size={12}/>En attente</span>
                          )}
                          {/* Send — draft, and approved or no approval needed */}
                          {po.status==='brouillon' && (po.approvalStatus==='non requis'||po.approvalStatus==='approuvé'||!po.approvalStatus) &&
                            <button onClick={()=>sendPO(po)} style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--primary-lighter)',color:'var(--primary)',border:'none',cursor:'pointer'}}>Envoyer</button>}
                          {(po.status==='envoyée'||po.status==='partielle')&&<button onClick={()=>openReceive(po)} style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--accent-green-light)',color:'var(--accent-green)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><PackageCheck size={12}/>Réceptionner</button>}
                          <button onClick={()=>setDelPoTarget(po)} title="Supprimer le bon de commande" style={{width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer'}}><Trash2 size={13}/></button>
                        </div></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{background:'var(--surface-hover)',padding:'8px 16px 12px 48px'}}>
                            {po.approvalStatus==='approuvé' && (
                              <div style={{fontSize:12,color:'#16a34a',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                                <CheckCircle size={13}/> Approuvé par <b>{po.approvedBy || '—'}</b>
                                {po.approvedAt && ` le ${new Date(po.approvedAt).toLocaleDateString('fr-FR')}`}
                              </div>
                            )}
                            {po.approvalStatus==='rejeté' && (
                              <div style={{fontSize:12,color:'#dc2626',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                                <Ban size={13}/> Rejeté — motif : <b>{po.rejectionReason || 'Non précisé'}</b>
                              </div>
                            )}
                            <table style={{width:'100%',fontSize:13}}>
                              <thead><tr style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase'}}>
                                <th style={{textAlign:'left',padding:'4px 8px'}}>Pièce</th>
                                <th style={{textAlign:'right',padding:'4px 8px'}}>Qté</th>
                                <th style={{textAlign:'right',padding:'4px 8px'}}>Coût unit.</th>
                                <th style={{textAlign:'right',padding:'4px 8px'}}>Total ligne</th>
                                <th style={{textAlign:'right',padding:'4px 8px'}}>Reçu</th>
                              </tr></thead>
                              <tbody>
                                {lines.length===0 && <tr><td colSpan={5} style={{padding:'8px',color:'var(--text-muted)'}}>Aucune ligne</td></tr>}
                                {lines.map(l=>{
                                  const part=parts.find(p=>p.id===l.sparePartId);
                                  return(
                                    <tr key={l.id}>
                                      <td style={{padding:'4px 8px'}}>{part?<><b>{part.reference}</b> — {part.name}</>:'—'}</td>
                                      <td style={{textAlign:'right',padding:'4px 8px'}}>{l.quantity}</td>
                                      <td style={{textAlign:'right',padding:'4px 8px'}}>{formatCurrency(l.unitCost)}</td>
                                      <td style={{textAlign:'right',padding:'4px 8px',fontWeight:600}}>{formatCurrency(l.quantity*l.unitCost)}</td>
                                      <td style={{textAlign:'right',padding:'4px 8px',color:l.receivedQty>=l.quantity?'#22c55e':'var(--text-muted)'}}>{l.receivedQty}/{l.quantity}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* RÉCEPTIONS TAB — goods-receipt notes */}
      {tab==='receipts' && (
        <>
          <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 16px'}}>Historique des bons de réception. Réceptionnez une commande depuis l&apos;onglet « Commandes ».</p>
          {goodsReceipts.length===0 && (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:12}}>
              <PackageCheck size={36} style={{opacity:0.4}}/>
              <p style={{marginTop:10,fontSize:14}}>Aucune réception enregistrée.</p>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {goodsReceipts.map(grn=>{
              const po = pos.find(p=>p.id===grn.poId);
              const sup = po ? sups.find(s=>s.id===po.supplierId) : null;
              const isOpen = expandedGrn===grn.id;
              const grnLineList = Array.isArray(grn.lines) ? grn.lines : [];
              return (
                <div key={grn.id} className="card" style={{padding:0,overflow:'hidden'}}>
                  <div onClick={()=>setExpandedGrn(isOpen?null:grn.id)} style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
                    <span style={{color:'var(--text-muted)'}}>{isOpen?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</span>
                    <div style={{width:38,height:38,borderRadius:10,background:'var(--accent-green-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><PackageCheck size={18} color="var(--accent-green)"/></div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontFamily:'monospace',fontSize:14}}>{grn.grnNumber}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{po?.poNumber||'—'} · {sup?.name||'—'} · reçu par {grn.receivedBy} · {new Date(grn.receivedDate).toLocaleDateString('fr-FR')}</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:'var(--surface-hover)',color:'var(--text-secondary)'}}>{grnLineList.length} ligne(s)</span>
                  </div>
                  {isOpen && (
                    <div style={{padding:'12px 18px 16px 48px',borderTop:'1px solid var(--border-light)',background:'var(--surface-hover)'}}>
                      {grn.notes && <p style={{fontSize:12,color:'var(--text-secondary)',fontStyle:'italic',margin:'0 0 8px'}}>« {grn.notes} »</p>}
                      <table style={{width:'100%',fontSize:13}}>
                        <thead><tr style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase'}}>
                          <th style={{textAlign:'left',padding:'4px 8px'}}>Pièce</th>
                          <th style={{textAlign:'right',padding:'4px 8px'}}>Qté reçue</th>
                          <th style={{textAlign:'right',padding:'4px 8px'}}>État</th>
                        </tr></thead>
                        <tbody>
                          {grnLineList.map((gl,i)=>{
                            const part=parts.find(p=>p.id===gl.sparePartId);
                            return (
                              <tr key={i}>
                                <td style={{padding:'4px 8px'}}>{part?<><b>{part.reference}</b> — {part.name}</>:'—'}</td>
                                <td style={{textAlign:'right',padding:'4px 8px',fontWeight:600}}>{gl.receivedQty}</td>
                                <td style={{textAlign:'right',padding:'4px 8px'}}>
                                  <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:100,background:gl.condition==='conforme'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',color:gl.condition==='conforme'?'#22c55e':'#ef4444'}}>{gl.condition}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ALERTS TAB */}
      {tab==='alerts' && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {alerts.length===0 ? (
            <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:14}}>✅ Aucune alerte prédictive — stock suffisant</div>
          ) : alerts.map(a=>(
            <div key={a.part.id} className="card" style={{padding:16,display:'flex',alignItems:'center',gap:16,borderLeft:`4px solid ${a.daysLeft<=3?'#ef4444':a.daysLeft<=10?'#f59e0b':'#3b82f6'}`}}>
              <div style={{width:40,height:40,borderRadius:10,background:a.daysLeft<=3?'var(--accent-red-light)':'var(--accent-orange-light)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <AlertTriangle size={20} color={a.daysLeft<=3?'#ef4444':'#f59e0b'}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:'var(--text-primary)'}}>{a.part.name} <span style={{fontWeight:400,color:'var(--text-muted)',fontSize:12}}>({a.part.reference})</span></div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Stock: {a.part.quantity} / Seuil: {a.part.minimumStock} — {t('procurement.predictedStockout')}: ~{a.daysLeft} {t('procurement.daysLeft')}</div>
              </div>
              {a.orderBefore>0 && <span style={{fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:100,background:'var(--accent-red-light)',color:'var(--accent-red)'}}>{t('procurement.recommendOrder')} {a.orderBefore}j</span>}
            </div>
          ))}
        </div>
      )}

      {/* Supplier Modal */}
      <Modal isOpen={supModal} onClose={()=>setSupModal(false)} title={editSup?`Modifier ${editSup.name}`:t('procurement.addSupplier')} size="md"
        footer={<><button onClick={()=>setSupModal(false)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
        <button onClick={saveSup} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer',opacity:busy?0.7:1}}>{t('action.save')}</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={lS}>{t('procurement.supplierName')} *</label><input style={iS} value={sf.name} onChange={e=>setSf(p=>({...p,name:e.target.value}))} /></div>
          <div><label style={lS}>Contact</label><input style={iS} value={sf.contactName} onChange={e=>setSf(p=>({...p,contactName:e.target.value}))} /></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={lS}>Email</label><input style={iS} value={sf.email} onChange={e=>setSf(p=>({...p,email:e.target.value}))} /></div>
            <div><label style={lS}>{t('personnel.phone')}</label><input style={iS} value={sf.phone} onChange={e=>setSf(p=>({...p,phone:e.target.value}))} /></div>
          </div>
          <div><label style={lS}>{t('procurement.deliveryDays')}</label><input type="number" style={iS} value={sf.avgDeliveryDays} onChange={e=>setSf(p=>({...p,avgDeliveryDays:+e.target.value}))} /></div>
          <div style={{padding:12,borderRadius:10,background:'var(--primary-lighter)',fontSize:12,color:'var(--primary)',display:'flex',alignItems:'center',gap:8}}>
            <Info size={14} /> Le score de fiabilité est calculé automatiquement à partir des délais de livraison et des taux de défauts.
          </div>
        </div>
      </Modal>

      {/* PO Modal — multi-line */}
      <Modal isOpen={poModal} onClose={()=>{setPoModal(false);setPoFromQuote(null);}} title={poFromQuote?'Bon de commande — depuis devis retenu':'Nouveau Bon de Commande'} size="lg"
        footer={<><button onClick={()=>{setPoModal(false);setPoFromQuote(null);}} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
        <button onClick={createPO} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer',opacity:busy?0.7:1}}>Créer le bon de commande</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Devis reference — shown when this PO is built from a retained quote */}
          {poFromQuote && (
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.25)'}}>
              <CheckCircle size={18} color="#22c55e"/>
              <div style={{flex:1,fontSize:13,color:'var(--text-secondary)'}}>
                Devis retenu auprès de <b>{sups.find(s=>s.id===poFromQuote.supplierId)?.name||'—'}</b>
                {poFromQuote.deliveryDays?` · livraison ${poFromQuote.deliveryDays} j`:''}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase'}}>Montant convenu</div>
                <div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{formatCurrency(poFromQuote.totalAmount)}</div>
              </div>
            </div>
          )}
          <div><label style={lS}>{t('procurement.supplier')}</label>
            <select style={iS} value={poSupplierId} onChange={e=>setPoSupplierId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {sups.map(s=><option key={s.id} value={s.id}>{s.name} · {s.avgDeliveryDays}j · fiabilité {s.reliability}%</option>)}
            </select>
          </div>

          {/* Lines editor */}
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <label style={{...lS,marginBottom:0}}>Lignes de commande</label>
              <button onClick={addLine} style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--primary-lighter)',color:'var(--primary)',border:'none',cursor:'pointer'}}><Plus size={13}/>Ajouter une ligne</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {poLines.length===0 && <div style={{padding:'16px',textAlign:'center',color:'var(--text-muted)',fontSize:13,border:'1px dashed var(--border)',borderRadius:10}}>Aucune ligne — cliquez sur « Ajouter une ligne »</div>}
              {poLines.map((l,idx)=>(
                <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 80px 110px 100px 32px',gap:8,alignItems:'center'}}>
                  <select style={{...iS,padding:'8px 10px'}} value={l.sparePartId} onChange={e=>updateLine(idx,{sparePartId:e.target.value})}>
                    <option value="">— Pièce —</option>
                    {parts.map(p=><option key={p.id} value={p.id}>{p.reference} — {p.name}</option>)}
                  </select>
                  <input type="number" min={1} style={{...iS,padding:'8px 10px'}} value={l.quantity} onChange={e=>updateLine(idx,{quantity:Math.max(1,+e.target.value)})} title="Quantité"/>
                  <input type="number" min={0} step={0.01} style={{...iS,padding:'8px 10px'}} value={l.unitCost} onChange={e=>updateLine(idx,{unitCost:+e.target.value})} title="Coût unitaire"/>
                  <div style={{fontSize:13,fontWeight:600,textAlign:'right'}}>{formatCurrency(l.quantity*l.unitCost)}</div>
                  <button onClick={()=>removeLine(idx)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer'}}><X size={14}/></button>
                </div>
              ))}
            </div>
          </div>

          {/* Running total */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderRadius:12,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)'}}>
            <span style={{fontSize:13,fontWeight:600,color:'var(--primary)'}}>Total du bon de commande</span>
            <span style={{fontSize:20,fontWeight:800,color:'var(--primary)'}}>{formatCurrency(poDraftTotal)}</span>
          </div>

          {/* Devis match indicator */}
          {poFromQuote && (
            Math.abs(poDraftTotal - poFromQuote.totalAmount) < 0.01 ? (
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#16a34a',fontWeight:600}}>
                <CheckCircle size={13}/> Le total correspond au devis retenu ({formatCurrency(poFromQuote.totalAmount)})
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#f59e0b',fontWeight:600}}>
                <AlertTriangle size={13}/> Écart avec le devis retenu : {formatCurrency(poDraftTotal - poFromQuote.totalAmount)} (devis : {formatCurrency(poFromQuote.totalAmount)})
              </div>
            )
          )}
        </div>
      </Modal>

      {/* Reject PO modal */}
      <Modal isOpen={!!rejectTarget} onClose={()=>setRejectTarget(null)} title="Rejeter le bon de commande" size="sm"
        footer={<><button onClick={()=>setRejectTarget(null)} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:busy?'not-allowed':'pointer',color:'var(--text-primary)',opacity:busy?0.5:1}}>{t('action.cancel')}</button>
        <button onClick={rejectPO} disabled={busy} style={{padding:'10px 24px',borderRadius:10,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer'}}>Rejeter</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <p style={{fontSize:14,color:'var(--text-secondary)'}}>Rejeter <b>{rejectTarget?.poNumber}</b> ({rejectTarget?formatCurrency(rejectTarget.totalAmount):''}) ?</p>
          <div>
            <label style={lS}>Motif du rejet</label>
            <textarea style={{...iS,minHeight:80,resize:'vertical'}} placeholder="Ex: budget dépassé, fournisseur non agréé, devis à renégocier..." value={rejectReason} onChange={e=>setRejectReason(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Delete PO confirmation */}
      <Modal isOpen={!!delPoTarget} onClose={()=>setDelPoTarget(null)} title="Supprimer le bon de commande" size="sm"
        footer={<><button onClick={()=>setDelPoTarget(null)} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:busy?'not-allowed':'pointer',color:'var(--text-primary)',opacity:busy?0.5:1}}>{t('action.cancel')}</button>
        <button onClick={delPO} disabled={busy} style={{padding:'10px 24px',borderRadius:10,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer'}}>{t('action.delete')}</button></>}>
        <div style={{textAlign:'center',padding:'12px 0'}}>
          <div style={{width:56,height:56,borderRadius:'50%',background:'var(--accent-red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
            <AlertTriangle size={28} color="#ef4444"/>
          </div>
          <p style={{fontSize:15,fontWeight:500,marginBottom:4}}>Supprimer <b>{delPoTarget?.poNumber}</b> ?</p>
          <p style={{fontSize:13,color:'var(--text-muted)'}}>Toutes les lignes de ce bon seront également supprimées. Action irréversible.</p>
        </div>
      </Modal>

      {/* New RFQ modal — itemized */}
      <Modal isOpen={rfqModal} onClose={()=>setRfqModal(false)} title="Nouvelle demande de devis" size="lg"
        footer={<><button onClick={()=>setRfqModal(false)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
        <button onClick={createRFQ} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer',opacity:busy?0.7:1}}>Créer la demande</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div><label style={lS}>Machine concernée (optionnel)</label>
            <select style={iS} value={rfqForm.machineId} onChange={e=>setRfqForm(f=>({...f,machineId:e.target.value}))}>
              <option value="">— Demande générale —</option>
              {machines.map(m=><option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>
          <div><label style={lS}>Objet de la consultation</label>
            <textarea style={{...iS,minHeight:60,resize:'vertical'}} placeholder="Ex: pièces de rechange pour révision de la remplisseuse REM-001..." value={rfqForm.notes} onChange={e=>setRfqForm(f=>({...f,notes:e.target.value}))} />
          </div>

          {/* Articles demandés — RFQ lines editor */}
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <label style={{...lS,marginBottom:0}}>Articles à sourcer</label>
              <button onClick={addRfqLine} style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:8,fontSize:12,fontWeight:600,background:'var(--primary-lighter)',color:'var(--primary)',border:'none',cursor:'pointer'}}><Plus size={13}/>Ajouter une pièce</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {rfqDraftLines.length===0 && <div style={{padding:'14px',textAlign:'center',color:'var(--text-muted)',fontSize:13,border:'1px dashed var(--border)',borderRadius:10}}>Ajoutez les pièces dont vous voulez obtenir des devis.</div>}
              {rfqDraftLines.map((l,idx)=>(
                <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 90px 32px',gap:8,alignItems:'center'}}>
                  <select style={{...iS,padding:'8px 10px'}} value={l.sparePartId} onChange={e=>updateRfqLine(idx,{sparePartId:e.target.value})}>
                    <option value="">— Pièce —</option>
                    {parts.map(p=><option key={p.id} value={p.id}>{p.reference} — {p.name}</option>)}
                  </select>
                  <input type="number" min={1} style={{...iS,padding:'8px 10px'}} value={l.quantity} onChange={e=>updateRfqLine(idx,{quantity:Math.max(1,+e.target.value)})} title="Quantité"/>
                  <button onClick={()=>removeRfqLine(idx)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--accent-red-light)',color:'#ef4444',border:'none',cursor:'pointer'}}><X size={14}/></button>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:12,borderRadius:10,background:'var(--primary-lighter)',fontSize:12,color:'var(--primary)'}}>
            💡 Chaque fournisseur consulté chiffrera ces articles ligne par ligne. Le devis retenu génère le bon de commande au prix exact.
          </div>
        </div>
      </Modal>

      {/* Record-a-quote modal — per-line unit prices */}
      <Modal isOpen={!!quoteResp} onClose={()=>setQuoteResp(null)} title="Saisir le devis du fournisseur" size="lg"
        footer={<><button onClick={()=>setQuoteResp(null)} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
        <button onClick={recordQuote} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer',opacity:busy?0.7:1}}>Enregistrer le devis</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <p style={{fontSize:13,color:'var(--text-secondary)',margin:0}}>Fournisseur : <b>{sups.find(s=>s.id===quoteResp?.supplierId)?.name||'—'}</b></p>

          {/* Per-line price entry */}
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 70px 130px 110px',gap:8,fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6,padding:'0 4px'}}>
              <span>Pièce</span><span style={{textAlign:'right'}}>Qté</span><span style={{textAlign:'right'}}>Prix unitaire</span><span style={{textAlign:'right'}}>Total ligne</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {respLines.length===0 && <div style={{padding:'14px',textAlign:'center',color:'var(--text-muted)',fontSize:13,border:'1px dashed var(--border)',borderRadius:10}}>Cette demande n&apos;a pas d&apos;articles. Supprimez-la et créez-en une nouvelle.</div>}
              {respLines.map((l,idx)=>{
                const part=parts.find(p=>p.id===l.sparePartId);
                return (
                  <div key={l.rfqLineId} style={{display:'grid',gridTemplateColumns:'1fr 70px 130px 110px',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><b>{part?.reference||'—'}</b> {part?.name||''}</span>
                    <span style={{fontSize:13,textAlign:'right',fontWeight:600}}>{l.quantity}</span>
                    <input type="number" min={0} step={0.01} style={{...iS,padding:'8px 10px',textAlign:'right'}} value={l.unitPrice}
                      onChange={e=>setRespLines(prev=>prev.map((x,i)=>i===idx?{...x,unitPrice:+e.target.value}:x))} />
                    <span style={{fontSize:13,fontWeight:700,textAlign:'right'}}>{formatCurrency(l.unitPrice*l.quantity)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'end'}}>
            <div><label style={lS}>Délai de livraison (jours)</label><input type="number" min={1} style={iS} value={respDeliveryDays} onChange={e=>setRespDeliveryDays(+e.target.value)} /></div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderRadius:10,background:'var(--primary-lighter)',border:'1px solid var(--primary-light)'}}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--primary)'}}>Total devis</span>
              <span style={{fontSize:18,fontWeight:800,color:'var(--primary)'}}>{formatCurrency(respTotal)}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete RFQ confirmation */}
      <Modal isOpen={!!delRfqTarget} onClose={()=>setDelRfqTarget(null)} title="Supprimer la demande de devis" size="sm"
        footer={<><button onClick={()=>setDelRfqTarget(null)} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:busy?'not-allowed':'pointer',color:'var(--text-primary)',opacity:busy?0.5:1}}>{t('action.cancel')}</button>
        <button onClick={delRFQ} disabled={busy} style={{padding:'10px 24px',borderRadius:10,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer'}}>{t('action.delete')}</button></>}>
        <div style={{textAlign:'center',padding:'12px 0'}}>
          <div style={{width:56,height:56,borderRadius:'50%',background:'var(--accent-red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
            <AlertTriangle size={28} color="#ef4444"/>
          </div>
          <p style={{fontSize:15,fontWeight:500,marginBottom:4}}>Supprimer <b>{delRfqTarget?.rfqNumber}</b> ?</p>
          <p style={{fontSize:13,color:'var(--text-muted)'}}>Tous les devis associés seront également supprimés.</p>
        </div>
      </Modal>

      {/* Goods receipt (Bon de Réception) modal */}
      <Modal isOpen={!!grnPo} onClose={()=>setGrnPo(null)} title={`Bon de réception — ${grnPo?.poNumber||''}`} size="lg"
        footer={<><button onClick={()=>setGrnPo(null)} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
        <button onClick={createGRN} disabled={busy} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#16a34a,#15803d)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:busy?'wait':'pointer',opacity:busy?0.7:1,display:'flex',alignItems:'center',gap:6}}><PackageCheck size={15}/>Valider la réception</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <p style={{fontSize:13,color:'var(--text-secondary)',margin:0}}>Saisissez les quantités <b>réellement reçues</b>. Seuls les articles « conformes » entrent en stock.</p>

          {/* Per-line receiving */}
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 70px 80px 110px 150px',gap:8,fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6,padding:'0 4px'}}>
              <span>Pièce</span><span style={{textAlign:'right'}}>Cmdé</span><span style={{textAlign:'right'}}>Déjà reçu</span><span style={{textAlign:'right'}}>Reçu mnt.</span><span style={{textAlign:'right'}}>État</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {grnLines.length===0 && <div style={{padding:'14px',textAlign:'center',color:'var(--text-muted)',fontSize:13,border:'1px dashed var(--border)',borderRadius:10}}>Ce bon de commande n&apos;a aucune ligne.</div>}
              {grnLines.map((l,idx)=>{
                const part=parts.find(p=>p.id===l.sparePartId);
                const remaining=l.ordered-l.alreadyReceived;
                return (
                  <div key={l.poLineId} style={{display:'grid',gridTemplateColumns:'1fr 70px 80px 110px 150px',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><b>{part?.reference||'—'}</b> {part?.name||''}</span>
                    <span style={{fontSize:13,textAlign:'right',fontWeight:600}}>{l.ordered}</span>
                    <span style={{fontSize:13,textAlign:'right',color:'var(--text-muted)'}}>{l.alreadyReceived}</span>
                    <input type="number" min={0} max={remaining} style={{...iS,padding:'8px 10px',textAlign:'right'}} value={l.receiveNow}
                      onChange={e=>setGrnLines(prev=>prev.map((x,i)=>i===idx?{...x,receiveNow:Math.max(0,Math.min(remaining,+e.target.value))}:x))} />
                    <select style={{...iS,padding:'8px 10px'}} value={l.condition}
                      onChange={e=>setGrnLines(prev=>prev.map((x,i)=>i===idx?{...x,condition:e.target.value as ReceiptCondition}:x))}>
                      <option value="conforme">Conforme</option>
                      <option value="endommagé">Endommagé</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div><label style={lS}>Notes de réception (optionnel)</label>
            <textarea style={{...iS,minHeight:56,resize:'vertical'}} placeholder="Ex: colis n°2 légèrement abîmé, livraison partielle..." value={grnNotes} onChange={e=>setGrnNotes(e.target.value)} />
          </div>
          <div style={{padding:12,borderRadius:10,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',fontSize:12,color:'#16a34a'}}>
            ✅ La validation met à jour le stock des pièces conformes et passe le bon de commande en « partielle » ou « réceptionnée ».
          </div>
        </div>
      </Modal>
    </>
  );
}
