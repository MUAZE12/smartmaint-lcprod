// ============================================
// SmartMaint — L.C PROD — Calculs de maintenance
// MTBF, MTTR, Disponibilité, TRS, Criticité
// ============================================

import {
    Machine,
    Intervention,
    ProductionMetric,
    MachineKPI,
    GlobalKPI,
    TRSData,
    Recommendation,
    CriticalityLevel,
} from './types';
import {
    machines,
    interventions,
    productionMetrics,
    getInterventionsByMachine,
    getProductionMetricsByMachine,
} from './data';

// ============================================
// MTBF — Mean Time Between Failures
// MTBF = temps total de bon fonctionnement / nombre de pannes
// ============================================
export function calculateMTBF(machineId: string): number {
    const machineInterventions = getInterventionsByMachine(machineId);
    const correctiveInterventions = machineInterventions.filter(
        i => i.interventionType === 'corrective' && i.status === 'terminée'
    );

    if (correctiveInterventions.length === 0) return 999; // pas de panne

    // Estimation : heures de fonctionnement depuis l'installation
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return 0;

    const installDate = new Date(machine.installationDate);
    const now = new Date();
    const totalMonths = (now.getFullYear() - installDate.getFullYear()) * 12 + (now.getMonth() - installDate.getMonth());
    const totalOperatingHours = totalMonths * 22 * 8; // 22 jours/mois, 8h/jour

    const totalDowntime = machineInterventions
        .filter(i => i.status === 'terminée')
        .reduce((sum, i) => sum + i.downtimeHours, 0);

    const uptime = totalOperatingHours - totalDowntime;
    const mtbf = uptime / correctiveInterventions.length;

    return Math.round(mtbf * 10) / 10;
}

// ============================================
// MTTR — Mean Time To Repair
// MTTR = temps total de réparation / nombre d'interventions correctives
// ============================================
export function calculateMTTR(machineId: string): number {
    const machineInterventions = getInterventionsByMachine(machineId);
    const correctiveInterventions = machineInterventions.filter(
        i => i.interventionType === 'corrective' && i.status === 'terminée'
    );

    if (correctiveInterventions.length === 0) return 0;

    const totalRepairTime = correctiveInterventions.reduce(
        (sum, i) => sum + i.downtimeHours, 0
    );

    return Math.round((totalRepairTime / correctiveInterventions.length) * 10) / 10;
}

// ============================================
// Disponibilité
// Disponibilité = MTBF / (MTBF + MTTR)
// ============================================
export function calculateAvailability(machineId: string): number {
    const mtbf = calculateMTBF(machineId);
    const mttr = calculateMTTR(machineId);

    if (mtbf + mttr === 0) return 100;
    const availability = (mtbf / (mtbf + mttr)) * 100;
    return Math.round(availability * 10) / 10;
}

// ============================================
// TRS — Taux de Rendement Synthétique
// TRS = Disponibilité × Performance × Qualité
// ============================================
export function calculateTRS(machineId: string): TRSData {
    const metrics = getProductionMetricsByMachine(machineId);
    const machine = machines.find(m => m.id === machineId);

    if (metrics.length === 0 || !machine) {
        return {
            machineId,
            machineName: machine?.name || '',
            availability: 0,
            performance: 0,
            quality: 0,
            trs: 0,
        };
    }

    const totalPlannedTime = metrics.reduce((s, m) => s + m.plannedTime, 0);
    const totalDowntime = metrics.reduce((s, m) => s + m.downtime, 0);
    const totalProduced = metrics.reduce((s, m) => s + m.producedQuantity, 0);
    const totalRejected = metrics.reduce((s, m) => s + m.rejectedQuantity, 0);
    const avgTheoreticalCycle = metrics.reduce((s, m) => s + m.theoreticalCycleTime, 0) / metrics.length;
    const avgRealCycle = metrics.reduce((s, m) => s + m.realCycleTime, 0) / metrics.length;

    const availability = totalPlannedTime > 0 ? (totalPlannedTime - totalDowntime) / totalPlannedTime : 0;
    const performance = avgRealCycle > 0 ? avgTheoreticalCycle / avgRealCycle : 0;
    const quality = totalProduced > 0 ? (totalProduced - totalRejected) / totalProduced : 0;
    const trs = availability * performance * quality;

    return {
        machineId,
        machineName: machine.name,
        availability: Math.round(availability * 1000) / 10,
        performance: Math.round(performance * 1000) / 10,
        quality: Math.round(quality * 1000) / 10,
        trs: Math.round(trs * 1000) / 10,
    };
}

// ============================================
// Coût total d'une intervention
// Coût total = main-d'œuvre + pièces + coût d'arrêt
// ============================================
export function calculateInterventionCost(intervention: Intervention, machine: Machine): number {
    const downtimeCost = intervention.downtimeHours * machine.hourlyDowntimeCost;
    return intervention.laborCost + intervention.partsCost + downtimeCost;
}

