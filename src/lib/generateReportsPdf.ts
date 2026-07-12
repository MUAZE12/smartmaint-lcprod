// ============================================================
// Reports-page PDF generator — draws every chart directly from raw
// data via reportPdf.ts primitives. No DOM snapshot, no library that
// tries to rasterize Recharts SVGs. Charts always show because they
// are drawn by jsPDF itself.
// ============================================================

import {
    newDoc, docHeader, sectionHeader, paragraph, kpiRow,
    barChart, pieChart, lineChart, dataTable, saveAs,
} from './reportPdf';

interface ReportInput {
    activeTab: string;
    atelier: string;
    kpi: {
        avgTRS: number; avgMTTR: number; avgMTBF: number;
        avgAvailability: number; totalMaintenanceCost: number;
    };
    oeeTrend: { day: number; label?: string; value: number }[];
    mttrTrend: { day: number; label?: string; value: number }[];
    mtbfTrend: { day: number; label?: string; value: number }[];
    tcoData: { category: string; CapEx: number; SpareParts: number; Labor: number; DowntimeLoss: number }[];
    forecastData: { name: string; stock: number; burnRate: number; leadTime: number; reorderPoint: number; supplier: string }[];
    paretoData: { cause: string; count: number; cumulative: number }[];
    paretoTotal: number;
    vitalFew: number;
    machines: { id: string; name: string; workshop?: string; criticality?: string; status?: string }[];
    machineKpis: { id: string; mtbf: number; mttr: number; availability: number; totalCost: number }[];
    recommendations: { title: string; description: string; priority?: string }[];
    interventionsByType?: { corrective: number; preventive: number; predictive: number };
}

const TAB_LABEL: Record<string, string> = {
    analytics: 'Vue d’ensemble',
    fmd: 'Analyse FMD',
    economic: 'Analyse Économique',
    tpm: 'Analyse TPM / TRS',
    criticality: 'Machines Critiques',
    recommendations: 'Recommandations IA',
    spc: 'Contrôle SPC',
    pareto: 'Causes de pannes',
    tco: 'TCO & Achats',
};

