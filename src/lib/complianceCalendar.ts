// ============================================================
// complianceCalendar.ts
//
// Unified "miss-nothing" calendar. Merges every recurring obligation
// into one stream, sorted by due date:
//
//   • HACCP CCP checks
//   • Calibration certificates
//   • Preventive maintenance plans
//   • Habilitations (B1V, BR, chimique)
//   • LOTO audits
//
// The UI shows a month-view heatmap + a "next 14 days" agenda. This
// module is pure — it just aggregates + labels. UI code renders.
// ============================================================

export type ComplianceKind =
    | 'haccp'
    | 'calibration'
    | 'preventive'
    | 'certification'
    | 'loto';

export interface ComplianceEvent {
    id: string;
    kind: ComplianceKind;
    title: string;
    subtitle?: string;
    dueDate: string;            // ISO
    daysUntilDue: number;       // negative = overdue
    severity: 'ok' | 'soon' | 'overdue';
    machineCode?: string;
    accent: string;             // hex
}

const ACCENTS: Record<ComplianceKind, string> = {
    haccp:         '#16a34a',
    calibration:   '#0891b2',
    preventive:    '#3b82f6',
    certification: '#a855f7',
    loto:          '#f97316',
};

const LABELS: Record<ComplianceKind, string> = {
    haccp:         'HACCP',
    calibration:   'Étalonnage',
    preventive:    'Préventif',
    certification: 'Habilitation',
    loto:          'LOTO',
};

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function severityFor(days: number): ComplianceEvent['severity'] {
    if (days < 0) return 'overdue';
    if (days <= 7) return 'soon';
    return 'ok';
}

interface Input {
    calibrationRecords?: Array<{ id: string; instrument: string; next_calibration_date: string; machine_code?: string }>;
    maintenancePlans?: Array<{ id: string; machine_id: string; machine_code?: string; description: string; next_due_date: string }>;
    techCertifications?: Array<{ id: string; technician_name: string; certification: string; expires_at: string }>;
    haccpCcps?: Array<{ id: string; type: string; machine_code?: string; next_due_date: string }>;
    lotoAudits?: Array<{ id: string; machine_code?: string; next_audit_date: string }>;
}

export function buildComplianceCalendar(input: Input, now: Date = new Date()): ComplianceEvent[] {
    const events: ComplianceEvent[] = [];

    for (const c of input.calibrationRecords ?? []) {
        const due = new Date(c.next_calibration_date);
        const d = daysBetween(now, due);
        events.push({
            id: 'cal-' + c.id, kind: 'calibration',
            title: c.instrument, subtitle: c.machine_code,
            dueDate: due.toISOString(), daysUntilDue: d,
            severity: severityFor(d), machineCode: c.machine_code, accent: ACCENTS.calibration,
        });
    }
    for (const p of input.maintenancePlans ?? []) {
        const due = new Date(p.next_due_date);
        const d = daysBetween(now, due);
        events.push({
            id: 'prev-' + p.id, kind: 'preventive',
            title: p.description, subtitle: p.machine_code,
            dueDate: due.toISOString(), daysUntilDue: d,
            severity: severityFor(d), machineCode: p.machine_code, accent: ACCENTS.preventive,
        });
    }
    for (const c of input.techCertifications ?? []) {
        const due = new Date(c.expires_at);
        const d = daysBetween(now, due);
        events.push({
            id: 'cert-' + c.id, kind: 'certification',
            title: `${c.certification} — ${c.technician_name}`,
            dueDate: due.toISOString(), daysUntilDue: d,
            severity: severityFor(d), accent: ACCENTS.certification,
        });
    }
    for (const h of input.haccpCcps ?? []) {
        const due = new Date(h.next_due_date);
        const d = daysBetween(now, due);
        events.push({
            id: 'haccp-' + h.id, kind: 'haccp',
            title: h.type, subtitle: h.machine_code,
            dueDate: due.toISOString(), daysUntilDue: d,
            severity: severityFor(d), machineCode: h.machine_code, accent: ACCENTS.haccp,
        });
    }
    for (const l of input.lotoAudits ?? []) {
        const due = new Date(l.next_audit_date);
        const d = daysBetween(now, due);
        events.push({
            id: 'loto-' + l.id, kind: 'loto',
            title: `Audit LOTO — ${l.machine_code ?? '—'}`,
            dueDate: due.toISOString(), daysUntilDue: d,
            severity: severityFor(d), machineCode: l.machine_code, accent: ACCENTS.loto,
        });
    }

    return events.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/** Group events by day for a heatmap render. */
export function eventsByDay(events: readonly ComplianceEvent[]): Record<string, ComplianceEvent[]> {
    const out: Record<string, ComplianceEvent[]> = {};
    for (const e of events) {
        const key = e.dueDate.slice(0, 10);   // YYYY-MM-DD
        (out[key] ??= []).push(e);
    }
    return out;
}

/** Summary counts for the top KPI cards. */
export function summarize(events: readonly ComplianceEvent[]) {
    return {
        overdue: events.filter(e => e.severity === 'overdue').length,
        soon:    events.filter(e => e.severity === 'soon').length,
        ok:      events.filter(e => e.severity === 'ok').length,
        byKind:  Object.fromEntries(
            (Object.keys(ACCENTS) as ComplianceKind[]).map(k => [k, events.filter(e => e.kind === k).length])
        ) as Record<ComplianceKind, number>,
    };
}

export const complianceLabels = LABELS;
