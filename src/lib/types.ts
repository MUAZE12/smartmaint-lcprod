// ============================================
// SmartMaint — L.C PROD — Types TypeScript
// ============================================

export type MachineStatus = 'opérationnelle' | 'en panne' | 'en maintenance' | 'arrêtée';
// Process stages of the L.C PROD edible-oil line
/** Equipment / process category — used both as a process phase
 *  (Réception, Production…) AND as the equipment type (Pompe, Filtration,
 *  Mélangeur…). Kept as a plain string so the catalog can carry whatever
 *  the operations team has in their process sheet. */
export type MachineType = string;
export type CriticalityLevel = 'faible' | 'moyen' | 'élevé';
export type InterventionType = 'corrective' | 'préventive' | 'conditionnelle' | 'améliorative';
export type InterventionStatus = 'planifiée' | 'en cours' | 'terminée' | 'clôturée' | 'annulée';
export type TechnicianAvailability = 'disponible' | 'en intervention' | 'indisponible';
export type POStatus = 'brouillon' | 'envoyée' | 'partielle' | 'réceptionnée';

export interface Machine {
    id: string;
    code: string;
    name: string;
    type: MachineType;
    /** Zone industrielle (Réception MP, Production, Conditionnement, Utilités…) */
    workshop: string;
    location: string;
    installationDate: string;
    status: MachineStatus;
    criticalityScore: number;
    hourlyDowntimeCost: number;
    importanceLevel: number; // 1-10
    createdAt: string;
    // ── Process metadata (matches the agroalimentaire flow sheet) ──
    /** Ligne de production (Ligne 1, Réception, Préparation, Fin de ligne, Général…). */
    line?: string;
    /** Fonction métier de la machine (« Transfert matière première », « Mélange produit », « Pose étiquettes »…). */
    function?: string;
    // New fields
    imageUrl?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    // Technical data
    voltage?: number;
    power?: number;
    amperage?: number;
    airPressure?: number;
    waterConsumption?: number;
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
    manualFileName?: string;
    mainCounterUnit?: string; // 'heures' | 'km_fil' | 'cycles'
}

export interface Technician {
    id: string;
    fullName: string;
    specialty: string;
    phone: string;
    email: string;
    availability: TechnicianAvailability;
    /** base64 dataURL stored in the technicians table (added by
     *  supabase/profile-imageurl.sql). Optional for backwards compat. */
    imageUrl?: string;
    createdAt: string;
}

/** A photo or short video attached to an intervention by the technician on site. */
export interface InterventionAttachment {
    type: 'photo' | 'video';
    /** base64 dataURL (image/jpeg or video/webm). */
    dataUrl: string;
    capturedAt: string;
    note?: string;
    /** When set, marks the attachment as captured at intervention start ("before")
     *  or at close-out ("after"). Older attachments without this field are
     *  treated as "after" for backwards compatibility. */
    phase?: 'before' | 'after';
}

export interface Intervention {
    id: string;
    machineId: string;
    /** null when a breakdown is reported but not yet assigned to a technician. */
    technicianId: string | null;
    interventionType: InterventionType;
    description: string;
    probableCause: string;
    actionDone: string;
    startDate: string;
    endDate: string | null;
    downtimeHours: number;
    laborCost: number;
    partsCost: number;
    downtimeCost: number;
    totalCost: number;
    status: InterventionStatus;
    attachments?: InterventionAttachment[];
    createdAt: string;
}

export interface SparePart {
    id: string;
    name: string;
    reference: string;
    quantity: number;
    minimumStock: number;
    machineId: string | null;
    unitCost: number;
    createdAt: string;
    imageUrl?: string;
}

export interface Supplier {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    avgDeliveryDays: number;
    reliability: number; // 0-100
    createdAt: string;
}

export interface PurchaseOrder {
    id: string;
    poNumber: string;
    supplierId: string;
    /** Legacy single-line fields — kept for the 4 seeded POs, optional in v2. */
    sparePartId?: string;
    quantity?: number;
    unitCost?: number;
    totalAmount: number;
    status: POStatus;
    orderDate: string;
    expectedDelivery: string;
    receivedDate?: string;
    receivedQty?: number;
    createdAt: string;
    // ── Procurement v2 header fields ──
    requisitionId?: string | null;
    rfqId?: string | null;
    approvalStatus?: ApprovalStatus;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectionReason?: string | null;
    machineId?: string | null;
    notes?: string | null;
}