// ============================================
// Score de criticité
// Score = 40% fréquence pannes + 30% durée arrêt + 20% coût arrêt + 10% importance
// ============================================
export function calculateCriticalityScore(machineId: string): number {
    const machineInterventions = getInterventionsByMachine(machineId);
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return 0;

    // Normaliser sur 100
    const allMachineStats = machines.map(m => {
        const ints = getInterventionsByMachine(m.id);
        const corrective = ints.filter(i => i.interventionType === 'corrective');
        return {
            id: m.id,
            breakdowns: corrective.length,
            totalDowntime: ints.reduce((s, i) => s + i.downtimeHours, 0),
            totalCost: ints.reduce((s, i) => s + i.totalCost, 0),
            importance: m.importanceLevel,
        };
    });

    const maxBreakdowns = Math.max(...allMachineStats.map(s => s.breakdowns), 1);
    const maxDowntime = Math.max(...allMachineStats.map(s => s.totalDowntime), 1);
    const maxCost = Math.max(...allMachineStats.map(s => s.totalCost), 1);
    const maxImportance = 10;

    const stats = allMachineStats.find(s => s.id === machineId)!;

    const freqScore = (stats.breakdowns / maxBreakdowns) * 100;
    const downtimeScore = (stats.totalDowntime / maxDowntime) * 100;
    const costScore = (stats.totalCost / maxCost) * 100;
    const importanceScore = (stats.importance / maxImportance) * 100;

    const score = 0.4 * freqScore + 0.3 * downtimeScore + 0.2 * costScore + 0.1 * importanceScore;

    return Math.round(score * 10) / 10;
}

export function getCriticalityLevel(score: number): CriticalityLevel {
    if (score <= 40) return 'faible';
    if (score <= 70) return 'moyen';
    return 'élevé';
}

// ============================================
// KPI par machine
// ============================================
export function getMachineKPI(machineId: string): MachineKPI {
    // Look up in the static mock array. A machine added via the UI / Supabase
    // won't be here — we return a zeroed KPI in that case so the grid still
    // renders (no interventions exist for a brand-new machine anyway).
    const machine = machines.find(m => m.id === machineId);
    if (!machine) {
        return {
            machineId,
            machineName: '',
            machineCode: '',
            mtbf: 0,
            mttr: 0,
            availability: 100,
            totalCost: 0,
            breakdownCount: 0,
            totalDowntime: 0,
            criticalityScore: 0,
            criticalityLevel: 'faible',
        };
    }

    const machineInterventions = getInterventionsByMachine(machineId);
    const corrective = machineInterventions.filter(i => i.interventionType === 'corrective');

    const mtbf = calculateMTBF(machineId);
    const mttr = calculateMTTR(machineId);
    const availability = calculateAvailability(machineId);
    const totalCost = machineInterventions.reduce((s, i) => s + i.totalCost, 0);
    const totalDowntime = machineInterventions.reduce((s, i) => s + i.downtimeHours, 0);
    const criticalityScore = calculateCriticalityScore(machineId);

    return {
        machineId,
        machineName: machine.name,
        machineCode: machine.code,
        mtbf,
        mttr,
        availability,
        totalCost,
        breakdownCount: corrective.length,
        totalDowntime,
        criticalityScore,
        criticalityLevel: getCriticalityLevel(criticalityScore),
    };
}

// ============================================
// KPI globaux
// ============================================
export function getGlobalKPI(): GlobalKPI {
    const allKPIs = machines.map(m => getMachineKPI(m.id));
    const allTRS = machines.map(m => calculateTRS(m.id)).filter(t => t.trs > 0);

    return {
        totalMachines: machines.length,
        operationalMachines: machines.filter(m => m.status === 'opérationnelle').length,
        brokenMachines: machines.filter(m => m.status === 'en panne').length,
        inMaintenanceMachines: machines.filter(m => m.status === 'en maintenance').length,
        stoppedMachines: machines.filter(m => m.status === 'arrêtée').length,
        totalInterventions: interventions.length,
        ongoingInterventions: interventions.filter(i => i.status === 'en cours').length,
        completedInterventions: interventions.filter(i => i.status === 'terminée').length,
        avgMTBF: Math.round((allKPIs.reduce((s, k) => s + k.mtbf, 0) / allKPIs.length) * 10) / 10,
        avgMTTR: Math.round((allKPIs.reduce((s, k) => s + k.mttr, 0) / allKPIs.length) * 10) / 10,
        avgAvailability: Math.round((allKPIs.reduce((s, k) => s + k.availability, 0) / allKPIs.length) * 10) / 10,
        totalMaintenanceCost: allKPIs.reduce((s, k) => s + k.totalCost, 0),
        criticalMachines: allKPIs.filter(k => k.criticalityLevel === 'élevé').length,
        avgTRS: allTRS.length > 0 ? Math.round((allTRS.reduce((s, t) => s + t.trs, 0) / allTRS.length) * 10) / 10 : 0,
    };
}

