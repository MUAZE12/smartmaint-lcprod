'use client';

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type {
    Machine, Technician, Intervention, SparePart,
    Supplier, PurchaseOrder, ProductionMetric,
    PurchaseRequisition, PurchaseRequisitionLine,
    QuoteRequest, Quote, PurchaseOrderLine, GoodsReceipt,
    QuoteRequestLine, QuoteLine, Consumable, KpiFormula, MaintenancePlan,
    HaccpRecord, ChecklistTemplate, ChecklistRun, InterventionPart,
    AuditEntry, CalibrationRecord, Tool, KnowledgeArticle,
    ShiftNote, ProductionBatch, LotoRecord,
    ProcedureRun, TechCertification, ReliefRequest, ConsumableRequest,
    Directive, DirectiveAck,
    MaintenanceProject,
} from '@/lib/types';
import * as MockData from '@/lib/data';
import { useAuth } from './AuthContext';
import { setAuditUser } from '@/lib/audit';

/**
 * Mutate the in-place arrays exported by `lib/data.ts` so that pure helpers
 * in `lib/calculations.ts` (which still read those module-level arrays) see
 * the same data as React components reading from DataContext.
 *
 * Arrays are exported as `const` but their *contents* are mutable; replacing
 * length + spreading new items keeps the same reference, so any module that
 * already imported the array sees the updated contents on next access.
 */
function syncStaticArrays(snapshot: {
    machines: Machine[]; technicians: Technician[]; interventions: Intervention[];
    spareParts: SparePart[]; suppliers: Supplier[]; purchaseOrders: PurchaseOrder[];
    productionMetrics: ProductionMetric[];
}) {
    MockData.machines.length = 0; MockData.machines.push(...snapshot.machines);
    MockData.technicians.length = 0; MockData.technicians.push(...snapshot.technicians);
    MockData.interventions.length = 0; MockData.interventions.push(...snapshot.interventions);
    MockData.spareParts.length = 0; MockData.spareParts.push(...snapshot.spareParts);
    MockData.suppliers.length = 0; MockData.suppliers.push(...snapshot.suppliers);
    MockData.purchaseOrders.length = 0; MockData.purchaseOrders.push(...snapshot.purchaseOrders);
    MockData.productionMetrics.length = 0; MockData.productionMetrics.push(...snapshot.productionMetrics);
}

// ============================================
// Personnel entity (composite operators view)
// ============================================
export interface Personnel {
    id: string;
    nom: string;
    role: 'technicien' | 'operateur';
    specialite: string;
    telephone: string;
    email: string;
    statut: 'actif' | 'inactif';
    imageUrl?: string;
    createdAt?: string;
}

// ============================================
// Context shape
// ============================================
interface DataContextType {
    machines: Machine[];
    technicians: Technician[];
    interventions: Intervention[];
    spareParts: SparePart[];
    suppliers: Supplier[];
    purchaseOrders: PurchaseOrder[];
    productionMetrics: ProductionMetric[];
    personnel: Personnel[];
    // ── Procurement v2 ──
    purchaseRequisitions: PurchaseRequisition[];
    purchaseRequisitionLines: PurchaseRequisitionLine[];
    quoteRequests: QuoteRequest[];
    quotes: Quote[];
    quoteRequestLines: QuoteRequestLine[];
    quoteLines: QuoteLine[];
    purchaseOrderLines: PurchaseOrderLine[];
    goodsReceipts: GoodsReceipt[];
    consumables: Consumable[];
    kpiFormulas: KpiFormula[];
    maintenancePlans: MaintenancePlan[];
    haccpRecords: HaccpRecord[];
    checklistTemplates: ChecklistTemplate[];
    checklistRuns: ChecklistRun[];
    interventionParts: InterventionPart[];
    calibrationRecords: CalibrationRecord[];
    auditLog: AuditEntry[];
    tools: Tool[];
    knowledgeArticles: KnowledgeArticle[];
    shiftNotes: ShiftNote[];
    productionBatches: ProductionBatch[];
    lotoRecords: LotoRecord[];
    procedureRuns: ProcedureRun[];
    techCertifications: TechCertification[];
    reliefRequests: ReliefRequest[];
    consumableRequests: ConsumableRequest[];
    directives: Directive[];
    directiveAcks: DirectiveAck[];
    maintenanceProjects: MaintenanceProject[];

