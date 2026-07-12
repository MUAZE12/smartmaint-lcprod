'use client';

import { useEffect, useState } from 'react';
import { Calculator, Plus, Minus, X as Multiply, Divide, Trash2, Eye, Save, FileText } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { kpiFormulasDb } from '@/lib/db';
import { useToast } from '@/components/ui/Toast';

type Token = { type: 'variable' | 'operator' | 'number'; value: string; label: string };

// Variables disponibles pour construire un indicateur de maintenance agroalimentaire
const variables = [
    { value: 'total_downtime', label: 'Heures d’arrêt' },
    { value: 'total_interventions', label: 'Nb. interventions' },
    { value: 'spare_parts_cost', label: 'Coût pièces (MAD)' },
    { value: 'mtbf', label: 'MTBF (h)' },
    { value: 'mttr', label: 'MTTR (h)' },
    { value: 'availability', label: 'Disponibilité (%)' },
    { value: 'labor_cost', label: 'Coût main d’œuvre (MAD)' },
    { value: 'breakdown_count', label: 'Nb. pannes' },
];

const mockValues: Record<string, number> = {
    total_downtime: 48, total_interventions: 15, spare_parts_cost: 12500,
    mtbf: 168, mttr: 3.2, availability: 95.4, labor_cost: 8200, breakdown_count: 7,
};

const operators = [
    { symbol: '+', icon: Plus, label: '+' },
    { symbol: '-', icon: Minus, label: '−' },
    { symbol: '*', icon: Multiply, label: '×' },
    { symbol: '/', icon: Divide, label: '÷' },
];

