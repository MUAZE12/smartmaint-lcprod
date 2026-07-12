'use client';

import Header from '@/components/Header';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import ImageUpload from '@/components/ui/ImageUpload';
import Procurement from '@/components/Procurement';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/context/AppContext';
import { useData } from '@/context/DataContext';
import { sparePartsDb } from '@/lib/db';
import type { SparePart } from '@/lib/types';
import { Package, AlertTriangle, Search, Plus, Edit, Trash2, ShoppingCart, DollarSign, TrendingDown, RefreshCw } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

const iS: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--background)',fontSize:14,fontFamily:'inherit',color:'var(--text-primary)',outline:'none' };
const lS: React.CSSProperties = { display:'block',fontSize:12,fontWeight:600,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.04em' };

export default function SparePartsPage() {
    const { showToast } = useToast();
    const { t, formatCurrency } = useApp();
    const { spareParts: parts, machines } = useData();
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [mainTab, setMainTab] = useState<'stock'|'procurement'>('stock');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<SparePart|null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SparePart|null>(null);
    const [orderTarget, setOrderTarget] = useState<SparePart|null>(null);
    const [orderQty, setOrderQty] = useState(0);
    const [form, setForm] = useState({ name:'',reference:'',quantity:0,minimumStock:0,unitCost:0,machineId:'' as string|null,imageUrl:undefined as string|undefined });

    const filtered = useMemo(() => parts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.reference.toLowerCase().includes(search.toLowerCase())), [parts, search]);
    const totalValue = parts.reduce((s,p) => s+p.quantity*p.unitCost, 0);
    const alertParts = parts.filter(p => p.quantity<=p.minimumStock);
    const outOfStock = parts.filter(p => p.quantity===0);

    const openCreate = () => { setEditing(null); setForm({name:'',reference:'',quantity:0,minimumStock:0,unitCost:0,machineId:'',imageUrl:undefined}); setIsDrawerOpen(true); };
    const openEdit = (p:SparePart) => { setEditing(p); setForm({name:p.name,reference:p.reference,quantity:p.quantity,minimumStock:p.minimumStock,unitCost:p.unitCost,machineId:p.machineId||'',imageUrl:p.imageUrl}); setIsDrawerOpen(true); };
    const openOrder = (p:SparePart) => { setOrderTarget(p); setOrderQty(Math.max(0, p.minimumStock*2 - p.quantity)); };

    const handleSave = async () => {
        if (!form.name.trim() || !form.reference.trim()) {
            showToast('Nom et référence sont obligatoires', 'error'); return;
        }
        setBusy(true);
        // machineId is `string | null` per SparePart type; imageUrl is `string | undefined`.
        const payload = {
            ...form,
            machineId: form.machineId || null,
            imageUrl: form.imageUrl || undefined,
        };
        try {
            if (editing) {
                await sparePartsDb.update(editing.id, payload);
                showToast('Pièce mise à jour');
            } else {
                await sparePartsDb.create(payload);
                showToast('Référence ajoutée');
            }
            setIsDrawerOpen(false);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };
    const handleOrder = async () => {
        if (!orderTarget) return;
        setBusy(true);
        try {
            await sparePartsDb.update(orderTarget.id, { quantity: orderTarget.quantity + orderQty });
            showToast('✅ Commande envoyée');
            setOrderTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            await sparePartsDb.remove(deleteTarget.id);
            showToast('Pièce supprimée', 'error');
            setDeleteTarget(null);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };

    // Demo escape hatch: lets the tutorial fill the create form reliably.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as Partial<typeof form> | undefined;
            if (!detail) return;
            setForm(prev => ({ ...prev, ...detail }));
        };
        window.addEventListener('smartmaint-demo-set-spareparts-form', handler);
        return () => window.removeEventListener('smartmaint-demo-set-spareparts-form', handler);
    }, []);

    const getStockBadge = (p:SparePart) => {
        if(p.quantity===0) return {label:t('parts.outOfStock'),color:'#ef4444',bg:'#fef2f2',blink:true};
        if(p.quantity<=p.minimumStock) return {label:t('parts.toOrder'),color:'#f59e0b',bg:'#fffbeb',blink:false};
        return {label:t('parts.inStock'),color:'#22c55e',bg:'#f0fdf4',blink:false};
    };

    return (
        <>
            <Header title={t('page.spareParts.title')} subtitle={t('page.spareParts.subtitle')} />
            <main style={{padding:'24px 32px'}}>
                {/* KPIs — refined enterprise metric row */}
                <div data-tour="parts-kpis" style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:10,marginBottom:22}}>
                    <div className="kpi-card blue">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                            <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('parts.totalRefs')}</span>
                            <div style={{width:26,height:26,borderRadius:6,background:'#eef2fb',display:'flex',alignItems:'center',justifyContent:'center'}}><Package size={14} color="#0b3a86"/></div>
                        </div>
                        <div>{parts.length}</div>
                    </div>
                    <div className="kpi-card green">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                            <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('parts.stockValue')}</span>
                            <div style={{width:26,height:26,borderRadius:6,background:'#ecf7f0',display:'flex',alignItems:'center',justifyContent:'center'}}><DollarSign size={14} color="#0e7c3f"/></div>
                        </div>
                        <div style={{fontSize:22 as unknown as number}}>{formatCurrency(totalValue)}</div>
                    </div>
                    <div className="kpi-card orange">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                            <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('parts.alert')}</span>
                            <div style={{width:26,height:26,borderRadius:6,background:'#fbf1e3',display:'flex',alignItems:'center',justifyContent:'center'}}><TrendingDown size={14} color="#b45309"/></div>
                        </div>
                        <div style={{color:'#b45309'}}>{alertParts.length}</div>
                    </div>
                    <div className="kpi-card red">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                            <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('parts.outOfStock')}</span>
                            <div style={{width:26,height:26,borderRadius:6,background:'#fbecec',display:'flex',alignItems:'center',justifyContent:'center'}}><AlertTriangle size={14} color="#b91c1c"/></div>
                        </div>
                        <div style={{color:'#b91c1c'}}>{outOfStock.length}</div>
                    </div>
                </div>

                {/* Tab bar — segmented control */}
                <div data-tour="parts-tabs" style={{display:'inline-flex',gap:2,marginBottom:20,background:'var(--surface-hover)',borderRadius:8,padding:3,border:'1px solid var(--border)'}}>
                    {[{k:'stock' as const,l:t('procurement.stock')},{k:'procurement' as const,l:'Approvisionnement'}].map(tb=>(
                        <button key={tb.k} onClick={()=>setMainTab(tb.k)} style={{padding:'7px 16px',borderRadius:6,fontSize:12.5,fontWeight:600,cursor:'pointer',border:'none',transition:'all 0.15s ease',
                            background:mainTab===tb.k?'var(--surface)':'transparent',color:mainTab===tb.k?'var(--text-primary)':'var(--text-secondary)',boxShadow:mainTab===tb.k?'0 1px 2px rgba(11,18,32,0.06)':'none',fontFamily:'inherit',letterSpacing:'0.005em'}}>{tb.l}</button>
                    ))}
                </div>

                {mainTab==='stock' && (
                    <>
                        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
                            <div style={{position:'relative',flex:1,minWidth:200}}>
                                <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
                                <input data-tour="parts-search" className="input" placeholder={t('action.search')} value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:36,padding:'10px 14px 10px 36px',fontSize:14}}/>
                            </div>
                            <ForceReorderButton />
                            <button onClick={openCreate} data-tour="page-add" style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontWeight:600,fontSize:14,cursor:'pointer',boxShadow:'0 4px 12px rgba(59,130,246,0.25)',whiteSpace:'nowrap'}}><Plus size={18}/>{t('parts.add')}</button>
                        </div>
                        <div data-tour="parts-table" className="card" style={{padding:0,overflow:'hidden'}}>
                            <div className="table-container" style={{border:'none'}}>
                                <table className="data-table">
                                    <thead><tr><th style={{width:50}}>Photo</th><th>Réf</th><th>{t('parts.name')}</th><th>Machine</th><th>Qté</th><th>Seuil</th><th>{t('parts.unitCost')}</th><th>Statut</th><th>Actions</th></tr></thead>
                                    <tbody>{filtered.map(p=>{
                                        const badge=getStockBadge(p); const machine=machines.find(m=>m.id===p.machineId);
                                        return (
                                            <tr key={p.id} data-tour="parts-row" data-part-reference={p.reference} style={{background:p.quantity<=p.minimumStock?'#fffbeb08':undefined}}>
                                                <td>{p.imageUrl ? <img src={p.imageUrl} alt="" style={{width:36,height:36,borderRadius:6,objectFit:'cover'}}/> : <div style={{width:36,height:36,borderRadius:6,background:'var(--surface-hover)',display:'flex',alignItems:'center',justifyContent:'center'}}><Package size={14} color="var(--text-muted)"/></div>}</td>
                                                <td><span style={{fontWeight:700,fontSize:13,fontFamily:'monospace'}}>{p.reference}</span></td>
                                                <td style={{fontWeight:500}}>{p.name}</td>
                                                <td style={{fontSize:12,color:'var(--text-muted)'}}>{machine?.code||'—'}</td>
                                                <td><span style={{fontWeight:700,color:p.quantity<=p.minimumStock?'#ef4444':'var(--text-primary)'}}>{p.quantity}</span></td>
                                                <td style={{color:'var(--text-muted)'}}>{p.minimumStock}</td>
                                                <td>{formatCurrency(p.unitCost)}</td>
                                                <td><span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:badge.bg,color:badge.color,animation:badge.blink?'pulse-soft 1s infinite':'none'}}>{badge.label}</span></td>
                                                <td><div style={{display:'flex',gap:4}}>
                                                    {p.quantity<=p.minimumStock&&<button data-tour="parts-row-reorder" onClick={()=>openOrder(p)} style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:'#fffbeb',color:'#f59e0b',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><ShoppingCart size={12}/>{t('parts.reorder')}</button>}
                                                    <button data-tour="parts-row-edit" onClick={()=>openEdit(p)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'#eff6ff',color:'#3b82f6',border:'none',cursor:'pointer'}}><Edit size={13}/></button>
                                                    <button data-tour="parts-row-delete" onClick={()=>setDeleteTarget(p)} style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:'#fef2f2',color:'#ef4444',border:'none',cursor:'pointer'}}><Trash2 size={13}/></button>
                                                </div></td>
                                            </tr>
                                        );
                                    })}</tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {mainTab==='procurement' && <Procurement parts={parts} />}
            </main>

            {/* Create/Edit Drawer */}
            <SlideOver isOpen={isDrawerOpen} onClose={()=>setIsDrawerOpen(false)} title={editing?`Modifier ${editing.reference}`:t('parts.add')} width={480}
                footer={<><button data-tour="parts-form-cancel" onClick={()=>setIsDrawerOpen(false)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button data-tour="parts-form-save" onClick={handleSave} style={{padding:'10px 24px',borderRadius:10,background:'linear-gradient(135deg,#3b82f6,#1e40af)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>{t('action.save')}</button></>}>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <ImageUpload value={form.imageUrl} onChange={url=>setForm(f=>({...f,imageUrl:url}))} shape="square" size={100} label={t('parts.uploadPhoto')}/>
                    <div><label style={lS}>{t('parts.name')} *</label><input data-tour="parts-form-name" style={iS} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Roulement à billes SKF"/></div>
                    <div><label style={lS}>{t('parts.reference')} *</label><input data-tour="parts-form-reference" style={iS} value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))} placeholder="Ex: SKF-6205-2RS"/></div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div><label style={lS}>{t('parts.quantity')}</label><input type="number" style={iS} value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:+e.target.value}))}/></div>
                        <div><label style={lS}>{t('parts.threshold')}</label><input type="number" style={iS} value={form.minimumStock} onChange={e=>setForm(f=>({...f,minimumStock:+e.target.value}))}/></div>
                    </div>
                    <div><label style={lS}>{t('parts.unitCost')}</label><input type="number" style={iS} value={form.unitCost} onChange={e=>setForm(f=>({...f,unitCost:+e.target.value}))}/></div>
                    <div><label style={lS}>{t('parts.machine')}</label>
                        <select style={iS} value={form.machineId||''} onChange={e=>setForm(f=>({...f,machineId:e.target.value||null}))}>
                            <option value="">{t('parts.generic')}</option>
                            {machines.map(m=><option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                        </select>
                    </div>
                </div>
            </SlideOver>

            {/* Reorder Modal */}
            <Modal isOpen={!!orderTarget} onClose={()=>setOrderTarget(null)} title="🛒 Réapprovisionnement" size="sm"
                footer={<><button onClick={()=>setOrderTarget(null)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button data-tour="parts-order-confirm" onClick={handleOrder} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>Valider</button></>}>
                {orderTarget&&<div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div style={{background:'#fffbeb',borderRadius:12,padding:14,border:'1px solid #fde68a'}}><div style={{fontWeight:700,fontSize:15}}>{orderTarget.name}</div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{orderTarget.reference} · Stock: {orderTarget.quantity} · Seuil: {orderTarget.minimumStock}</div></div>
                    <div><label style={lS}>{t('parts.quantity')}</label><input type="number" style={iS} value={orderQty} onChange={e=>setOrderQty(+e.target.value)} min={1}/></div>
                </div>}
            </Modal>

            {/* Delete */}
            <Modal isOpen={!!deleteTarget} onClose={()=>setDeleteTarget(null)} title={t('common.delete.title')} size="sm"
                footer={<><button onClick={()=>setDeleteTarget(null)} style={{padding:'10px 20px',borderRadius:10,background:'var(--surface-hover)',border:'1px solid var(--border)',fontSize:14,cursor:'pointer',color:'var(--text-primary)'}}>{t('action.cancel')}</button>
                <button data-tour="parts-delete-confirm" onClick={handleDelete} style={{padding:'10px 20px',borderRadius:10,background:'#ef4444',color:'white',border:'none',fontSize:14,fontWeight:600,cursor:'pointer'}}>{t('action.delete')}</button></>}>
                <div style={{textAlign:'center'}}><AlertTriangle size={28} color="#ef4444" style={{margin:'0 auto 12px'}}/><p>{t('action.delete')} <b>{deleteTarget?.name}</b> ?</p></div>
            </Modal>
        </>
    );
}

// ── Force reorder button ────────────────────────────────────
// Hits /api/reorder/scan directly and shows exactly what happened for
// each low-stock part — no more silent auto-reorder that "doesn't work
// because the part was already covered by an old open PR".
function ForceReorderButton() {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/reorder/scan', { method: 'POST' });
            const data = await res.json();
            if (!data.ok) { showToast(data.error || 'Erreur', 'error'); return; }
            if (data.created > 0) {
                showToast(`✅ ${data.created} demande(s) d'achat créée(s) — voyez Achats → Demandes d'achat.`);
            } else if (data.low === 0) {
                showToast('✅ Aucune pièce sous seuil. Rien à commander.');
            } else {
                showToast(`ℹ️ ${data.low} pièce(s) sous seuil déjà couverte(s) par une demande existante ouverte.`);
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur réseau', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            onClick={run}
            disabled={busy}
            title="Balayer le stock et créer immédiatement les demandes d'achat pour tout ce qui est sous seuil (sans doublon)."
            style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12,
                background: busy ? '#a78bfa' : 'linear-gradient(135deg,#8b5cf6,#6d28d9)',
                color: 'white', border: 'none', fontWeight: 600, fontSize: 13,
                cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
        >
            <RefreshCw size={15} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />
            {busy ? 'Analyse…' : 'Réapprovisionner maintenant'}
        </button>
    );
}