// ============================================
// Procurement v2 — SAP-inspired
// ============================================
export type RequisitionStatus = 'brouillon' | 'soumise' | 'approuvée' | 'convertie' | 'rejetée';
export type RFQStatus = 'ouverte' | 'clôturée';
export type QuoteStatus = 'en attente' | 'reçu' | 'refusé' | 'retenu';
export type ApprovalStatus = 'non requis' | 'en attente' | 'approuvé' | 'rejeté';
export type ReceiptCondition = 'conforme' | 'endommagé' | 'manquant';

export interface PurchaseRequisition {
    id: string;
    reqNumber: string;
    status: RequisitionStatus;
    machineId: string | null;
    interventionId: string | null;
    requestedBy: string;
    notes: string;
    createdAt: string;
}

export interface PurchaseRequisitionLine {
    id: string;
    requisitionId: string;
    sparePartId: string | null;
    quantity: number;
    estimatedUnitCost: number;
    createdAt: string;
}

export interface QuoteRequest {
    id: string;
    rfqNumber: string;
    requisitionId: string | null;
    status: RFQStatus;
    machineId: string | null;
    notes: string;
    createdAt: string;
}

export interface Quote {
    id: string;
    rfqId: string;
    supplierId: string | null;
    status: QuoteStatus;
    totalAmount: number;
    deliveryDays: number | null;
    notes: string;
    createdAt: string;
}

/** A line of an itemized RFQ — the part + quantity being sourced. */
export interface QuoteRequestLine {
    id: string;
    rfqId: string;
    sparePartId: string | null;
    quantity: number;
    createdAt: string;
}

/** One supplier's unit price for one RFQ line. */
export interface QuoteLine {
    id: string;
    quoteId: string;
    rfqLineId: string;
    sparePartId: string | null;
    unitPrice: number;
    createdAt: string;
}

/** A tracked machine consumable (blades, lubricant, bobbin thread…). */
export interface Consumable {
    id: string;
    name: string;
    atelier: string;
    totalHours: number;
    usedHours: number;
    icon: string;
    createdAt: string;
}

/** A saved custom KPI formula (the token list is JSON-encoded). */
export interface KpiFormula {
    id: string;
    name: string;
    formula: string;
    createdAt: string;
}

/** A recurring preventive-maintenance plan for a machine. */
export interface MaintenancePlan {
    id: string;
    machineId: string;
    title: string;
    interventionType: InterventionType;
    frequencyDays: number;
    lastDoneDate: string | null;
    nextDueDate: string | null;
    active: boolean;
    notes: string;
    createdAt: string;
}

// ============================================
// HACCP — food-safety compliance
// ============================================
export type HaccpCheckType = 'sanitation' | 'calibration' | 'lubrification' | 'inspection';
export type HaccpResult = 'conforme' | 'non conforme' | 'à corriger';

/** A logged food-safety check on a machine (sanitation, calibration…). */
export interface HaccpRecord {
    id: string;
    machineId: string;
    checkType: HaccpCheckType;
    result: HaccpResult;
    checkedBy: string;
    checkDate: string;
    nextDueDate: string | null;
    notes: string;
    createdAt: string;
}

// ============================================
// Work-order check-lists
// ============================================
/** A reusable check-list template (the `items` array is JSON-encoded step labels). */
export interface ChecklistTemplate {
    id: string;
    machineId: string | null;
    title: string;
    items: string[];
    createdAt: string;
}

/** One completed step of a check-list run. */
export interface ChecklistRunResult {
    label: string;
    done: boolean;
    note: string;
}

/** A completed work-order check-list (the `results` array is JSON-encoded). */
export interface ChecklistRun {
    id: string;
    templateId: string | null;
    machineId: string;
    title: string;
    results: ChecklistRunResult[];
    completedBy: string;
    completedAt: string;
    createdAt: string;
}

export interface PurchaseOrderLine {
    id: string;
    poId: string;
    sparePartId: string | null;
    quantity: number;
    unitCost: number;
    receivedQty: number;
    createdAt: string;
}

/** A spare part consumed on a work order (intervention). */
export interface InterventionPart {
    id: string;
    interventionId: string;
    sparePartId: string | null;
    partName: string;
    quantity: number;
    unitCost: number;
    createdAt: string;
}

export interface GoodsReceiptLine {
    poLineId: string;
    sparePartId: string;
    receivedQty: number;
    condition: ReceiptCondition;
}

export interface GoodsReceipt {
    id: string;
    grnNumber: string;
    poId: string;
    receivedBy: string;
    receivedDate: string;
    notes: string;
    lines: GoodsReceiptLine[];
    createdAt: string;
}

export interface ProductionMetric {
    id: string;
    machineId: string;
    date: string;
    plannedTime: number;       // heures planifiées
    downtime: number;          // heures d'arrêt
    producedQuantity: number;
    rejectedQuantity: number;
    theoreticalCycleTime: number; // minutes
    realCycleTime: number;        // minutes
    createdAt: string;
}