    loading: boolean;
    error: string | null;

    /** Force a fresh re-fetch of everything (e.g. after a bulk import). */
    refresh: () => Promise<void>;

    // Direct setters — useful for optimistic updates
    setMachines: React.Dispatch<React.SetStateAction<Machine[]>>;
    setTechnicians: React.Dispatch<React.SetStateAction<Technician[]>>;
    setInterventions: React.Dispatch<React.SetStateAction<Intervention[]>>;
    setSpareParts: React.Dispatch<React.SetStateAction<SparePart[]>>;
    setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
    setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    setProductionMetrics: React.Dispatch<React.SetStateAction<ProductionMetric[]>>;
    setPersonnel: React.Dispatch<React.SetStateAction<Personnel[]>>;
}

const noop = () => { };
const DataContext = createContext<DataContextType>({
    machines: [], technicians: [], interventions: [], spareParts: [],
    suppliers: [], purchaseOrders: [], productionMetrics: [], personnel: [],
    purchaseRequisitions: [], purchaseRequisitionLines: [], quoteRequests: [],
    quotes: [], quoteRequestLines: [], quoteLines: [],
    purchaseOrderLines: [], goodsReceipts: [], consumables: [], kpiFormulas: [],
    maintenancePlans: [], haccpRecords: [], checklistTemplates: [], checklistRuns: [], interventionParts: [],
    calibrationRecords: [], auditLog: [], tools: [], knowledgeArticles: [],
    shiftNotes: [], productionBatches: [], lotoRecords: [],
    procedureRuns: [], techCertifications: [], reliefRequests: [],
    consumableRequests: [], directives: [], directiveAcks: [],
    maintenanceProjects: [],
    loading: false, error: null,
    refresh: async () => { },
    setMachines: noop, setTechnicians: noop, setInterventions: noop, setSpareParts: noop,
    setSuppliers: noop, setPurchaseOrders: noop, setProductionMetrics: noop, setPersonnel: noop,
});

export function useData() {
    return useContext(DataContext);
}

// ============================================
// Helper: build a postgres_changes handler that
// applies INSERT / UPDATE / DELETE to a list
// ============================================
function applyChange<T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    newRow: T | undefined,
    oldRow: Partial<T> | undefined,
) {
    setter((prev) => {
        switch (eventType) {
            case 'INSERT':
                if (!newRow || prev.some((r) => r.id === newRow.id)) return prev;
                return [...prev, newRow];
            case 'UPDATE':
                if (!newRow) return prev;
                return prev.map((r) => (r.id === newRow.id ? newRow : r));
            case 'DELETE':
                if (!oldRow?.id) return prev;
                return prev.filter((r) => r.id !== oldRow.id);
            default:
                return prev;
        }
    });
}

