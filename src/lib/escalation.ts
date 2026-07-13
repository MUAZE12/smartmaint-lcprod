// ============================================================
// escalation.ts
//
// Escalation tree for critical incidents. Instead of "everything sits
// in a queue", every alert has a configurable acknowledge deadline; if
// nobody acks in time, the alert re-fires to the next escalation level.
//
// LEVELS (configurable per criticality)
//   1. assigned technician   → 15 min
//   2. shift supervisor      → 30 min
//   3. plant manager         → 60 min
//   4. director              → 120 min (only for CRITICAL machines)
//
// The engine is pure — it takes a queue snapshot + "now", returns the
// notifications to fire. A cron (or Supabase webhook) invokes it every
// minute; anyone who acknowledged in the window is filtered out.
// ============================================================

export type Criticality = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationLevel {
    level: number;           // 1, 2, 3, 4
    role: 'technician' | 'supervisor' | 'manager' | 'director';
    dueAfterMinutes: number; // from initial incident timestamp
}

/** Default tree — tweak in settings later. */
export const DEFAULT_TREE: Record<Criticality, EscalationLevel[]> = {
    low: [
        { level: 1, role: 'technician', dueAfterMinutes: 60 },
        { level: 2, role: 'supervisor', dueAfterMinutes: 180 },
    ],
    medium: [
        { level: 1, role: 'technician', dueAfterMinutes: 30 },
        { level: 2, role: 'supervisor', dueAfterMinutes: 90 },
        { level: 3, role: 'manager',    dueAfterMinutes: 240 },
    ],
    high: [
        { level: 1, role: 'technician', dueAfterMinutes: 15 },
        { level: 2, role: 'supervisor', dueAfterMinutes: 45 },
        { level: 3, role: 'manager',    dueAfterMinutes: 120 },
    ],
    critical: [
        { level: 1, role: 'technician', dueAfterMinutes: 15 },
        { level: 2, role: 'supervisor', dueAfterMinutes: 30 },
        { level: 3, role: 'manager',    dueAfterMinutes: 60 },
        { level: 4, role: 'director',   dueAfterMinutes: 120 },
    ],
};

export interface IncidentSnapshot {
    id: string;
    createdAt: string;         // ISO
    criticality: Criticality;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    /** Highest level already notified (0 if none). */
    lastNotifiedLevel: number;
}

export interface EscalationNotification {
    incidentId: string;
    level: number;
    role: EscalationLevel['role'];
    minutesSinceCreation: number;
}

/**
 * Given a snapshot of open incidents at `now`, decide which need to
 * fire the next escalation level. Pure — no side effects.
 */
export function planEscalations(
    incidents: readonly IncidentSnapshot[],
    now: Date,
    tree: Record<Criticality, EscalationLevel[]> = DEFAULT_TREE,
): EscalationNotification[] {
    const out: EscalationNotification[] = [];
    for (const inc of incidents) {
        if (inc.acknowledgedAt) continue;    // acked → nothing to do
        const ageMin = (now.getTime() - new Date(inc.createdAt).getTime()) / 60000;
        const levels = tree[inc.criticality];
        // Find the highest level whose deadline is in the past AND we haven't
        // already notified.
        let target: EscalationLevel | null = null;
        for (const lvl of levels) {
            if (ageMin >= lvl.dueAfterMinutes && lvl.level > inc.lastNotifiedLevel) {
                target = lvl;    // keep escalating; the loop naturally picks the highest
            }
        }
        if (target) {
            out.push({
                incidentId: inc.id,
                level: target.level,
                role: target.role,
                minutesSinceCreation: Math.round(ageMin),
            });
        }
    }
    return out;
}

/** Human label for the escalation banner. */
export function labelForLevel(role: EscalationLevel['role']): string {
    switch (role) {
        case 'technician': return 'technicien assigné';
        case 'supervisor': return 'superviseur de shift';
        case 'manager':    return 'responsable maintenance';
        case 'director':   return 'directeur usine';
    }
}