// ============================================
// Types dérivés pour les KPI
// ============================================

export interface MachineKPI {
    machineId: string;
    machineName: string;
    machineCode: string;
    mtbf: number;
    mttr: number;
    availability: number;
    totalCost: number;
    breakdownCount: number;
    totalDowntime: number;
    criticalityScore: number;
    criticalityLevel: CriticalityLevel;
}

export interface GlobalKPI {
    totalMachines: number;
    operationalMachines: number;
    brokenMachines: number;
    inMaintenanceMachines: number;
    stoppedMachines: number;
    totalInterventions: number;
    ongoingInterventions: number;
    completedInterventions: number;
    avgMTBF: number;
    avgMTTR: number;
    avgAvailability: number;
    totalMaintenanceCost: number;
    criticalMachines: number;
    avgTRS: number;
}

export interface TRSData {
    machineId: string;
    machineName: string;
    availability: number;
    performance: number;
    quality: number;
    trs: number;
}

export interface Recommendation {
    machineId: string;
    machineCode: string;
    machineName: string;
    level: 'info' | 'warning' | 'critical';
    message: string;
    category: string;
    /** Why the engine produced this reco — actual metric value vs. threshold,
     *  so the user can audit the suggestion instead of trusting it blindly. */
    reasoning?: string;
}

// ============================================
// Shift handover note (carnet de quart)
// ============================================
export type ShiftNotePriority = 'info' | 'warning' | 'critical';

/** A short message a technician leaves for the next shift. */
export interface ShiftNote {
    id: string;
    content: string;
    priority: ShiftNotePriority;
    machineId: string | null;
    createdBy: string;
    createdAt: string;
    resolvedBy: string | null;
    resolvedAt: string | null;
}

// ============================================
// Production batch (lot traceability — HACCP)
// ============================================
/** A production run of a specific product on a machine. */
/** A quality-control photo attached to a production batch (O6). */
export interface BatchQualityPhoto {
    /** base64 dataURL (image/jpeg). */
    dataUrl: string;
    capturedAt: string;
    /** Optional sample label ("bouteille T+30min", "étiquette", "bouchon")… */
    label?: string;
}

export interface ProductionBatch {
    id: string;
    batchNumber: string;
    productName: string;
    machineId: string | null;
    operatorName: string;
    startedAt: string;
    endedAt: string | null;
    plannedQty: number;
    actualQty: number;
    notes: string;
    /** Sample photos captured during the run — HACCP visual proof (O6). */
    qualityPhotos?: BatchQualityPhoto[];
    createdAt: string;
}

// ============================================
// LOTO (Lockout / Tagout) record
// ============================================
/** A machine that is currently locked out by a technician for safety. */
export interface LotoRecord {
    id: string;
    machineId: string;
    technicianName: string;
    reason: string;
    padlockId: string;
    startedAt: string;
    endedAt: string | null;
    notes: string;
    createdAt: string;
}

// ============================================
// Audit trail
// ============================================
/** One recorded change — appended on every create / update / delete. */
export interface AuditEntry {
    id: string;
    action: string;        // 'création' | 'modification' | 'suppression'
    entityType: string;    // 'machine' | 'intervention' | 'pièce' ...
    entityId: string;
    summary: string;
    userName: string;
    createdAt: string;
}

// ============================================
// Knowledge base (fiches de procédure / dépannage)
// ============================================
export type KnowledgeCategory = 'procédure' | 'dépannage' | 'sécurité' | 'étalonnage';

/** A short procedural article — read-only reference for technicians. */
export interface KnowledgeArticle {
    id: string;
    title: string;
    content: string;
    machineType: MachineType | null;
    category: KnowledgeCategory;
    tags: string;
    createdAt: string;
}

// ============================================
// Maintenance tools (technician's toolkit)
// ============================================
export type ToolCategory = 'mécanique' | 'électrique' | 'mesure' | 'sécurité';
export type ToolStatus = 'disponible' | 'utilisé' | 'en maintenance';

/** A shared maintenance tool — the team checks it in/out via the
 *  technician's inventory page so everyone sees availability live. */
export interface Tool {
    id: string;
    name: string;
    category: ToolCategory;
    location: string;
    status: ToolStatus;
    assignedTo: string | null;        // name of the technician holding it
    lastCheckoutAt: string | null;
    notes: string;
    createdAt: string;
}

// ============================================
// Instrument calibration
// ============================================
export type CalibrationType = 'température' | 'pression' | 'pesage' | 'débit' | 'pH' | 'humidité' | 'autre';
export type CalibrationStatus = 'valide' | 'à étalonner' | 'expiré';