// ============================================
// Provider
// ============================================
export function DataProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, user } = useAuth();

    // Keep the audit layer (non-React db.ts) attributed to the signed-in user.
    useEffect(() => { setAuditUser(user?.name ?? null); }, [user]);

    const [machines, setMachines] = useState<Machine[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [interventions, setInterventions] = useState<Intervention[]>([]);
    const [spareParts, setSpareParts] = useState<SparePart[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [productionMetrics, setProductionMetrics] = useState<ProductionMetric[]>([]);
    const [personnel, setPersonnel] = useState<Personnel[]>([]);
    // ── Procurement v2 ──
    const [purchaseRequisitions, setPurchaseRequisitions] = useState<PurchaseRequisition[]>([]);
    const [purchaseRequisitionLines, setPurchaseRequisitionLines] = useState<PurchaseRequisitionLine[]>([]);
    const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [quoteRequestLines, setQuoteRequestLines] = useState<QuoteRequestLine[]>([]);
    const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
    const [purchaseOrderLines, setPurchaseOrderLines] = useState<PurchaseOrderLine[]>([]);
    const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
    const [consumables, setConsumables] = useState<Consumable[]>([]);
    const [kpiFormulas, setKpiFormulas] = useState<KpiFormula[]>([]);
    const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([]);
    const [haccpRecords, setHaccpRecords] = useState<HaccpRecord[]>([]);
    const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
    const [checklistRuns, setChecklistRuns] = useState<ChecklistRun[]>([]);
    const [interventionParts, setInterventionParts] = useState<InterventionPart[]>([]);
    const [calibrationRecords, setCalibrationRecords] = useState<CalibrationRecord[]>([]);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
    const [tools, setTools] = useState<Tool[]>([]);
    const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
    const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
    const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
    const [lotoRecords, setLotoRecords] = useState<LotoRecord[]>([]);
    const [procedureRuns, setProcedureRuns] = useState<ProcedureRun[]>([]);
    const [techCertifications, setTechCertifications] = useState<TechCertification[]>([]);
    const [reliefRequests, setReliefRequests] = useState<ReliefRequest[]>([]);
    const [consumableRequests, setConsumableRequests] = useState<ConsumableRequest[]>([]);
    const [directives, setDirectives] = useState<Directive[]>([]);
    const [directiveAcks, setDirectiveAcks] = useState<DirectiveAck[]>([]);
    const [maintenanceProjects, setMaintenanceProjects] = useState<MaintenanceProject[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Bulk fetch ──
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        const [
            mRes, tRes, iRes, spRes, suRes, poRes, pmRes, peRes,
            prRes, prlRes, rfqRes, qRes, polRes, grRes, rflRes, qlRes,
            consRes, kpiRes, mpRes, hacRes, cltRes, clrRes, ipRes,
            calRes, audRes, toolRes, kbRes, snRes, pbRes, lotoRes,
            procRes, certRes, relRes, conRes, dirRes, ackRes, prjRes,
        ] = await Promise.all([
            supabase.from('machines').select('*').order('createdAt', { ascending: true }),
            supabase.from('technicians').select('*').order('createdAt', { ascending: true }),
            supabase.from('interventions').select('*').order('createdAt', { ascending: false }),
            supabase.from('spare_parts').select('*').order('createdAt', { ascending: true }),
            supabase.from('suppliers').select('*').order('createdAt', { ascending: true }),
            supabase.from('purchase_orders').select('*').order('createdAt', { ascending: false }),
            supabase.from('production_metrics').select('*').order('date', { ascending: false }),
            supabase.from('personnel').select('*').order('createdAt', { ascending: true }),
            supabase.from('purchase_requisitions').select('*').order('createdAt', { ascending: false }),
            supabase.from('purchase_requisition_lines').select('*'),
            supabase.from('quote_requests').select('*').order('createdAt', { ascending: false }),
            supabase.from('quotes').select('*'),
            supabase.from('purchase_order_lines').select('*'),
            supabase.from('goods_receipts').select('*').order('createdAt', { ascending: false }),
            supabase.from('quote_request_lines').select('*'),
            supabase.from('quote_lines').select('*'),
            supabase.from('consumables').select('*').order('createdAt', { ascending: true }),
            supabase.from('kpi_formulas').select('*').order('createdAt', { ascending: false }),
            supabase.from('maintenance_plans').select('*').order('nextDueDate', { ascending: true }),
            supabase.from('haccp_records').select('*').order('checkDate', { ascending: false }),
            supabase.from('checklist_templates').select('*').order('createdAt', { ascending: true }),
            supabase.from('checklist_runs').select('*').order('completedAt', { ascending: false }),
            supabase.from('intervention_parts').select('*'),
            supabase.from('calibration_records').select('*').order('nextDueDate', { ascending: true }),
            supabase.from('audit_log').select('*').order('createdAt', { ascending: false }).limit(500),
            supabase.from('tools').select('*').order('name', { ascending: true }),
            supabase.from('knowledge_articles').select('*').order('title', { ascending: true }),
            supabase.from('shift_notes').select('*').order('createdAt', { ascending: false }),
            supabase.from('production_batches').select('*').order('startedAt', { ascending: false }),
            supabase.from('loto_records').select('*').order('startedAt', { ascending: false }),
            supabase.from('procedure_runs').select('*').order('startedAt', { ascending: false }),
            supabase.from('tech_certifications').select('*').order('expiresAt', { ascending: true }),
            supabase.from('relief_requests').select('*').order('createdAt', { ascending: false }),
            supabase.from('consumable_requests').select('*').order('createdAt', { ascending: false }),
            supabase.from('directives').select('*').order('publishedAt', { ascending: false }),
            supabase.from('directive_acks').select('*').order('ackAt', { ascending: false }),
            supabase.from('maintenance_projects').select('*').order('createdAt', { ascending: false }),
        ]);

        const firstError =
            mRes.error || tRes.error || iRes.error || spRes.error ||
            suRes.error || poRes.error || pmRes.error || peRes.error ||
            prRes.error || prlRes.error || rfqRes.error || qRes.error ||
            polRes.error || grRes.error || rflRes.error || qlRes.error ||
            consRes.error || kpiRes.error || mpRes.error ||
            hacRes.error || cltRes.error || clrRes.error || ipRes.error ||
            calRes.error || audRes.error || toolRes.error || kbRes.error ||
            snRes.error || pbRes.error || lotoRes.error ||
            procRes.error || certRes.error || relRes.error || conRes.error ||
            dirRes.error || ackRes.error || prjRes.error;
        if (firstError) setError(firstError.message);

        setMachines((mRes.data ?? []) as Machine[]);
        setTechnicians((tRes.data ?? []) as Technician[]);
        setInterventions((iRes.data ?? []) as Intervention[]);
        setSpareParts((spRes.data ?? []) as SparePart[]);
        setSuppliers((suRes.data ?? []) as Supplier[]);
        setPurchaseOrders((poRes.data ?? []) as PurchaseOrder[]);
        setProductionMetrics((pmRes.data ?? []) as ProductionMetric[]);
        setPersonnel((peRes.data ?? []) as Personnel[]);
        setPurchaseRequisitions((prRes.data ?? []) as PurchaseRequisition[]);
        setPurchaseRequisitionLines((prlRes.data ?? []) as PurchaseRequisitionLine[]);
        setQuoteRequests((rfqRes.data ?? []) as QuoteRequest[]);
        setQuotes((qRes.data ?? []) as Quote[]);
        setPurchaseOrderLines((polRes.data ?? []) as PurchaseOrderLine[]);
        setGoodsReceipts((grRes.data ?? []) as GoodsReceipt[]);
        setQuoteRequestLines((rflRes.data ?? []) as QuoteRequestLine[]);
        setQuoteLines((qlRes.data ?? []) as QuoteLine[]);
        setConsumables((consRes.data ?? []) as Consumable[]);
        setKpiFormulas((kpiRes.data ?? []) as KpiFormula[]);
        setMaintenancePlans((mpRes.data ?? []) as MaintenancePlan[]);
        setHaccpRecords((hacRes.data ?? []) as HaccpRecord[]);
        setChecklistTemplates((cltRes.data ?? []) as ChecklistTemplate[]);
        setChecklistRuns((clrRes.data ?? []) as ChecklistRun[]);
        setInterventionParts((ipRes.data ?? []) as InterventionPart[]);
        setCalibrationRecords((calRes.data ?? []) as CalibrationRecord[]);
        setAuditLog((audRes.data ?? []) as AuditEntry[]);
        setTools((toolRes.data ?? []) as Tool[]);
        setKnowledgeArticles((kbRes.data ?? []) as KnowledgeArticle[]);
        setShiftNotes((snRes.data ?? []) as ShiftNote[]);
        setProductionBatches((pbRes.data ?? []) as ProductionBatch[]);
        setLotoRecords((lotoRes.data ?? []) as LotoRecord[]);
        setProcedureRuns((procRes.data ?? []) as ProcedureRun[]);
        setTechCertifications((certRes.data ?? []) as TechCertification[]);
        setReliefRequests((relRes.data ?? []) as ReliefRequest[]);
        setConsumableRequests((conRes.data ?? []) as ConsumableRequest[]);
        setDirectives((dirRes.data ?? []) as Directive[]);
        setDirectiveAcks((ackRes.data ?? []) as DirectiveAck[]);
        setMaintenanceProjects((prjRes.data ?? []) as MaintenanceProject[]);

        setLoading(false);
    }, []);

    // ── Keep lib/data.ts arrays in sync so lib/calculations.ts uses live data.
    //    Fires on initial fetch AND every realtime INSERT/UPDATE/DELETE.
    useEffect(() => {
        syncStaticArrays({
            machines, technicians, interventions, spareParts,
            suppliers, purchaseOrders, productionMetrics,
        });
    }, [machines, technicians, interventions, spareParts, suppliers, purchaseOrders, productionMetrics]);

    // ── Bootstrap + realtime subscriptions ──
    useEffect(() => {
        if (!isAuthenticated) {
            // Reset everything on logout
            setMachines([]); setTechnicians([]); setInterventions([]);
            setSpareParts([]); setSuppliers([]); setPurchaseOrders([]);
            setProductionMetrics([]); setPersonnel([]);
            setPurchaseRequisitions([]); setPurchaseRequisitionLines([]);
            setQuoteRequests([]); setQuotes([]); setPurchaseOrderLines([]);
            setGoodsReceipts([]); setQuoteRequestLines([]); setQuoteLines([]);
            setConsumables([]); setKpiFormulas([]); setMaintenancePlans([]);
            setHaccpRecords([]); setChecklistTemplates([]); setChecklistRuns([]);
            setInterventionParts([]); setCalibrationRecords([]); setAuditLog([]);
            setTools([]); setKnowledgeArticles([]);
            setShiftNotes([]); setProductionBatches([]); setLotoRecords([]);
            setProcedureRuns([]); setTechCertifications([]); setReliefRequests([]);
            setConsumableRequests([]); setDirectives([]); setDirectiveAcks([]);
            setMaintenanceProjects([]);
            return;
        }

        refresh();

        // ── One channel, every table subscribed. ──
        // Realtime relays INSERT/UPDATE/DELETE from any client/admin/SQL
        // editor straight into our local arrays. This is the "multiplayer"
        // layer the user asked for in the spec.
        const channel = supabase
            .channel('smartmaint-all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' },
                (p) => applyChange<Machine>(setMachines, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Machine, p.old as Partial<Machine>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'technicians' },
                (p) => applyChange<Technician>(setTechnicians, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Technician, p.old as Partial<Technician>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' },
                (p) => applyChange<Intervention>(setInterventions, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Intervention, p.old as Partial<Intervention>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'spare_parts' },
                (p) => applyChange<SparePart>(setSpareParts, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as SparePart, p.old as Partial<SparePart>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' },
                (p) => applyChange<Supplier>(setSuppliers, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Supplier, p.old as Partial<Supplier>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' },
                (p) => applyChange<PurchaseOrder>(setPurchaseOrders, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as PurchaseOrder, p.old as Partial<PurchaseOrder>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'production_metrics' },
                (p) => applyChange<ProductionMetric>(setProductionMetrics, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ProductionMetric, p.old as Partial<ProductionMetric>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel' },
                (p) => applyChange<Personnel>(setPersonnel, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Personnel, p.old as Partial<Personnel>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requisitions' },
                (p) => applyChange<PurchaseRequisition>(setPurchaseRequisitions, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as PurchaseRequisition, p.old as Partial<PurchaseRequisition>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requisition_lines' },
                (p) => applyChange<PurchaseRequisitionLine>(setPurchaseRequisitionLines, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as PurchaseRequisitionLine, p.old as Partial<PurchaseRequisitionLine>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_requests' },
                (p) => applyChange<QuoteRequest>(setQuoteRequests, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as QuoteRequest, p.old as Partial<QuoteRequest>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' },
                (p) => applyChange<Quote>(setQuotes, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Quote, p.old as Partial<Quote>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_lines' },
                (p) => applyChange<PurchaseOrderLine>(setPurchaseOrderLines, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as PurchaseOrderLine, p.old as Partial<PurchaseOrderLine>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_receipts' },
                (p) => applyChange<GoodsReceipt>(setGoodsReceipts, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as GoodsReceipt, p.old as Partial<GoodsReceipt>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_request_lines' },
                (p) => applyChange<QuoteRequestLine>(setQuoteRequestLines, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as QuoteRequestLine, p.old as Partial<QuoteRequestLine>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_lines' },
                (p) => applyChange<QuoteLine>(setQuoteLines, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as QuoteLine, p.old as Partial<QuoteLine>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'consumables' },
                (p) => applyChange<Consumable>(setConsumables, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Consumable, p.old as Partial<Consumable>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_formulas' },
                (p) => applyChange<KpiFormula>(setKpiFormulas, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as KpiFormula, p.old as Partial<KpiFormula>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_plans' },
                (p) => applyChange<MaintenancePlan>(setMaintenancePlans, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as MaintenancePlan, p.old as Partial<MaintenancePlan>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'haccp_records' },
                (p) => applyChange<HaccpRecord>(setHaccpRecords, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as HaccpRecord, p.old as Partial<HaccpRecord>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_templates' },
                (p) => applyChange<ChecklistTemplate>(setChecklistTemplates, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ChecklistTemplate, p.old as Partial<ChecklistTemplate>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_runs' },
                (p) => applyChange<ChecklistRun>(setChecklistRuns, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ChecklistRun, p.old as Partial<ChecklistRun>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'intervention_parts' },
                (p) => applyChange<InterventionPart>(setInterventionParts, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as InterventionPart, p.old as Partial<InterventionPart>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_records' },
                (p) => applyChange<CalibrationRecord>(setCalibrationRecords, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as CalibrationRecord, p.old as Partial<CalibrationRecord>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' },
                (p) => applyChange<AuditEntry>(setAuditLog, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as AuditEntry, p.old as Partial<AuditEntry>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tools' },
                (p) => applyChange<Tool>(setTools, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Tool, p.old as Partial<Tool>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_articles' },
                (p) => applyChange<KnowledgeArticle>(setKnowledgeArticles, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as KnowledgeArticle, p.old as Partial<KnowledgeArticle>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_notes' },
                (p) => applyChange<ShiftNote>(setShiftNotes, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ShiftNote, p.old as Partial<ShiftNote>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' },
                (p) => applyChange<ProductionBatch>(setProductionBatches, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ProductionBatch, p.old as Partial<ProductionBatch>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'loto_records' },
                (p) => applyChange<LotoRecord>(setLotoRecords, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as LotoRecord, p.old as Partial<LotoRecord>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'procedure_runs' },
                (p) => applyChange<ProcedureRun>(setProcedureRuns, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ProcedureRun, p.old as Partial<ProcedureRun>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tech_certifications' },
                (p) => applyChange<TechCertification>(setTechCertifications, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as TechCertification, p.old as Partial<TechCertification>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'relief_requests' },
                (p) => applyChange<ReliefRequest>(setReliefRequests, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ReliefRequest, p.old as Partial<ReliefRequest>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'consumable_requests' },
                (p) => applyChange<ConsumableRequest>(setConsumableRequests, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as ConsumableRequest, p.old as Partial<ConsumableRequest>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'directives' },
                (p) => applyChange<Directive>(setDirectives, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as Directive, p.old as Partial<Directive>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'directive_acks' },
                (p) => applyChange<DirectiveAck>(setDirectiveAcks, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as DirectiveAck, p.old as Partial<DirectiveAck>))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_projects' },
                (p) => applyChange<MaintenanceProject>(setMaintenanceProjects, p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', p.new as MaintenanceProject, p.old as Partial<MaintenanceProject>))
            .subscribe();

        // ── Offline queue bridge ──
        // When a CRUD call is enqueued because we're offline, we apply an
        // optimistic mutation to local state right away — otherwise the
        // row the user just created "disappears" as soon as the dialog
        // closes. When the queue eventually drains after wifi returns, we
        // re-refresh to reconcile with Supabase's authoritative view.
        interface OptimisticDetail {
            op: 'insert' | 'update' | 'delete';
            table: string;
            payload?: Record<string, unknown>;
            matchColumn?: string;
            matchValue?: string | number;
        }
        const tableToSetter: Record<string, React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>> = {
            machines: setMachines as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            technicians: setTechnicians as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            interventions: setInterventions as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            spare_parts: setSpareParts as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            suppliers: setSuppliers as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            purchase_orders: setPurchaseOrders as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            production_metrics: setProductionMetrics as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            personnel: setPersonnel as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
            maintenance_projects: setMaintenanceProjects as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
        };
        const onOptimistic = (e: Event) => {
            const detail = (e as CustomEvent<OptimisticDetail>).detail;
            if (!detail) return;
            const setter = tableToSetter[detail.table];
            if (!setter) return;
            if (detail.op === 'insert' && detail.payload) {
                const row = detail.payload;
                setter(prev => (Array.isArray(prev) ? [row as Record<string, unknown>, ...prev] : prev) as never);
            } else if (detail.op === 'update' && detail.payload && detail.matchColumn && detail.matchValue !== undefined) {
                setter(prev => Array.isArray(prev)
                    ? prev.map(r => r[detail.matchColumn!] === detail.matchValue ? { ...r, ...detail.payload } : r) as never
                    : prev);
            } else if (detail.op === 'delete' && detail.matchColumn && detail.matchValue !== undefined) {
                setter(prev => Array.isArray(prev)
                    ? prev.filter(r => r[detail.matchColumn!] !== detail.matchValue) as never
                    : prev);
            }
        };
        const onDrained = () => {
            // Small delay lets Supabase realtime broadcast the inserts to
            // every other tab first, and gives our own request a moment
            // to see the fresh rows. Without this, refresh sometimes ran
            // in the same tick as the insert and saw stale data.
            setTimeout(() => { refresh(); }, 400);
        };
        window.addEventListener('smartmaint-optimistic-mutation', onOptimistic);
        window.addEventListener('smartmaint-queue-drained', onDrained);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('smartmaint-optimistic-mutation', onOptimistic);
            window.removeEventListener('smartmaint-queue-drained', onDrained);
        };
    }, [isAuthenticated, refresh]);

    return (
        <DataContext.Provider
            value={{
                machines, technicians, interventions, spareParts,
                suppliers, purchaseOrders, productionMetrics, personnel,
                purchaseRequisitions, purchaseRequisitionLines, quoteRequests,
                quotes, quoteRequestLines, quoteLines, purchaseOrderLines, goodsReceipts,
                consumables, kpiFormulas, maintenancePlans,
                haccpRecords, checklistTemplates, checklistRuns, interventionParts,
                calibrationRecords, auditLog, tools, knowledgeArticles,
                shiftNotes, productionBatches, lotoRecords,
                procedureRuns, techCertifications, reliefRequests,
                consumableRequests, directives, directiveAcks,
                maintenanceProjects,
                loading, error, refresh,
                setMachines, setTechnicians, setInterventions, setSpareParts,
                setSuppliers, setPurchaseOrders, setProductionMetrics, setPersonnel,
            }}
        >
            {children}
        </DataContext.Provider>
    );
}
