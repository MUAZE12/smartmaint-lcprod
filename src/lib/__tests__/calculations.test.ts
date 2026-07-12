import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Machine, Intervention } from '../types';

// ============================================================
// Mock the ./data module BEFORE importing calculations.
// The functions in calculations.ts read machines/interventions from
// module scope; injecting fixtures via vi.mock is the cleanest seam
// without refactoring the calculation module itself.
// ============================================================
vi.mock('../data', () => {
    const now = new Date('2026-07-12T00:00:00Z');
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString();

    const machines: Machine[] = [
        {
            id: 'm1', code: 'POM-001', name: 'Pompe transfert huile', type: 'Pompe',
            workshop: 'Réception MP', location: 'Zone A', installationDate: oneYearAgo,
            status: 'opérationnelle', criticalityScore: 0, hourlyDowntimeCost: 400,
            importanceLevel: 8, createdAt: oneYearAgo,
        },
        {
            id: 'm2', code: 'FIL-002', name: 'Filtre cartouche', type: 'Filtration',
            workshop: 'Production', location: 'Zone B', installationDate: oneYearAgo,
            status: 'opérationnelle', criticalityScore: 0, hourlyDowntimeCost: 200,
            importanceLevel: 5, createdAt: oneYearAgo,
        },
        {
            id: 'm3', code: 'REM-003', name: 'Remplisseuse', type: 'Remplissage',
            workshop: 'Conditionnement', location: 'Zone C', installationDate: oneYearAgo,
            status: 'opérationnelle', criticalityScore: 0, hourlyDowntimeCost: 800,
            importanceLevel: 10, createdAt: oneYearAgo,
        },
    ];

    const interventions: Intervention[] = [
        // m1: 2 corrective failures totaling 4h downtime
        {
            id: 'i1', machineId: 'm1', technicianId: 't1', interventionType: 'corrective',
            description: 'Fuite garniture', probableCause: 'Usure', actionDone: 'Remplacement',
            startDate: '2026-02-01T08:00:00Z', endDate: '2026-02-01T10:00:00Z',
            downtimeHours: 2, laborCost: 300, partsCost: 150, downtimeCost: 800, totalCost: 1250,
            status: 'terminée', createdAt: '2026-02-01T08:00:00Z',
        },
        {
            id: 'i2', machineId: 'm1', technicianId: 't1', interventionType: 'corrective',
            description: 'Blocage', probableCause: 'Solides', actionDone: 'Nettoyage',
            startDate: '2026-04-01T08:00:00Z', endDate: '2026-04-01T10:00:00Z',
            downtimeHours: 2, laborCost: 300, partsCost: 0, downtimeCost: 800, totalCost: 1100,
            status: 'terminée', createdAt: '2026-04-01T08:00:00Z',
        },
        // m1: 1 preventive intervention (should NOT count in MTBF/MTTR)
        {
            id: 'i3', machineId: 'm1', technicianId: 't2', interventionType: 'préventive',
            description: 'Graissage', probableCause: 'Programme', actionDone: 'Graissage',
            startDate: '2026-05-01T08:00:00Z', endDate: '2026-05-01T09:00:00Z',
            downtimeHours: 1, laborCost: 150, partsCost: 50, downtimeCost: 400, totalCost: 600,
            status: 'terminée', createdAt: '2026-05-01T08:00:00Z',
        },
        // m2: no corrective failures → MTBF should be the "no-failure" sentinel
        {
            id: 'i4', machineId: 'm2', technicianId: 't1', interventionType: 'préventive',
            description: 'Remplacement cartouche', probableCause: 'Programme',
            actionDone: 'Remplacement', startDate: '2026-03-01T08:00:00Z',
            endDate: '2026-03-01T09:00:00Z', downtimeHours: 1, laborCost: 100, partsCost: 200,
            downtimeCost: 200, totalCost: 500, status: 'terminée',
            createdAt: '2026-03-01T08:00:00Z',
        },
        // m3: 1 corrective still IN PROGRESS (status != terminée) → should NOT count
        {
            id: 'i5', machineId: 'm3', technicianId: 't1', interventionType: 'corrective',
            description: 'Défaut dosage', probableCause: 'Buses encrassées',
            actionDone: 'Diagnostic', startDate: '2026-07-01T08:00:00Z', endDate: null,
            downtimeHours: 6, laborCost: 500, partsCost: 0, downtimeCost: 4800, totalCost: 5300,
            status: 'en cours', createdAt: '2026-07-01T08:00:00Z',
        },
    ];

    return {
        machines,
        interventions,
        productionMetrics: [] as any[],
        getInterventionsByMachine: (id: string) => interventions.filter(i => i.machineId === id),
        getProductionMetricsByMachine: (_id: string) => [] as any[],
    };
});

