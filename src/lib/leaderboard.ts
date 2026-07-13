// ============================================================
// leaderboard.ts
//
// Technician-of-the-month scoring. Pure functions — the UI feeds
// interventions + a period, gets back ranked techs with a breakdown
// so hovering a row shows why they scored what they did.
//
// SCORING (100 pts max)
//   40 — interventions closed (weighted by criticality)
//   30 — MTTR: shorter is better, scored vs peer median
//   15 — preventive share: rewarding tech that also does PMs
//   15 — HACCP + LOTO compliance touches
//
// This is gamification, not payroll. Cap at 100, show top 5, no
// public shaming of the bottom half.
// ============================================================

interface InterventionLike {
    id: string;
    technician_id: string | null;
    intervention_type: 'corrective' | 'préventive' | 'conditionnelle' | 'améliorative';
    status: string;
    downtime_hours: number | null;
    total_cost: number | null;
    start_date: string;
    end_date: string | null;
    machine_criticality?: number;   // optional; 1-10
}

interface TechnicianLike {
    id: string;
    fullName: string;
    imageUrl?: string;
}

export interface LeaderboardEntry {
    rank: number;
    technicianId: string;
    technicianName: string;
    imageUrl?: string;
    score: number;
    interventionsClosed: number;
    preventiveShare: number;    // 0..1
    avgMttrHours: number;
    complianceTouches: number;
    breakdown: {
        volume: number;
        mttr: number;
        preventive: number;
        compliance: number;
    };
}

interface Options {
    period: { start: Date; end: Date };
    /** Extra credit for HACCP records / LOTO signs by this tech (optional). */
    complianceTouchesByTech?: Record<string, number>;
}

export function computeLeaderboard(
    interventions: readonly InterventionLike[],
    technicians: readonly TechnicianLike[],
    opts: Options,
): LeaderboardEntry[] {
    const inWindow = interventions.filter(i => {
        const t = new Date(i.start_date).getTime();
        return t >= opts.period.start.getTime() && t <= opts.period.end.getTime();
    });

    // Per-tech aggregates
    const perTech = new Map<string, {
        closed: number;
        weightedClosed: number;
        preventiveCount: number;
        mttrSum: number;
        mttrN: number;
    }>();

    for (const i of inWindow) {
        if (!i.technician_id) continue;
        const bucket = perTech.get(i.technician_id) ?? {
            closed: 0, weightedClosed: 0, preventiveCount: 0, mttrSum: 0, mttrN: 0,
        };
        if (i.status === 'terminée' || i.status === 'clôturée') {
            bucket.closed += 1;
            bucket.weightedClosed += 1 + Math.min(1, (i.machine_criticality ?? 5) / 10);
        }
        if (i.intervention_type === 'préventive') bucket.preventiveCount += 1;
        if (i.intervention_type === 'corrective' && i.status === 'terminée' && i.downtime_hours) {
            bucket.mttrSum += i.downtime_hours;
            bucket.mttrN += 1;
        }
        perTech.set(i.technician_id, bucket);
    }

    // Peer medians for MTTR — used to normalize
    const mttrValues: number[] = [];
    for (const b of perTech.values()) if (b.mttrN > 0) mttrValues.push(b.mttrSum / b.mttrN);
    mttrValues.sort((a, b) => a - b);
    const median = mttrValues.length > 0 ? mttrValues[Math.floor(mttrValues.length / 2)] : 0;

    // Max weightedClosed (for scaling)
    const maxClosed = [...perTech.values()].reduce((m, b) => Math.max(m, b.weightedClosed), 1);

    const entries: LeaderboardEntry[] = [];
    for (const t of technicians) {
        const b = perTech.get(t.id);
        if (!b) continue;

        const volume = Math.round((b.weightedClosed / maxClosed) * 40);          // 0..40
        // MTTR score: below or equal to median → full 30, then linear decay
        let mttrScore = 30;
        if (b.mttrN > 0 && median > 0) {
            const tmttr = b.mttrSum / b.mttrN;
            const ratio = median / tmttr;  // >1 → faster than median
            mttrScore = Math.round(Math.min(30, Math.max(0, 15 + 15 * (ratio - 1))));
        }
        const preventiveShare = b.closed > 0 ? b.preventiveCount / (b.closed + b.preventiveCount) : 0;
        const preventiveScore = Math.round(preventiveShare * 15);
        const complianceTouches = opts.complianceTouchesByTech?.[t.id] ?? 0;
        const complianceScore = Math.round(Math.min(15, complianceTouches * 1.5));

        const score = volume + mttrScore + preventiveScore + complianceScore;

        entries.push({
            rank: 0,
            technicianId: t.id,
            technicianName: t.fullName,
            imageUrl: t.imageUrl,
            score,
            interventionsClosed: b.closed,
            preventiveShare,
            avgMttrHours: b.mttrN > 0 ? Math.round((b.mttrSum / b.mttrN) * 10) / 10 : 0,
            complianceTouches,
            breakdown: {
                volume, mttr: mttrScore,
                preventive: preventiveScore, compliance: complianceScore,
            },
        });
    }

    entries.sort((a, b) => b.score - a.score || b.interventionsClosed - a.interventionsClosed);
    for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;
    return entries;
}
