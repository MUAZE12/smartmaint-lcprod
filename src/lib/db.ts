// ============================================================
// SmartMaint — L.C PROD — Supabase CRUD helpers
// ------------------------------------------------------------
// Wrap supabase.from(...) calls behind typed functions so pages
// never have to remember table names or quoting rules.
//
// Every mutation:
//   - generates an id when the caller didn't provide one
//   - returns the inserted/updated row (or throws on error)
//   - relies on the DataContext Realtime channel to refresh UI
//   - is appended to the audit log via `auditWrap` (best-effort)
// ============================================================

import { supabase } from './supabase';
import { recordAudit } from './audit';
import type {
    Machine, Technician, Intervention, SparePart,
    Supplier, PurchaseOrder, ProductionMetric,
    PurchaseRequisition, PurchaseRequisitionLine,
    QuoteRequest, Quote, PurchaseOrderLine, GoodsReceipt,
    QuoteRequestLine, QuoteLine, Consumable, KpiFormula, MaintenancePlan,
    HaccpRecord, ChecklistTemplate, ChecklistRun, InterventionPart,
    CalibrationRecord, Tool, KnowledgeArticle,
    ShiftNote, ProductionBatch, LotoRecord,
    ProcedureRun, TechCertification, ReliefRequest, ConsumableRequest,
    Directive, DirectiveAck, MaintenanceProject,
} from './types';
import type { Personnel } from '@/context/DataContext';

function uid(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Empty response from Supabase');
    return data;
}

// ============================================================
// AUDIT WRAPPER
// ------------------------------------------------------------
// Wraps any {create,update,remove} helper so each mutation is
// appended to the audit log. Types are preserved exactly, so
// callers see no difference.
// ============================================================
interface CrudOps<T extends { id: string; createdAt?: string }> {
    create(input: Omit<T, 'id' | 'createdAt'> & Partial<Pick<T, 'id' | 'createdAt'>>): Promise<T>;
    update(id: string, patch: Partial<T>): Promise<T>;
    remove(id: string): Promise<void>;
}

function auditWrap<T extends { id: string; createdAt?: string }>(
    ops: CrudOps<T>, entity: string, describe: (row: T) => string,
): CrudOps<T> {
    return {
        async create(input) {
            const row = await ops.create(input);
            recordAudit('création', entity, row.id, describe(row));
            return row;
        },
        async update(id, patch) {
            const row = await ops.update(id, patch);
            recordAudit('modification', entity, row.id, describe(row));
            return row;
        },
        async remove(id) {
            await ops.remove(id);
            recordAudit('suppression', entity, id, '');
        },
    };
}

/** Detect "we're offline / Supabase unreachable" from a caught error.
 *  Used to route the mutation into the local queue instead of throwing
 *  a scary "Failed to fetch" toast at the user. */
function isNetworkError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return msg.includes('failed to fetch')
        || msg.includes('networkerror')
        || msg.includes('load failed')
        || msg.includes('typeerror')
        || msg.includes('network request failed');
}

/** Wrap any raw CrudOps so create/update/remove fall back to the offline
 *  queue when the network is down. Returns an optimistic value so the UI
 *  can continue rendering without a page reload. */
function offlineWrap<T extends { id: string; createdAt?: string }>(
    raw: CrudOps<T>, table: string,
): CrudOps<T> {
    return {
        async create(input) {
            try {
                return await raw.create(input);
            } catch (err) {
                if (isNetworkError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    // Reconstruct the row the way makeCrud does so the
                    // queue replay + optimistic UI both have the same id.
                    const row = {
                        id: (input as Partial<T>).id ?? uid('row'),
                        createdAt: (input as Partial<T>).createdAt ?? new Date().toISOString(),
                        ...input,
                    } as T;
                    enqueue({ op: 'insert', table, payload: row as unknown as Record<string, unknown> });
                    return row;
                }
                throw err;
            }
        },
        async update(id, patch) {
            try {
                return await raw.update(id, patch);
            } catch (err) {
                if (isNetworkError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    enqueue({ op: 'update', table, payload: patch as unknown as Record<string, unknown>, matchColumn: 'id', matchValue: id });
                    return { ...(patch as object), id } as T;
                }
                throw err;
            }
        },
        async remove(id) {
            try {
                await raw.remove(id);
            } catch (err) {
                if (isNetworkError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    enqueue({ op: 'delete', table, matchColumn: 'id', matchValue: id });
                    return;
                }
                throw err;
            }
        },
    };
}

