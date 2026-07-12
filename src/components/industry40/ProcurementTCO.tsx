'use client';

import { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ShoppingCart, AlertTriangle, TrendingDown } from 'lucide-react';

// Pièces des machines de la ligne d'huiles alimentaires suivies en prévision d'approvisionnement
export const forecastData = [
    { name: 'Cartouche filtrante huile 10µm', stock: 12, burnRate: 1.5, leadTime: 7, reorderPoint: 15, supplier: 'Filtration Maroc' },
    { name: 'Joint sanitaire EPDM remplisseuse', stock: 4, burnRate: 0.8, leadTime: 5, reorderPoint: 6, supplier: 'Tetra Pak Maroc' },
    { name: 'Roulement à billes SKF 6205', stock: 8, burnRate: 0.3, leadTime: 14, reorderPoint: 7, supplier: 'SKF Maroc' },
    { name: 'Buse de remplissage volumétrique', stock: 2, burnRate: 0.1, leadTime: 21, reorderPoint: 4, supplier: 'Électro-Mécanique du Gharb' },
    { name: 'Bouchon doseur 5L (consommable)', stock: 30, burnRate: 2.0, leadTime: 3, reorderPoint: 10, supplier: 'Plastima Casablanca' },
    { name: 'Garniture mécanique pompe huile', stock: 50, burnRate: 5.0, leadTime: 4, reorderPoint: 25, supplier: 'Grundfos Maroc' },
];

export const tcoData = [
    { category: 'REM-001', CapEx: 45000, SpareParts: 12500, Labor: 8200, DowntimeLoss: 18400 },
    { category: 'POM-001', CapEx: 38000, SpareParts: 9800, Labor: 6100, DowntimeLoss: 12200 },
    { category: 'CNV-001', CapEx: 52000, SpareParts: 7200, Labor: 5400, DowntimeLoss: 8600 },
    { category: 'CHD-001', CapEx: 41000, SpareParts: 14300, Labor: 9800, DowntimeLoss: 22100 },
];

export default function ProcurementTCO() {
    const [selectedMachine, setSelectedMachine] = useState('REM-001');
    const machineData = tcoData.find(d => d.category === selectedMachine) || tcoData[0];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Procurement Forecasting Table */}
            <div data-tour="reports-tco-forecast" className="card" style={{ padding: 0 }}>
                <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShoppingCart size={18} color="#3b82f6" />
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Prévision des approvisionnements</h3>
                </div>
                <div className="table-container" style={{ border: 'none' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Pièce</th>
                                <th>Stock actuel</th>
                                <th>Conso. moy./jour</th>
                                <th>Délai fournisseur</th>
                                <th>Seuil de réappro.</th>
                                <th>Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {forecastData.map((item, idx) => {
                                const isCritical = item.stock <= item.reorderPoint;
                                const daysLeft = item.burnRate > 0 ? Math.floor(item.stock / item.burnRate) : 999;
                                // Force dark text on critical rows — the pink background is
                                // hard-coded (#fef2f2), so if we leave text at var(--text-primary)
                                // it renders near-white in dark mode = unreadable.
                                const rowFg = isCritical ? '#0f172a' : 'var(--text-primary)';
                                const rowMuted = isCritical ? '#475569' : 'var(--text-muted)';
                                return (
                                    <tr key={idx} style={{ background: isCritical ? '#fef2f2' : undefined, color: rowFg }}>
                                        <td style={{ color: rowFg }}>
                                            <div style={{ fontWeight: 600, color: rowFg }}>{item.name}</div>
                                            <div style={{ fontSize: 11, color: rowMuted }}>{item.supplier}</div>
                                        </td>
                                        <td style={{ color: rowFg }}>
                                            <span style={{ fontWeight: 700, color: isCritical ? '#ef4444' : rowFg }}>
                                                {item.stock}
                                            </span>
                                        </td>
                                        <td style={{ color: rowFg }}>{item.burnRate}/jour</td>
                                        <td style={{ color: rowFg }}>{item.leadTime} jours</td>
                                        <td>
                                            <span style={{
                                                fontWeight: 700,
                                                color: isCritical ? '#ef4444' : '#22c55e',
                                            }}>
                                                {item.reorderPoint}
                                            </span>
                                        </td>
                                        <td>
                                            {isCritical ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: '#fef2f2', color: '#ef4444' }}>
                                                    <AlertTriangle size={12} /> Commander ({daysLeft}j)
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#f0fdf4', color: '#22c55e' }}>
                                                    OK ({daysLeft}j)
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* TCO Card */}
            <div data-tour="reports-tco-card" className="card" style={{ padding: 0 }}>
                <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingDown size={18} color="#8b5cf6" /> Coût total de possession (TCO) par machine
                    </h3>
                    <select
                        className="select"
                        value={selectedMachine}
                        onChange={e => setSelectedMachine(e.target.value)}
                        style={{ width: 'auto', fontSize: 13 }}
                    >
                        {tcoData.map(d => (
                            <option key={d.category} value={d.category}>{d.category}</option>
                        ))}
                    </select>
                </div>
                <div className="card-body">
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: 'Investissement', value: machineData.CapEx, color: '#3b82f6' },
                            { label: 'Pièces de rechange', value: machineData.SpareParts, color: '#f59e0b' },
                            { label: 'Main d’œuvre', value: machineData.Labor, color: '#22c55e' },
                            { label: 'Pertes d’arrêt', value: machineData.DowntimeLoss, color: '#ef4444' },
                        ].map((item, i) => (
                            <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-hover)', textAlign: 'center' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{(item.value / 1000).toFixed(1)}k</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>MAD</div>
                            </div>
                        ))}
                    </div>

                    {/* Stacked Bar Chart */}
                    <div style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tcoData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(value) => `${Number(value).toLocaleString('fr-FR')} MAD`} />
                                <Legend />
                                <Bar dataKey="CapEx" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} name="Investissement" />
                                <Bar dataKey="SpareParts" stackId="a" fill="#f59e0b" name="Pièces de rechange" />
                                <Bar dataKey="Labor" stackId="a" fill="#22c55e" name="Main d’œuvre" />
                                <Bar dataKey="DowntimeLoss" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} name="Pertes d’arrêt" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