export default function KPIFormulaBuilder() {
    const { showToast } = useToast();
    const { kpiFormulas } = useData();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [kpiName, setKpiName] = useState('Indicateur personnalisé');
    const [busy, setBusy] = useState(false);

    // Persist the current formula to Supabase
    const saveFormula = async () => {
        if (!kpiName.trim()) { showToast('Donnez un nom à l’indicateur', 'error'); return; }
        if (tokens.length === 0) { showToast('Construisez d’abord une formule', 'error'); return; }
        setBusy(true);
        try {
            await kpiFormulasDb.create({ name: kpiName.trim(), formula: JSON.stringify(tokens) });
            showToast('✅ Indicateur enregistré');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erreur', 'error');
        } finally { setBusy(false); }
    };
    // Load a saved formula back into the builder
    const loadFormula = (id: string) => {
        const f = kpiFormulas.find(x => x.id === id);
        if (!f) return;
        try {
            setTokens(JSON.parse(f.formula) as Token[]);
            setKpiName(f.name);
            showToast(`Indicateur « ${f.name} » chargé`);
        } catch { showToast('Formule illisible', 'error'); }
    };
    const deleteFormula = async (id: string) => {
        try { await kpiFormulasDb.remove(id); showToast('Indicateur supprimé', 'error'); }
        catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    };

    // Tutorial cleanup hook — the guided tour dispatches this event at the
    // end of its walk to delete the demo KPI it created. Without this, the
    // admin was left with "Coût horaire d'arrêt" as a permanent row in his
    // real KPI list after every replay.
    useEffect(() => {
        const handler = async (e: Event) => {
            const detail = (e as CustomEvent<{ name?: string }>).detail;
            const target = detail?.name?.trim().toLowerCase();
            if (!target) return;
            const victim = kpiFormulas.find(f => f.name.trim().toLowerCase() === target);
            if (!victim) return;
            try { await kpiFormulasDb.remove(victim.id); }
            catch { /* silent — tutorial cleanup should never toast an error */ }
        };
        window.addEventListener('smartmaint-demo-delete-kpi', handler);
        return () => window.removeEventListener('smartmaint-demo-delete-kpi', handler);
    }, [kpiFormulas]);

    const addVariable = (v: typeof variables[0]) => {
        setTokens(prev => [...prev, { type: 'variable', value: v.value, label: v.label }]);
    };

    const addOperator = (op: string) => {
        const labels: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
        setTokens(prev => [...prev, { type: 'operator', value: op, label: labels[op] || op }]);
    };

    const removeToken = (idx: number) => {
        setTokens(prev => prev.filter((_, i) => i !== idx));
    };

    const clearAll = () => setTokens([]);

    // Compute preview
    const computeResult = (): string => {
        if (tokens.length === 0) return '—';
        try {
            const expr = tokens.map(t => t.type === 'variable' ? String(mockValues[t.value] ?? 0) : t.value).join(' ');
            const result = new Function(`return (${expr})`)();
            return typeof result === 'number' && isFinite(result) ? result.toFixed(2) : 'Erreur';
        } catch {
            return 'Formule invalide';
        }
    };

    return (
        <div data-tour="kpi-builder" className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calculator size={18} color="#8b5cf6" />
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>KPI Formula Builder</h3>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* KPI Name */}
                <div data-tour="kpi-builder-name">
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                        Nom du KPI
                    </label>
                    <input className="input" value={kpiName} onChange={e => setKpiName(e.target.value)} />
                </div>

                {/* Variables dropdown */}
                <div data-tour="kpi-builder-vars">
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Variables
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {variables.map(v => (
                            <button key={v.value} onClick={() => addVariable(v)} style={{
                                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                background: '#ede9fe', color: '#7c3aed', border: 'none', cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
                                onMouseLeave={e => e.currentTarget.style.background = '#ede9fe'}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Operators */}
                <div data-tour="kpi-builder-ops">
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Opérateurs
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {operators.map(op => {
                            const Icon = op.icon;
                            return (
                                <button key={op.symbol} onClick={() => addOperator(op.symbol)} style={{
                                    width: 44, height: 44, borderRadius: 10,
                                    background: 'var(--surface-hover)', border: '1px solid var(--border)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = '#f5f3ff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                >
                                    <Icon size={18} color="#6d28d9" />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Formula display */}
                <div data-tour="kpi-builder-formula">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Formule</label>
                        {tokens.length > 0 && (
                            <button onClick={clearAll} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                <Trash2 size={12} /> Effacer
                            </button>
                        )}
                    </div>
                    <div style={{
                        minHeight: 56, padding: '12px 16px', borderRadius: 12,
                        background: 'var(--surface-hover)', border: '1px solid var(--border)',
                        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                    }}>
                        {tokens.length === 0 ? (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Cliquez sur les variables et opérateurs ci-dessus...</span>
                        ) : (
                            tokens.map((tok, i) => (
                                <span key={i} onClick={() => removeToken(i)} style={{
                                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    background: tok.type === 'variable' ? '#ede9fe' : tok.type === 'operator' ? '#f1f5f9' : '#e0f2fe',
                                    color: tok.type === 'variable' ? '#7c3aed' : tok.type === 'operator' ? '#475569' : '#0284c7',
                                    transition: 'opacity 0.15s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                    title="Cliquer pour supprimer"
                                >
                                    {tok.label}
                                </span>
                            ))
                        )}
                    </div>
                </div>

                {/* Preview */}
                <div data-tour="kpi-builder-preview" style={{
                    padding: 16, borderRadius: 12,
                    background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                    border: '1px solid #ddd6fe',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Eye size={14} color="#7c3aed" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6d28d9', textTransform: 'uppercase' }}>Aperçu</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{kpiName}</span>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>{computeResult()}</span>
                    </div>
                </div>

                {/* Save button */}
                <button onClick={saveFormula} disabled={busy} data-tour="kpi-builder-save" style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white',
                    border: 'none', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    <Save size={16} /> Enregistrer cet indicateur
                </button>

                {/* Saved formulas list */}
                <div data-tour="kpi-builder-saved">
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Indicateurs enregistrés ({kpiFormulas.length})
                    </label>
                    {kpiFormulas.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun indicateur sauvegardé pour le moment.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {kpiFormulas.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border-light)' }}>
                                    <FileText size={15} color="#7c3aed" />
                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                                    <button onClick={() => loadFormula(f.id)} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#ede9fe', color: '#7c3aed', border: 'none', cursor: 'pointer' }}>Charger</button>
                                    <button onClick={() => deleteFormula(f.id)} style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