// ============================================================
// MACHINES
// ============================================================
const machinesDbRaw = {
    async create(input: Omit<Machine, 'id' | 'createdAt'> & Partial<Pick<Machine, 'id' | 'createdAt'>>): Promise<Machine> {
        const row = {
            id: input.id ?? uid('mach'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<Machine>(
            supabase.from('machines').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<Machine>): Promise<Machine> {
        return unwrap<Machine>(
            supabase.from('machines').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('machines').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const machinesDb = auditWrap(offlineWrap(machinesDbRaw, 'machines'), 'machine', m => `${m.code} — ${m.name}`);

// ============================================================
// TECHNICIANS
// ============================================================
const techniciansDbRaw = {
    async create(input: Omit<Technician, 'id' | 'createdAt'> & Partial<Pick<Technician, 'id' | 'createdAt'>>): Promise<Technician> {
        const row = {
            id: input.id ?? uid('tech'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<Technician>(
            supabase.from('technicians').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<Technician>): Promise<Technician> {
        return unwrap<Technician>(
            supabase.from('technicians').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        // Defensive: unassign this technician from any intervention before
        // deleting, so an FK constraint without ON DELETE SET NULL can't block.
        const { error: unassignErr } = await supabase
            .from('interventions').update({ technicianId: null }).eq('technicianId', id);
        if (unassignErr) throw new Error(unassignErr.message);
        const { error } = await supabase.from('technicians').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const techniciansDb = auditWrap(offlineWrap(techniciansDbRaw, 'technicians'), 'technicien', t => t.fullName);

// ============================================================
// INTERVENTIONS
// ============================================================
const interventionsDbRaw = {
    async create(input: Omit<Intervention, 'id' | 'createdAt'> & Partial<Pick<Intervention, 'id' | 'createdAt'>>): Promise<Intervention> {
        const row = {
            id: input.id ?? uid('int'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<Intervention>(
            supabase.from('interventions').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<Intervention>): Promise<Intervention> {
        return unwrap<Intervention>(
            supabase.from('interventions').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('interventions').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const interventionsDb = auditWrap(offlineWrap(interventionsDbRaw, 'interventions'), 'intervention',
    i => `${i.interventionType} · ${i.description}`);

// ============================================================
// SPARE PARTS
// ============================================================
const sparePartsDbRaw = {
    async create(input: Omit<SparePart, 'id' | 'createdAt'> & Partial<Pick<SparePart, 'id' | 'createdAt'>>): Promise<SparePart> {
        const row = {
            id: input.id ?? uid('sp'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<SparePart>(
            supabase.from('spare_parts').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<SparePart>): Promise<SparePart> {
        return unwrap<SparePart>(
            supabase.from('spare_parts').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        // Defensive: unbind this part from every line-item table so an FK
        // constraint can't block the delete. The line rows survive (with
        // sparePartId = null) so PO/RFQ history isn't shredded.
        const lineTables = [
            'intervention_parts', 'purchase_requisition_lines',
            'quote_request_lines', 'quote_lines', 'purchase_order_lines',
        ];
        for (const t of lineTables) {
            const { error } = await supabase.from(t).update({ sparePartId: null }).eq('sparePartId', id);
            if (error) throw new Error(error.message);
        }
        const { error } = await supabase.from('spare_parts').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const sparePartsDb = auditWrap(offlineWrap(sparePartsDbRaw, 'spare_parts'), 'pièce', p => `${p.name} (${p.reference})`);

// ============================================================
// SUPPLIERS
// ============================================================
const suppliersDbRaw = {
    async create(input: Omit<Supplier, 'id' | 'createdAt'> & Partial<Pick<Supplier, 'id' | 'createdAt'>>): Promise<Supplier> {
        const row = {
            id: input.id ?? uid('sup'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<Supplier>(
            supabase.from('suppliers').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<Supplier>): Promise<Supplier> {
        return unwrap<Supplier>(
            supabase.from('suppliers').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        // Defensive: unbind from any PO / quote so FK can't block the delete.
        await supabase.from('purchase_orders').update({ supplierId: null }).eq('supplierId', id);
        await supabase.from('quotes').update({ supplierId: null }).eq('supplierId', id);
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const suppliersDb = auditWrap(offlineWrap(suppliersDbRaw, 'suppliers'), 'fournisseur', s => s.name);

// ============================================================
// PURCHASE ORDERS
// ============================================================
const purchaseOrdersDbRaw = {
    async create(input: Omit<PurchaseOrder, 'id' | 'createdAt'> & Partial<Pick<PurchaseOrder, 'id' | 'createdAt'>>): Promise<PurchaseOrder> {
        const row = {
            id: input.id ?? uid('po'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<PurchaseOrder>(
            supabase.from('purchase_orders').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
        return unwrap<PurchaseOrder>(
            supabase.from('purchase_orders').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const purchaseOrdersDb = auditWrap(offlineWrap(purchaseOrdersDbRaw, 'purchase_orders'), 'commande', po => po.poNumber);

// ============================================================
// PRODUCTION METRICS
// ============================================================
const productionMetricsDbRaw = {
    async create(input: Omit<ProductionMetric, 'id' | 'createdAt'> & Partial<Pick<ProductionMetric, 'id' | 'createdAt'>>): Promise<ProductionMetric> {
        const row = {
            id: input.id ?? uid('pm'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<ProductionMetric>(
            supabase.from('production_metrics').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<ProductionMetric>): Promise<ProductionMetric> {
        return unwrap<ProductionMetric>(
            supabase.from('production_metrics').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('production_metrics').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const productionMetricsDb = auditWrap(offlineWrap(productionMetricsDbRaw, 'production_metrics'), 'métrique production',
    pm => `Saisie du ${pm.date}`);

// ============================================================
// PERSONNEL
// ============================================================
const personnelDbRaw = {
    async create(input: Omit<Personnel, 'id' | 'createdAt'> & Partial<Pick<Personnel, 'id' | 'createdAt'>>): Promise<Personnel> {
        const row = {
            id: input.id ?? uid(input.role === 'operateur' ? 'op' : 'tech'),
            createdAt: input.createdAt ?? new Date().toISOString(),
            ...input,
        };
        return unwrap<Personnel>(
            supabase.from('personnel').insert(row).select().single()
        );
    },
    async update(id: string, patch: Partial<Personnel>): Promise<Personnel> {
        return unwrap<Personnel>(
            supabase.from('personnel').update(patch).eq('id', id).select().single()
        );
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('personnel').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
export const personnelDb = auditWrap(offlineWrap(personnelDbRaw, 'personnel'), 'personnel', p => `${p.nom} (${p.role})`);

// ============================================================
// PROCUREMENT v2 — generic table CRUD factory
// ============================================================
/** Detect "we're offline / Supabase unreachable" from an error. Used to
 *  decide whether to enqueue the mutation instead of failing hard. */
function isOfflineError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return msg.includes('failed to fetch')
        || msg.includes('networkerror')
        || msg.includes('load failed')
        || msg.includes('typeerror');
}

/** Build a {create, update, remove} helper for an id+createdAt table.
 *  When the browser is offline, mutations are queued in localStorage
 *  (see lib/offlineQueue) and replayed when connectivity returns. */
function makeCrud<T extends { id: string; createdAt: string }>(table: string, idPrefix: string) {
    return {
        async create(input: Omit<T, 'id' | 'createdAt'> & Partial<Pick<T, 'id' | 'createdAt'>>): Promise<T> {
            const row = {
                id: (input as Partial<T>).id ?? uid(idPrefix),
                createdAt: (input as Partial<T>).createdAt ?? new Date().toISOString(),
                ...input,
            };
            try {
                return await unwrap<T>(supabase.from(table).insert(row).select().single());
            } catch (err) {
                if (isOfflineError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    enqueue({ op: 'insert', table, payload: row as Record<string, unknown> });
                    // Return the row locally — the UI can render it optimistically.
                    return row as T;
                }
                throw err;
            }
        },
        async update(id: string, patch: Partial<T>): Promise<T> {
            try {
                return await unwrap<T>(
                    supabase.from(table).update(patch as T).eq('id', id).select().single()
                );
            } catch (err) {
                if (isOfflineError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    enqueue({ op: 'update', table, payload: patch as Record<string, unknown>, matchColumn: 'id', matchValue: id });
                    return { ...(patch as object), id } as T;
                }
                throw err;
            }
        },
        async remove(id: string): Promise<void> {
            try {
                const { error } = await supabase.from(table).delete().eq('id', id);
                if (error) throw new Error(error.message);
            } catch (err) {
                if (isOfflineError(err)) {
                    const { enqueue } = await import('./offlineQueue');
                    enqueue({ op: 'delete', table, matchColumn: 'id', matchValue: id });
                    return;
                }
                throw err;
            }
        },
    };
}

// ── Line-item tables — audited via their parent, kept plain to avoid log noise ──
export const purchaseRequisitionLinesDb = makeCrud<PurchaseRequisitionLine>('purchase_requisition_lines', 'rql');
export const quoteRequestLinesDb = makeCrud<QuoteRequestLine>('quote_request_lines', 'rfl');
export const quoteLinesDb = makeCrud<QuoteLine>('quote_lines', 'ql');
export const purchaseOrderLinesDb = makeCrud<PurchaseOrderLine>('purchase_order_lines', 'pol');

// ── Audited entities ──
export const purchaseRequisitionsDb = auditWrap(
    makeCrud<PurchaseRequisition>('purchase_requisitions', 'req'), 'demande d\'achat', r => r.reqNumber);
export const quoteRequestsDb = auditWrap(
    makeCrud<QuoteRequest>('quote_requests', 'rfq'), 'appel d\'offres', r => r.rfqNumber);
export const quotesDb = auditWrap(
    makeCrud<Quote>('quotes', 'qte'), 'devis', q => `Devis ${q.totalAmount} MAD`);
export const consumablesDb = auditWrap(
    makeCrud<Consumable>('consumables', 'cons'), 'consommable', c => c.name);
export const kpiFormulasDb = auditWrap(
    makeCrud<KpiFormula>('kpi_formulas', 'kpi'), 'formule KPI', k => k.name);
export const maintenancePlansDb = auditWrap(
    makeCrud<MaintenancePlan>('maintenance_plans', 'mp'), 'plan préventif', p => p.title);
export const goodsReceiptsDb = auditWrap(
    makeCrud<GoodsReceipt>('goods_receipts', 'grn'), 'réception', g => g.grnNumber);
export const haccpRecordsDb = auditWrap(
    makeCrud<HaccpRecord>('haccp_records', 'hac'), 'contrôle HACCP', h => h.checkType);
export const interventionPartsDb = auditWrap(
    makeCrud<InterventionPart>('intervention_parts', 'ip'), 'pièce consommée', p => p.partName);
export const checklistTemplatesDb = auditWrap(
    makeCrud<ChecklistTemplate>('checklist_templates', 'clt'), 'modèle check-list', t => t.title);
export const checklistRunsDb = auditWrap(
    makeCrud<ChecklistRun>('checklist_runs', 'clr'), 'check-list', r => r.title);
export const calibrationRecordsDb = auditWrap(
    makeCrud<CalibrationRecord>('calibration_records', 'cal'), 'étalonnage',
    c => `${c.instrumentName}${c.instrumentTag ? ` (${c.instrumentTag})` : ''}`);
export const toolsDb = auditWrap(
    makeCrud<Tool>('tools', 'tool'), 'outillage', t => t.name);
export const knowledgeArticlesDb = auditWrap(
    makeCrud<KnowledgeArticle>('knowledge_articles', 'kb'), 'fiche de procédure', a => a.title);
export const shiftNotesDb = auditWrap(
    makeCrud<ShiftNote>('shift_notes', 'sn'), 'note de quart',
    n => `[${n.priority}] ${n.content.slice(0, 60)}`);
export const productionBatchesDb = auditWrap(
    makeCrud<ProductionBatch>('production_batches', 'pb'), 'lot de production',
    b => `${b.batchNumber} — ${b.productName}`);
export const lotoRecordsDb = auditWrap(
    makeCrud<LotoRecord>('loto_records', 'loto'), 'consignation LOTO',
    l => `${l.machineId} — ${l.technicianName}`);
export const procedureRunsDb = auditWrap(
    makeCrud<ProcedureRun>('procedure_runs', 'pr'), 'exécution de procédure',
    p => `${p.articleTitle} — ${p.technicianName}`);
export const techCertificationsDb = auditWrap(
    makeCrud<TechCertification>('tech_certifications', 'cert'), 'habilitation',
    c => `${c.certType} — ${c.technicianName}`);
export const reliefRequestsDb = auditWrap(
    makeCrud<ReliefRequest>('relief_requests', 'rel'), 'demande de relais',
    r => `${r.operatorName} — ${r.reason || 'sans motif'}`);
export const consumableRequestsDb = auditWrap(
    makeCrud<ConsumableRequest>('consumable_requests', 'creq'), 'demande EPI/consommable',
    r => `${r.category} — ${r.item}`);
export const directivesDb = auditWrap(
    makeCrud<Directive>('directives', 'dir'), 'consigne', d => d.title);
export const directiveAcksDb = makeCrud<DirectiveAck>('directive_acks', 'ack');
export const maintenanceProjectsDb = auditWrap(
    makeCrud<MaintenanceProject>('maintenance_projects', 'prj'), 'projet', p => p.title);

// ── app_settings — keyed by `key`, not `id`; upsert helper ──
export const settingsDb = {
    async get(key: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('app_settings').select('value').eq('key', key).maybeSingle();
        if (error) throw new Error(error.message);
        return data?.value ?? null;
    },
    async set(key: string, value: string): Promise<void> {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value, updatedAt: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw new Error(error.message);
    },
};