export function generateReportsPdf(input: ReportInput) {
    const c = newDoc();
    const dateStr = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    docHeader(
        c,
        'SmartMaint — L.C PROD · Rapport de maintenance',
        `${TAB_LABEL[input.activeTab] || 'Rapport'} · ${input.atelier === 'all' ? 'Tous les ateliers' : input.atelier} · Édité le ${dateStr}`,
    );

    sectionHeader(c, 'Indicateurs clés', '#06b6d4');
    kpiRow(c, [
        { label: 'TRS moyen', value: String(input.kpi.avgTRS), unit: '%', color: '#06b6d4' },
        { label: 'MTTR moyen', value: String(input.kpi.avgMTTR), unit: 'h', color: '#f97316' },
        { label: 'MTBF moyen', value: String(input.kpi.avgMTBF), unit: 'h', color: '#22c55e' },
        { label: 'Disponibilité', value: String(input.kpi.avgAvailability), unit: '%', color: '#3b82f6' },
    ]);
    kpiRow(c, [
        { label: 'Coût total maintenance', value: (input.kpi.totalMaintenanceCost / 1000).toFixed(1), unit: 'k MAD', color: '#ef4444' },
        { label: 'Machines actives', value: String(input.machines.length), color: '#8b5cf6' },
        { label: 'Machines critiques', value: String(input.machines.filter(m => m.criticality === 'élevé').length), color: '#dc2626' },
        { label: 'Machines en panne', value: String(input.machines.filter(m => m.status === 'en panne').length), color: '#f59e0b' },
    ]);

    switch (input.activeTab) {
        case 'analytics':   drawAnalytics(c, input); break;
        case 'fmd':         drawFmd(c, input); break;
        case 'economic':    drawEconomic(c, input); break;
        case 'tpm':         drawTpm(c, input); break;
        case 'criticality': drawCriticality(c, input); break;
        case 'recommendations': drawRecommendations(c, input); break;
        case 'spc':         drawSpc(c, input); break;
        case 'pareto':      drawPareto(c, input); break;
        case 'tco':         drawTco(c, input); break;
    }

    saveAs(c, `smartmaint-rapport-${input.activeTab}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return { ok: true };
}

function drawAnalytics(c: ReturnType<typeof newDoc>, input: ReportInput) {
    const rangeLabel = input.oeeTrend.length === 12 ? '12 derniers mois' : '30 derniers jours';
    sectionHeader(c, `Tendance TRS — ${rangeLabel}`, '#06b6d4');
    lineChart(c, {
        xLabels: input.oeeTrend.map(d => d.label ?? `J${d.day}`),
        series: [{ name: 'TRS (%)', values: input.oeeTrend.map(d => d.value), color: '#06b6d4', area: true }],
        heightMm: 55,
        valueFormatter: (v) => v.toFixed(0) + '%',
    });

    sectionHeader(c, `Tendance MTTR / MTBF — ${rangeLabel}`, '#22c55e');
    lineChart(c, {
        xLabels: input.mttrTrend.map(d => d.label ?? `J${d.day}`),
        series: [
            { name: 'MTTR (h)', values: input.mttrTrend.map(d => d.value), color: '#f97316' },
            { name: 'MTBF (h)', values: input.mtbfTrend.map(d => d.value), color: '#22c55e' },
        ],
        heightMm: 55,
    });

    if (input.interventionsByType) {
        sectionHeader(c, 'Répartition des interventions par type', '#8b5cf6');
        pieChart(c, {
            slices: [
                { label: 'Correctives', value: input.interventionsByType.corrective, color: '#ef4444' },
                { label: 'Préventives', value: input.interventionsByType.preventive, color: '#22c55e' },
                { label: 'Prédictives', value: input.interventionsByType.predictive, color: '#3b82f6' },
            ],
            valueFormatter: v => String(v),
        });
    }
}

function drawFmd(c: ReturnType<typeof newDoc>, input: ReportInput) {
    sectionHeader(c, 'Fiabilité — MTBF par machine', '#22c55e');
    const topMtbf = [...input.machineKpis]
        .map((k) => ({ ...k, name: input.machines.find(m => m.id === k.id)?.name || k.id }))
        .filter(k => k.mtbf > 0).sort((a, b) => b.mtbf - a.mtbf).slice(0, 10);
    if (topMtbf.length) {
        barChart(c, {
            labels: topMtbf.map(k => k.name.slice(0, 12)),
            series: [{ name: 'MTBF (h)', values: topMtbf.map(k => k.mtbf), color: '#22c55e' }],
            heightMm: 65, valueFormatter: v => v.toFixed(0) + 'h',
        });
    }

    sectionHeader(c, 'Maintenabilité — MTTR par machine', '#f97316');
    const topMttr = [...input.machineKpis]
        .map((k) => ({ ...k, name: input.machines.find(m => m.id === k.id)?.name || k.id }))
        .filter(k => k.mttr > 0).sort((a, b) => b.mttr - a.mttr).slice(0, 10);
    if (topMttr.length) {
        barChart(c, {
            labels: topMttr.map(k => k.name.slice(0, 12)),
            series: [{ name: 'MTTR (h)', values: topMttr.map(k => k.mttr), color: '#f97316' }],
            heightMm: 65, valueFormatter: v => v.toFixed(1) + 'h',
        });
    }

    sectionHeader(c, 'Disponibilité par machine', '#3b82f6');
    const topAvail = [...input.machineKpis]
        .map((k) => ({ ...k, name: input.machines.find(m => m.id === k.id)?.name || k.id }))
        .sort((a, b) => b.availability - a.availability).slice(0, 10);
    barChart(c, {
        labels: topAvail.map(k => k.name.slice(0, 12)),
        series: [{ name: 'Disponibilité (%)', values: topAvail.map(k => k.availability), color: '#3b82f6' }],
        heightMm: 65, valueFormatter: v => v.toFixed(0) + '%',
    });
}

function drawEconomic(c: ReturnType<typeof newDoc>, input: ReportInput) {
    sectionHeader(c, 'Coût de maintenance par machine — Top 10', '#ef4444');
    const topCost = [...input.machineKpis]
        .map((k) => ({ ...k, name: input.machines.find(m => m.id === k.id)?.name || k.id }))
        .filter(k => k.totalCost > 0).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);
    if (topCost.length) {
        barChart(c, {
            labels: topCost.map(k => k.name.slice(0, 12)),
            series: [{ name: 'Coût (MAD)', values: topCost.map(k => k.totalCost), color: '#ef4444' }],
            heightMm: 65, valueFormatter: v => (v / 1000).toFixed(1) + 'k',
        });
    }

    if (input.interventionsByType) {
        sectionHeader(c, 'Répartition des coûts par type d\'intervention', '#8b5cf6');
        const totalCost = input.kpi.totalMaintenanceCost || 1;
        const totalInt = Math.max(1, input.interventionsByType.corrective + input.interventionsByType.preventive + input.interventionsByType.predictive);
        pieChart(c, {
            slices: [
                { label: 'Correctives', value: totalCost * (input.interventionsByType.corrective / totalInt), color: '#ef4444' },
                { label: 'Préventives', value: totalCost * (input.interventionsByType.preventive / totalInt), color: '#22c55e' },
                { label: 'Prédictives', value: totalCost * (input.interventionsByType.predictive / totalInt), color: '#3b82f6' },
            ],
            valueFormatter: v => (v / 1000).toFixed(1) + 'k MAD',
        });
    }

    sectionHeader(c, 'Détail par machine (10 plus coûteuses)', '#64748b');
    if (topCost.length) {
        dataTable(c, {
            columns: ['Machine', 'Coût total (MAD)', 'MTTR (h)', 'Disponibilité (%)'],
            rows: topCost.map(k => [k.name, k.totalCost.toLocaleString('fr-FR'), k.mttr.toFixed(1), k.availability.toFixed(1) + ' %']),
        });
    }
}

function drawTpm(c: ReturnType<typeof newDoc>, input: ReportInput) {
    const rangeLabel = input.oeeTrend.length === 12 ? '12 mois' : '30 jours';
    sectionHeader(c, `TRS moyen — tendance ${rangeLabel}`, '#06b6d4');
    lineChart(c, {
        xLabels: input.oeeTrend.map(d => d.label ?? `J${d.day}`),
        series: [{ name: 'TRS (%)', values: input.oeeTrend.map(d => d.value), color: '#06b6d4', area: true }],
        heightMm: 60, valueFormatter: v => v.toFixed(0) + '%',
    });

    sectionHeader(c, 'Disponibilité par machine (Top 15)', '#3b82f6');
    const topAvail = [...input.machineKpis]
        .map((k) => ({ ...k, name: input.machines.find(m => m.id === k.id)?.name || k.id }))
        .sort((a, b) => b.availability - a.availability).slice(0, 15);
    barChart(c, {
        labels: topAvail.map(k => k.name.slice(0, 10)),
        series: [{ name: 'Disponibilité (%)', values: topAvail.map(k => k.availability), color: '#3b82f6' }],
        heightMm: 70, valueFormatter: v => v.toFixed(0) + '%',
    });
}

function drawCriticality(c: ReturnType<typeof newDoc>, input: ReportInput) {
    const buckets = {
        'Élevée': input.machines.filter(m => m.criticality === 'élevé').length,
        'Moyenne': input.machines.filter(m => m.criticality === 'moyen').length,
        'Faible': input.machines.filter(m => m.criticality === 'faible' || !m.criticality).length,
    };
    sectionHeader(c, 'Répartition des machines par criticité', '#ef4444');
    pieChart(c, {
        slices: [
            { label: 'Élevée', value: buckets['Élevée'], color: '#ef4444' },
            { label: 'Moyenne', value: buckets['Moyenne'], color: '#f59e0b' },
            { label: 'Faible', value: buckets['Faible'], color: '#22c55e' },
        ],
    });
    sectionHeader(c, 'Machines à criticité élevée', '#dc2626');
    const critical = input.machines.filter(m => m.criticality === 'élevé');
    if (critical.length) {
        dataTable(c, {
            columns: ['Machine', 'Atelier', 'Statut'],
            rows: critical.map(m => [m.name, m.workshop ?? '—', m.status ?? '—']),
        });
    } else {
        paragraph(c, 'Aucune machine critique dans le filtre courant.');
    }
}

function drawRecommendations(c: ReturnType<typeof newDoc>, input: ReportInput) {
    sectionHeader(c, 'Recommandations générées par l\'IA', '#8b5cf6');
    if (!input.recommendations.length) { paragraph(c, 'Aucune recommandation active pour le filtre courant.'); return; }
    for (const r of input.recommendations.slice(0, 15)) {
        paragraph(c, `▸ ${r.title}${r.priority ? ' (' + r.priority + ')' : ''}`, { size: 11, color: '#0f172a' });
        paragraph(c, r.description, { size: 9, color: '#475569' });
    }
}

function drawSpc(c: ReturnType<typeof newDoc>, input: ReportInput) {
    const rangeLabel = input.oeeTrend.length === 12 ? '12 mois' : '30 jours';
    sectionHeader(c, `Contrôle statistique — TRS ${rangeLabel}`, '#06b6d4');
    const values = input.oeeTrend.map(d => d.value);
    const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
    const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length));
    const ucl = mean + 2 * stdDev;
    const lcl = Math.max(0, mean - 2 * stdDev);
    lineChart(c, {
        xLabels: input.oeeTrend.map(d => d.label ?? `J${d.day}`),
        series: [
            { name: 'TRS', values, color: '#06b6d4' },
            { name: 'UCL', values: values.map(() => ucl), color: '#ef4444' },
            { name: 'LCL', values: values.map(() => lcl), color: '#f59e0b' },
            { name: 'Moyenne', values: values.map(() => mean), color: '#22c55e' },
        ],
        heightMm: 70, valueFormatter: v => v.toFixed(0) + '%',
    });
    paragraph(c, `Moyenne: ${mean.toFixed(1)}%  ·  UCL: ${ucl.toFixed(1)}%  ·  LCL: ${lcl.toFixed(1)}%  ·  Écart-type: ${stdDev.toFixed(2)}`, { size: 10 });
}

function drawPareto(c: ReturnType<typeof newDoc>, input: ReportInput) {
    sectionHeader(c, 'Pareto — Causes de pannes', '#ef4444');
    if (!input.paretoData.length) { paragraph(c, 'Aucune donnée de panne pour le filtre courant.'); return; }
    const top = input.paretoData.slice(0, 12);
    barChart(c, {
        labels: top.map(p => (p.cause.length > 14 ? p.cause.slice(0, 12) + '…' : p.cause)),
        series: [{ name: 'Nombre', values: top.map(p => p.count), color: '#ef4444' }],
        heightMm: 65, valueFormatter: v => v.toFixed(0),
    });
    paragraph(c, `${input.vitalFew} causes couvrent 80% des pannes (règle 80/20).`, { size: 10, color: '#334155' });
    sectionHeader(c, 'Détail des causes', '#64748b');
    dataTable(c, {
        columns: ['Cause', 'Nombre', '% cumulé'],
        rows: input.paretoData.map(p => [p.cause, p.count, p.cumulative + ' %']),
    });
}

function drawTco(c: ReturnType<typeof newDoc>, input: ReportInput) {
    sectionHeader(c, 'Prévisions des approvisionnements', '#3b82f6');
    dataTable(c, {
        columns: ['Pièce', 'Stock', 'Conso/j', 'Délai', 'Seuil', 'Fournisseur', 'Statut'],
        rows: input.forecastData.map(item => {
            const daysLeft = item.burnRate > 0 ? Math.floor(item.stock / item.burnRate) : 999;
            const critical = item.stock <= item.reorderPoint;
            return [item.name, item.stock, item.burnRate, item.leadTime + ' j', item.reorderPoint, item.supplier,
                critical ? `À commander (${daysLeft} j)` : `OK (${daysLeft} j)`];
        }),
        highlight: (i) => input.forecastData[i].stock <= input.forecastData[i].reorderPoint,
    });
    sectionHeader(c, 'Coût total de possession par machine', '#8b5cf6');
    barChart(c, {
        labels: input.tcoData.map(d => d.category),
        series: [
            { name: 'Investissement', values: input.tcoData.map(d => d.CapEx), color: '#3b82f6' },
            { name: 'Pièces de rechange', values: input.tcoData.map(d => d.SpareParts), color: '#f59e0b' },
            { name: 'Main d’œuvre', values: input.tcoData.map(d => d.Labor), color: '#22c55e' },
            { name: 'Pertes d’arrêt', values: input.tcoData.map(d => d.DowntimeLoss), color: '#ef4444' },
        ],
        stacked: true, heightMm: 75, valueFormatter: v => (v / 1000).toFixed(0) + 'k MAD',
    });
    const totalByCategory = input.tcoData.reduce(
        (s, d) => ({ CapEx: s.CapEx + d.CapEx, SpareParts: s.SpareParts + d.SpareParts, Labor: s.Labor + d.Labor, DowntimeLoss: s.DowntimeLoss + d.DowntimeLoss }),
        { CapEx: 0, SpareParts: 0, Labor: 0, DowntimeLoss: 0 },
    );
    sectionHeader(c, 'Répartition globale du TCO', '#8b5cf6');
    pieChart(c, {
        slices: [
            { label: 'Investissement', value: totalByCategory.CapEx, color: '#3b82f6' },
            { label: 'Pièces de rechange', value: totalByCategory.SpareParts, color: '#f59e0b' },
            { label: 'Main d’œuvre', value: totalByCategory.Labor, color: '#22c55e' },
            { label: 'Pertes d’arrêt', value: totalByCategory.DowntimeLoss, color: '#ef4444' },
        ],
        valueFormatter: v => (v / 1000).toFixed(1) + 'k MAD',
    });
}
