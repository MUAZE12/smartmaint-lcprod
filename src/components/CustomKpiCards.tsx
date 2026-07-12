'use client';

// Renders every custom formula the admin saved in the KPI Formula Builder
// against LIVE data — so the KPIs become useful, not just a stored recipe.
//
// Same variable names as the builder's palette:
//   total_downtime, total_interventions, spare_parts_cost,
//   mtbf, mttr, availability, labor_cost, breakdown_count.

import { useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';
import { getGlobalKPI } from '@/lib/calculations';
import { Calculator, Sparkles, Settings2 } from 'lucide-react';

interface Token { type: 'variable' | 'operator' | 'number'; value: string; label: string }

export default function CustomKpiCards() {
    const { kpiFormulas, interventions } = useData();

    // Compute the live values once — the KPI cards below reuse the same set.
    const vars: Record<string, number> = useMemo(() => {
        const g = getGlobalKPI();
        return {
            total_downtime: interventions.reduce((s, i) => s + (i.downtimeHours || 0), 0),
            total_interventions: interventions.length,
            spare_parts_cost: interventions.reduce((s, i) => s + (i.partsCost || 0), 0),
            mtbf: g.avgMTBF,
            mttr: g.avgMTTR,
            availability: g.avgAvailability,
            labor_cost: interventions.reduce((s, i) => s + (i.laborCost || 0), 0),
            breakdown_count: interventions.filter(i => i.interventionType === 'corrective').length,
        };
    }, [interventions]);

    if (kpiFormulas.length === 0) return null;

    return (
        <div data-tour="reports-custom-kpis" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <Sparkles size={16} color="#7c3aed" />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Mes indicateurs personnalisés</h3>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: 'rgba(139,92,246,0.15)', color: '#7c3aed' }}>{kpiFormulas.length}</span>
                <Link href="/settings" style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                    <Settings2 size={12} /> Gérer / créer
                </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {kpiFormulas.map(f => {
                    let value = '—';
                    let expr = '';
                    try {
                        const tokens = JSON.parse(f.formula) as Token[];
                        expr = tokens.map(t => t.type === 'variable' ? String(vars[t.value] ?? 0) : t.value).join(' ');
                        const result = new Function(`return (${expr})`)();
                        value = typeof result === 'number' && isFinite(result)
                            ? (Math.abs(result) >= 1000 ? Math.round(result).toLocaleString('fr-FR') : result.toFixed(2))
                            : 'Formule invalide';
                    } catch {
                        value = 'Formule illisible';
                    }
                    return (
                        <div key={f.id} data-tour="reports-custom-kpi-card" data-kpi-name={f.name} style={{
                            padding: 16, borderRadius: 14,
                            background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                            border: '1px solid #ddd6fe',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                <Calculator size={12} /> {f.name}
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: '#4c1d95', letterSpacing: '-0.02em' }}>{value}</div>
                            <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4, fontFamily: 'monospace', opacity: 0.7, wordBreak: 'break-word' }}>
                                {(() => {
                                    try {
                                        const tokens = JSON.parse(f.formula) as Token[];
                                        return tokens.map(t => t.label).join(' ');
                                    } catch { return f.formula; }
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