// ============================================
// Recommandations intelligentes
// ============================================
export function getRecommendations(): Recommendation[] {
    const recommendations: Recommendation[] = [];

    machines.forEach(machine => {
        const kpi = getMachineKPI(machine.id);
        const trs = calculateTRS(machine.id);

        if (kpi.criticalityLevel === 'élevé') {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'critical', category: 'Criticité',
                message: 'Intervention prioritaire recommandée — criticité élevée',
                reasoning: `Score de criticité ${kpi.criticalityScore.toFixed(0)}/100 (seuil « élevé » ≥ 70). Calcul = fréquence des pannes × coût d'arrêt × niveau d'importance (${machine.importanceLevel}/10).`,
            });
        }

        if (kpi.mttr > 6) {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'warning', category: 'Maintenabilité',
                message: 'Améliorer la maintenabilité — MTTR élevé',
                reasoning: `MTTR = ${kpi.mttr.toFixed(1)} h, au-dessus du seuil acceptable de 6 h. Moyenne des temps de réparation sur les ${kpi.breakdownCount} pannes enregistrées.`,
            });
        }

        if (kpi.mtbf < 500) {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'warning', category: 'Fiabilité',
                message: 'Fiabilité faible — analyse des causes recommandée',
                reasoning: `MTBF = ${kpi.mtbf.toFixed(0)} h, en-dessous du seuil de fiabilité (500 h). Calcul = temps cumulé de bon fonctionnement / nombre de pannes.`,
            });
        }

        if (machine.hourlyDowntimeCost > 400) {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'info', category: 'Économique',
                message: 'Machine stratégique à surveiller — coût d\'arrêt élevé',
                reasoning: `Coût d'arrêt = ${machine.hourlyDowntimeCost} MAD/h (seuil stratégique > 400 MAD/h). Une heure d'arrêt = perte directe de production.`,
            });
        }

        if (trs.trs > 0 && trs.trs < 65) {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'warning', category: 'Performance',
                message: `TRS insuffisant (${trs.trs}%) — optimisation requise`,
                reasoning: `TRS = ${trs.availability}% × ${trs.performance}% × ${trs.quality}% = ${trs.trs}%. Seuil acceptable 65% (classe mondiale ≥ 85%). Levier dominant : ${[
                    { k: 'disponibilité', v: 100 - trs.availability },
                    { k: 'performance', v: 100 - trs.performance },
                    { k: 'qualité', v: 100 - trs.quality },
                ].sort((a, b) => b.v - a.v)[0].k}.`,
            });
        }

        if (kpi.availability < 90) {
            recommendations.push({
                machineId: machine.id, machineCode: machine.code, machineName: machine.name,
                level: 'warning', category: 'Disponibilité',
                message: `Disponibilité insuffisante (${kpi.availability}%) — plan d'action requis`,
                reasoning: `Disponibilité = MTBF / (MTBF + MTTR) = ${kpi.mtbf.toFixed(0)} / (${kpi.mtbf.toFixed(0)} + ${kpi.mttr.toFixed(1)}) = ${kpi.availability}%. Seuil minimum 90%.`,
            });
        }
    });

    // Trier : critical en premier
    return recommendations.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.level] - order[b.level];
    });
}

// ============================================
// Données pour graphiques dashboard
// ============================================
/** Rolling 6-month window ending at the current month — keeps the
 *  dashboard "live" so the bar chart always tracks the current calendar
 *  position instead of being stuck on a hard-coded year. */
export function getMonthlyBreakdowns(monthsBack = 6): { month: string; pannes: number; year: number; monthIndex: number }[] {
    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const now = new Date();
    const out: { month: string; pannes: number; year: number; monthIndex: number }[] = [];
    for (let k = monthsBack - 1; k >= 0; k--) {
        const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
        const mi = d.getMonth();
        const yr = d.getFullYear();
        const count = interventions.filter(int => {
            const id = new Date(int.startDate);
            return id.getMonth() === mi && id.getFullYear() === yr && int.interventionType === 'corrective';
        }).length;
        out.push({ month: labels[mi], pannes: count, year: yr, monthIndex: mi });
    }
    return out;
}

export function getInterventionsByType(): { type: string; count: number; color: string }[] {
    const types: { key: string; label: string; color: string }[] = [
        { key: 'corrective', label: 'Corrective', color: '#ef4444' },
        { key: 'préventive', label: 'Préventive', color: '#22c55e' },
        { key: 'conditionnelle', label: 'Conditionnelle', color: '#f59e0b' },
        { key: 'améliorative', label: 'Améliorative', color: '#3b82f6' },
    ];

    return types.map(t => ({
        type: t.label,
        count: interventions.filter(i => i.interventionType === t.key).length,
        color: t.color,
    }));
}

export function getCostByMachine(): { machine: string; coût: number }[] {
    return machines.map(m => ({
        machine: m.code,
        coût: getInterventionsByMachine(m.id).reduce((s, i) => s + i.totalCost, 0),
    }));
}

export function getTop5CriticalMachines(): MachineKPI[] {
    return machines
        .map(m => getMachineKPI(m.id))
        .sort((a, b) => b.criticalityScore - a.criticalityScore)
        .slice(0, 5);
}

export function getAvailabilityData(): { machine: string; disponibilité: number }[] {
    return machines.map(m => ({
        machine: m.code,
        disponibilité: calculateAvailability(m.id),
    }));
}