// Import AFTER the mock is defined so calculations.ts picks up the mock.
import {
    calculateMTBF,
    calculateMTTR,
    calculateAvailability,
    calculateInterventionCost,
    calculateCriticalityScore,
    getCriticalityLevel,
    getMachineKPI,
} from '../calculations';

// ============================================================
// getCriticalityLevel — pure function, no dependencies
// ============================================================
describe('getCriticalityLevel', () => {
    it('returns "faible" for score 0', () => {
        expect(getCriticalityLevel(0)).toBe('faible');
    });

    it('returns "faible" at the upper boundary (40)', () => {
        expect(getCriticalityLevel(40)).toBe('faible');
    });

    it('returns "moyen" just above the "faible" threshold (40.1)', () => {
        expect(getCriticalityLevel(40.1)).toBe('moyen');
    });

    it('returns "moyen" at the upper boundary (70)', () => {
        expect(getCriticalityLevel(70)).toBe('moyen');
    });

    it('returns "élevé" just above the "moyen" threshold (70.1)', () => {
        expect(getCriticalityLevel(70.1)).toBe('élevé');
    });

    it('returns "élevé" for score 100', () => {
        expect(getCriticalityLevel(100)).toBe('élevé');
    });
});

// ============================================================
// calculateInterventionCost — pure function taking parameters
// ============================================================
describe('calculateInterventionCost', () => {
    const machine: Machine = {
        id: 'm-x', code: 'X', name: 'test', type: 'Pompe', workshop: 'W',
        location: 'L', installationDate: '2025-01-01', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 500, importanceLevel: 5,
        createdAt: '2025-01-01',
    };

    const baseIntervention: Intervention = {
        id: 'i-x', machineId: 'm-x', technicianId: 't', interventionType: 'corrective',
        description: '', probableCause: '', actionDone: '', startDate: '2026-01-01',
        endDate: '2026-01-01', downtimeHours: 0, laborCost: 0, partsCost: 0,
        downtimeCost: 0, totalCost: 0, status: 'terminée', createdAt: '2026-01-01',
    };

    it('sums labor + parts + (downtime × hourly downtime cost)', () => {
        const intervention = { ...baseIntervention, laborCost: 300, partsCost: 150, downtimeHours: 2 };
        // 300 + 150 + 2*500 = 1450
        expect(calculateInterventionCost(intervention, machine)).toBe(1450);
    });

    it('returns 0 when all costs and downtime are 0', () => {
        expect(calculateInterventionCost(baseIntervention, machine)).toBe(0);
    });

    it('handles fractional downtime hours', () => {
        const intervention = { ...baseIntervention, laborCost: 100, downtimeHours: 0.5 };
        // 100 + 0 + 0.5*500 = 350
        expect(calculateInterventionCost(intervention, machine)).toBe(350);
    });
});