// ============================================
// Procedure run (T6 — step-by-step SOP execution)
// ============================================
export interface ProcedureStep {
    label: string;
    done: boolean;
    durationSec: number;
    note: string;
}

/** A completed (or in-progress) execution of a knowledge-base procedure. */
export interface ProcedureRun {
    id: string;
    articleId: string | null;
    articleTitle: string;
    machineId: string | null;
    interventionId: string | null;
    technicianName: string;
    steps: ProcedureStep[];
    startedAt: string;
    completedAt: string | null;
    totalDurationSec: number;
    createdAt: string;
}

// ============================================
// Technician certifications / habilitations (T7)
// ============================================
export type CertType = 'B1V' | 'BR' | 'chimique' | 'espaces confinés' | 'autre';

/** A regulatory habilitation a technician holds — with an expiry that the
 *  app checks before assigning the technician to a risky intervention. */
export interface TechCertification {
    id: string;
    technicianId: string | null;
    technicianName: string;
    certType: CertType;
    certNumber: string;
    issuedAt: string | null;
    expiresAt: string | null;
    issuingBody: string;
    notes: string;
    createdAt: string;
}

// ============================================
// Operator relief request (O3)
// ============================================
export type ReliefStatus = 'en attente' | 'accepté' | 'refusé';

/** An operator's request to be relieved on the line — bell-notified to admin. */
export interface ReliefRequest {
    id: string;
    operatorName: string;
    machineId: string | null;
    reason: string;
    status: ReliefStatus;
    respondedBy: string | null;
    respondedAt: string | null;
    createdAt: string;
}

// ============================================
// Consumable / EPI request (O4)
// ============================================
export type ConsumableCategory = 'EPI' | 'consommable' | 'autre';
export type ConsumableUrgency = 'normale' | 'urgente';
export type ConsumableReqStatus = 'ouverte' | 'traitée' | 'annulée';

/** Operator-side ticket for a missing PPE / consumable. */
export interface ConsumableRequest {
    id: string;
    operatorName: string;
    category: ConsumableCategory;
    item: string;
    quantity: number;
    urgency: ConsumableUrgency;
    notes: string;
    status: ConsumableReqStatus;
    handledBy: string | null;
    handledAt: string | null;
    createdAt: string;
}

// ============================================
// Directive + acknowledgement (O5)
// ============================================
/** An instruction the admin publishes — every operator must acknowledge it. */
export interface Directive {
    id: string;
    title: string;
    content: string;
    publishedBy: string;
    publishedAt: string;
    expiresAt: string | null;
    active: boolean;
    createdAt: string;
    // null / empty  ⇒ diffusée à TOUS les opérateurs (back-compat pour anciennes lignes).
    // liste de noms ⇒ diffusée uniquement à ces opérateurs, les autres ne la voient pas.
    targetOperators: string[] | null;
}

/** One operator's acknowledgement of one directive — ISO traceability. */
export interface DirectiveAck {
    id: string;
    directiveId: string;
    operatorName: string;
    ackAt: string;
    createdAt: string;
}

/** One task inside a maintenance project — simple checklist item. */
export interface ProjectTask {
    id: string;
    title: string;
    done: boolean;
    doneAt: string | null;
}

/** A big planned maintenance work — annual shutdown, machine overhaul,
 *  compliance audit, new-equipment installation, etc. Distinct from a
 *  single intervention (which is one work order on one machine). */
export interface MaintenanceProject {
    id: string;
    title: string;
    description: string;
    status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'critical';
    startDate: string | null;   // ISO
    dueDate: string | null;     // ISO
    completedAt: string | null; // ISO (set when status becomes 'completed')
    ownerName: string;          // responsible admin / chef de projet
    machineIds: string[];       // machines involved
    assigneeNames: string[];    // techniciens affectés
    budget: number;             // estimated (MAD)
    tasks: ProjectTask[];
    /** Supabase Storage URLs — photos taken on site, plans, before/after,
     *  attached certificates, etc. Everyone assigned to the project can add
     *  or remove; anyone viewing sees them in the card gallery. */
    photoUrls: string[];
    /** Long-form closing report written by the admin (or technicien) at the
     *  end of the project. Renders in the project detail + goes into the
     *  PDF export. Empty until someone fills it in. */
    finalReport: string;
    createdAt: string;
}

/** A calibration certificate for one measuring instrument. */
export interface CalibrationRecord {
    id: string;
    instrumentName: string;
    instrumentTag: string;
    machineId: string | null;
    calibrationType: CalibrationType;
    lastCalibration: string | null;
    nextDueDate: string | null;
    certificateNumber: string;
    calibratedBy: string;
    status: CalibrationStatus;
    notes: string;
    createdAt: string;
}
