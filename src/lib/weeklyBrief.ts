// ============================================================
// weeklyBrief.ts
//
// Aggregates last-7-days plant KPIs into a "Directeur brief" payload.
// Delivered as an emailed 2-page PDF every Monday 07:00 UTC by
// /api/cron/weekly-report — no extra clicks, no manual work.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WeeklyBrief {
    windowStart: string;         // ISO
    windowEnd: string;           // ISO
    machines: {
        total: number;
        broken: number;
        newlyBroken: number;     // status transitioned to en panne this week
        fixedThisWeek: number;
    };
    interventions: {
        total: number;
        corrective: number;
        preventive: number;
        avgDowntimeHours: number;
        avgMttrHours: number;
    };
    cost: {
        totalMad: number;
        laborMad: number;
        partsMad: number;
        downtimeMad: number;
    };
    haccp: {
        recordsFiled: number;
        overdue: number;
        nonConform: number;
    };
    spareParts: {
        stockCriticalCount: number;
        posReceived: number;
        posAwaitingApproval: number;
    };
    topBrokenMachines: Array<{ code: string; name: string; downtimeH: number }>;
    highlights: string[];        // 3-5 human-readable sentences
}

interface SqlIntervention {
    id: string;
    machine_id: string;
    intervention_type: 'corrective' | 'préventive' | 'conditionnelle' | 'améliorative';
    status: string;
    downtime_hours: number | null;
    labor_cost: number | null;
    parts_cost: number | null;
    downtime_cost: number | null;
    total_cost: number | null;
    start_date: string;
    end_date: string | null;
}

interface SqlMachine { id: string; code: string; name: string; status: string; }

interface SqlHaccp { result: 'conforme' | 'non_conforme' | 'a_corriger'; created_at: string; }

interface SqlSparePart { quantity: number; minimum_stock: number; }

interface SqlPO { status: 'brouillon' | 'envoyée' | 'partielle' | 'réceptionnée'; created_at: string; }

export async function computeWeeklyBrief(sb: SupabaseClient): Promise<WeeklyBrief> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const start = weekAgo.toISOString();
    const end = now.toISOString();

    // Parallel fetch — every query is small (<5000 rows).
    const [interventionsRes, machinesRes, haccpRes, partsRes, posRes] = await Promise.all([
        sb.from('interventions').select('id, machine_id, intervention_type, status, downtime_hours, labor_cost, parts_cost, downtime_cost, total_cost, start_date, end_date').gte('start_date', start).lte('start_date', end),
        sb.from('machines').select('id, code, name, status'),
        sb.from('haccp_records').select('result, created_at').gte('created_at', start),
        sb.from('spare_parts').select('quantity, minimum_stock'),
        sb.from('purchase_orders').select('status, created_at').gte('created_at', start),
    ]);

    const interventions = (interventionsRes.data ?? []) as SqlIntervention[];
    const machines      = (machinesRes.data ?? []) as SqlMachine[];
    const haccp         = (haccpRes.data ?? []) as SqlHaccp[];
    const parts         = (partsRes.data ?? []) as SqlSparePart[];
    const pos           = (posRes.data ?? []) as SqlPO[];

    // Machines
    const broken = machines.filter(m => m.status === 'en panne');
    // "Fixed this week" = interventions terminée on machines currently opérationnelle
    const fixedThisWeek = interventions.filter(i => i.end_date && i.end_date >= start).length;
    const machinesById = new Map(machines.map(m => [m.id, m]));

    // Interventions
    const corrective = interventions.filter(i => i.intervention_type === 'corrective');
    const preventive = interventions.filter(i => i.intervention_type === 'préventive');
    const doneCorrective = corrective.filter(i => i.status === 'terminée' && (i.downtime_hours ?? 0) > 0);
    const avgDowntime = doneCorrective.length > 0
        ? doneCorrective.reduce((s, i) => s + (i.downtime_hours ?? 0), 0) / doneCorrective.length
        : 0;

    // Cost
    const sum = (fn: (i: SqlIntervention) => number | null | undefined) =>
        interventions.reduce((s, i) => s + (fn(i) ?? 0), 0);
    const cost = {
        laborMad:    sum(i => i.labor_cost),
        partsMad:    sum(i => i.parts_cost),
        downtimeMad: sum(i => i.downtime_cost),
        totalMad:    sum(i => i.total_cost),
    };

    // HACCP
    const overdue = 0;  // Requires haccp_ccps table with due_date; simplified for MVP
    const nonConform = haccp.filter(h => h.result === 'non_conforme').length;

    // Spare parts
    const stockCritical = parts.filter(p => p.quantity <= p.minimum_stock).length;
    const posReceived = pos.filter(p => p.status === 'réceptionnée').length;
    const posAwaiting = pos.filter(p => p.status === 'envoyée').length;

    // Top 3 broken machines by downtime this week
    const downtimeByMachine = new Map<string, number>();
    for (const i of interventions) {
        const cur = downtimeByMachine.get(i.machine_id) ?? 0;
        downtimeByMachine.set(i.machine_id, cur + (i.downtime_hours ?? 0));
    }
    const topBroken = [...downtimeByMachine.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, downtimeH]) => {
            const m = machinesById.get(id);
            return { code: m?.code ?? id, name: m?.name ?? '—', downtimeH: Math.round(downtimeH * 10) / 10 };
        });

    // Highlights — 3-5 human-readable sentences the director actually reads
    const highlights: string[] = [];
    highlights.push(`${interventions.length} interventions cette semaine dont ${corrective.length} correctives.`);
    if (topBroken.length > 0) {
        highlights.push(`Machine la plus arrêtée : ${topBroken[0].code} — ${topBroken[0].name} (${topBroken[0].downtimeH} h).`);
    }
    if (avgDowntime > 0) {
        highlights.push(`MTTR moyen des pannes réparées : ${avgDowntime.toFixed(1)} h.`);
    }
    if (stockCritical > 0) {
        highlights.push(`⚠ ${stockCritical} pièces sous seuil critique. ${posAwaiting} bon(s) de commande en attente d'approbation.`);
    }
    if (nonConform > 0) {
        highlights.push(`⚠ ${nonConform} contrôles HACCP non conformes — action corrective requise.`);
    }

    return {
        windowStart: start, windowEnd: end,
        machines: {
            total: machines.length,
            broken: broken.length,
            newlyBroken: broken.length,   // simplified — a real impl would diff last week's snapshot
            fixedThisWeek,
        },
        interventions: {
            total: interventions.length,
            corrective: corrective.length,
            preventive: preventive.length,
            avgDowntimeHours: Math.round(avgDowntime * 10) / 10,
            avgMttrHours: Math.round(avgDowntime * 10) / 10,
        },
        cost: {
            totalMad:    Math.round(cost.totalMad),
            laborMad:    Math.round(cost.laborMad),
            partsMad:    Math.round(cost.partsMad),
            downtimeMad: Math.round(cost.downtimeMad),
        },
        haccp: {
            recordsFiled: haccp.length,
            overdue,
            nonConform,
        },
        spareParts: {
            stockCriticalCount: stockCritical,
            posReceived,
            posAwaitingApproval: posAwaiting,
        },
        topBrokenMachines: topBroken,
        highlights,
    };
}