// ============================================================
// calculateMTBF — uses mocked interventions/machines
// ============================================================
describe('calculateMTBF', () => {
    it('returns the "no-failure" sentinel (999) when the machine has no corrective failures', () => {
        // m2 has only a preventive intervention → no corrective → sentinel
        expect(calculateMTBF('m2')).toBe(999);
    });

    it('returns the "no-failure" sentinel when the only corrective is not yet terminée', () => {
        // m3 has one corrective but status = "en cours" — should be treated as no failure
        expect(calculateMTBF('m3')).toBe(999);
    });

    it('returns the sentinel for an unknown machine (no interventions = no failures)', () => {
        // Unknown machines have no interventions, so the "no corrective failures"
        // branch fires FIRST and returns 999 — before the machine-not-found check.
        // (Documenting existing behaviour: getMachineKPI() is the safer read-model
        // for unknown machines and returns a zeroed KPI with availability: 100.)
        expect(calculateMTBF('nonexistent')).toBe(999);
    });

    it('returns a positive finite number for a machine with recorded failures', () => {
        // m1 has 2 corrective failures totaling 4h downtime — MTBF must be > 0 and finite
        const mtbf = calculateMTBF('m1');
        expect(mtbf).toBeGreaterThan(0);
        expect(Number.isFinite(mtbf)).toBe(true);
    });
});

// ============================================================
// calculateMTTR — uses mocked interventions
// ============================================================
describe('calculateMTTR', () => {
    it('averages downtime across ONLY corrective terminée interventions', () => {
        // m1: two corrective failures, 2h each → MTTR = 2h exactly.
        // The 1h preventive on m1 must NOT be included in the average.
        expect(calculateMTTR('m1')).toBe(2);
    });

    it('returns 0 when there are no corrective failures at all', () => {
        expect(calculateMTTR('m2')).toBe(0);
    });

    it('returns 0 when the only corrective is still in progress', () => {
        // The "en cours" corrective on m3 must be filtered out
        expect(calculateMTTR('m3')).toBe(0);
    });
});

// ============================================================
// calculateAvailability — depends on MTBF + MTTR
// ============================================================
describe('calculateAvailability', () => {
    it('returns a value between 0 and 100 for a machine with failures', () => {
        const availability = calculateAvailability('m1');
        expect(availability).toBeGreaterThanOrEqual(0);
        expect(availability).toBeLessThanOrEqual(100);
    });

    it('returns 100 when there are no failures (MTTR = 0)', () => {
        // m2: no corrective failures → MTBF sentinel 999, MTTR = 0 → 999/(999+0)*100 = 100
        expect(calculateAvailability('m2')).toBe(100);
    });
});

// ============================================================
// calculateCriticalityScore — normalized across all machines
// ============================================================
describe('calculateCriticalityScore', () => {
    it('returns 0 for an unknown machine id', () => {
        expect(calculateCriticalityScore('nonexistent')).toBe(0);
    });

    it('returns a score in [0, 100] for a known machine', () => {
        const score = calculateCriticalityScore('m1');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });
});

// ============================================================
// getMachineKPI — the public read-model for the UI
// ============================================================
describe('getMachineKPI', () => {
    it('returns a zeroed KPI (100% availability) for an unknown machine — safe UI default', () => {
        const kpi = getMachineKPI('nonexistent');
        expect(kpi.mtbf).toBe(0);
        expect(kpi.mttr).toBe(0);
        expect(kpi.availability).toBe(100);
        expect(kpi.breakdownCount).toBe(0);
        expect(kpi.criticalityLevel).toBe('faible');
    });

    it('assembles machine name + code + MTBF/MTTR into a single object', () => {
        const kpi = getMachineKPI('m1');
        expect(kpi.machineName).toBe('Pompe transfert huile');
        expect(kpi.machineCode).toBe('POM-001');
        expect(kpi.breakdownCount).toBe(2); // 2 corrective terminée on m1
        expect(kpi.totalDowntime).toBe(5);  // 2 + 2 + 1 (préventive counts in totalDowntime)
    });
});
