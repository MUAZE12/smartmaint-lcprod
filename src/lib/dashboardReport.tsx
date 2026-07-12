// ============================================================
// Power BI-style PDF report — generated from the live dashboard.
// Lazy-imported by the dashboard so @react-pdf/renderer's ~200KB
// bundle never lands in the initial page payload.
//
// Layout (Power BI report conventions):
//   p1  Cover                — title, period, signature
//   p2  Executive summary    — KPI tiles + action backlog
//   p3  Pannes par mois      — table + horizontal bars
//   p4  Top 5 criticité      — bar chart (text)
//   p5  Coût par machine     — ranked table
//   p6  Notes / méthodologie
// ============================================================
import { pdf, Document, Page, Text, View, StyleSheet, Svg, Rect } from '@react-pdf/renderer';

// ── Power BI inspired palette (navy + orange accent, 60-30-10) ──
const palette = {
    navy: '#0f172a',
    navy700: '#334155',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    border: '#e2e8f0',
    text: '#0f172a',
    textMuted: '#64748b',
    accent: '#f97316',      // primary CTA / highlight
    accentDark: '#ea580c',
    green: '#10b981',
    red: '#ef4444',
    amber: '#f59e0b',
    blue: '#3b82f6',
    purple: '#8b5cf6',
};

const styles = StyleSheet.create({
    page: {
        padding: 32,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: palette.text,
        backgroundColor: '#ffffff',
    },
    coverPage: {
        padding: 0,
        backgroundColor: palette.navy,
        color: '#ffffff',
        fontFamily: 'Helvetica',
        position: 'relative',
    },
    coverBand: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 6,
        backgroundColor: palette.accent,
    },
    coverInner: {
        padding: 64,
        flexGrow: 1,
        justifyContent: 'space-between',
        height: '100%',
    },
    coverEyebrow: {
        fontSize: 10,
        color: palette.accent,
        letterSpacing: 3,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 18,
    },
    coverTitle: {
        fontSize: 38,
        fontFamily: 'Helvetica-Bold',
        lineHeight: 1.1,
        marginBottom: 14,
    },
    coverSub: {
        fontSize: 13,
        color: '#cbd5e1',
        lineHeight: 1.5,
        maxWidth: 380,
    },
    coverMeta: {
        flexDirection: 'row',
        gap: 20,
        marginTop: 36,
    },
    coverMetaItem: {
        flexGrow: 0,
        flexShrink: 0,
    },
    coverMetaLabel: {
        fontSize: 9,
        color: palette.accent,
        letterSpacing: 1.5,
        marginBottom: 4,
        fontFamily: 'Helvetica-Bold',
    },
    coverMetaValue: {
        fontSize: 13,
        color: '#ffffff',
        fontFamily: 'Helvetica-Bold',
    },
    coverFooter: {
        position: 'absolute',
        bottom: 32, left: 64, right: 64,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 9,
        color: '#94a3b8',
    },

    pageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
        paddingBottom: 10,
        borderBottom: `1pt solid ${palette.border}`,
    },
    pageHeaderTitle: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: palette.text,
    },
    pageHeaderSub: {
        fontSize: 8,
        color: palette.textMuted,
        letterSpacing: 1,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
    },

    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    kpiCard: {
        flexGrow: 1, flexBasis: 0,
        padding: 12,
        borderRadius: 6,
        backgroundColor: palette.surfaceMuted,
        border: `1pt solid ${palette.border}`,
    },
    kpiAccent: { height: 3, marginBottom: 8, borderRadius: 3 },
    kpiLabel: { fontSize: 7.5, color: palette.textMuted, letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
    kpiValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: palette.text, letterSpacing: -0.5 },
    kpiSuffix: { fontSize: 10, color: palette.textMuted, marginLeft: 3 },

    sectionTitle: {
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        marginTop: 14,
        marginBottom: 8,
        color: palette.text,
    },

    table: { width: '100%', marginBottom: 8 },
    tableHead: {
        flexDirection: 'row',
        backgroundColor: palette.navy,
        color: '#ffffff',
        padding: 6,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
    },
    tableHeadCell: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: 0.5 },
    tableRow: {
        flexDirection: 'row',
        padding: 6,
        borderBottom: `0.5pt solid ${palette.border}`,
    },
    tableRowAlt: { backgroundColor: palette.surfaceMuted },
    tableCell: { fontSize: 9, color: palette.text },

    barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
    barLabel: { width: 90, fontSize: 9, color: palette.text },
    barTrack: { flexGrow: 1, height: 14, backgroundColor: palette.surfaceMuted, borderRadius: 3, marginRight: 8, position: 'relative' },
    barFill: { height: 14, borderRadius: 3 },
    barValue: { width: 36, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold', color: palette.text },

    footer: {
        position: 'absolute',
        bottom: 20, left: 32, right: 32,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 8,
        color: palette.textMuted,
        paddingTop: 8,
        borderTop: `0.5pt solid ${palette.border}`,
    },
});

type Kpi = {
    totalMachines: number;
    operationalMachines: number;
    brokenMachines: number;
    totalInterventions: number;
    ongoingInterventions: number;
    avgMTBF: number;
    avgMTTR: number;
    avgAvailability: number;
    avgTRS: number;
    totalMaintenanceCost: number;
    criticalMachines: number;
};

interface ReportProps {
    generatedAt: Date;
    generatedBy: string;
    kpi: Kpi;
    monthlyBreakdowns: { month: string; pannes: number; year: number }[];
    interventionsByType: { type: string; count: number; color: string }[];
    costByMachine: { machine: string; coût: number }[];
    top5: { machineCode: string; criticalityScore: number }[];
    availability: { machine: string; disponibilité: number }[];
    actionItems: { label: string; count: number }[];
}

function PageFooter({ pageNum, generatedAt }: { pageNum: number; generatedAt: Date }) {
    return (
        <View style={styles.footer} fixed>
            <Text>SmartMaint — L.C PROD · Rapport généré le {generatedAt.toLocaleDateString('fr-FR')}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
    );
}

function Cover({ generatedAt, generatedBy }: { generatedAt: Date; generatedBy: string }) {
    const period = generatedAt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return (
        <Page size="A4" orientation="portrait" style={styles.coverPage}>
            <View style={styles.coverBand} />
            <View style={styles.coverInner}>
                <View>
                    <Text style={styles.coverEyebrow}>SMARTMAINT ANALYTICS</Text>
                    <Text style={styles.coverTitle}>Rapport de maintenance{'\n'}— L.C PROD</Text>
                    <Text style={styles.coverSub}>
                        Vue d&apos;ensemble de la performance maintenance : disponibilité,
                        coûts, criticité, et plan d&apos;action priorisé pour la période en cours.
                    </Text>
                </View>
                <View style={styles.coverMeta}>
                    <View style={styles.coverMetaItem}>
                        <Text style={styles.coverMetaLabel}>PÉRIODE</Text>
                        <Text style={styles.coverMetaValue}>{period}</Text>
                    </View>
                    <View style={styles.coverMetaItem}>
                        <Text style={styles.coverMetaLabel}>GÉNÉRÉ PAR</Text>
                        <Text style={styles.coverMetaValue}>{generatedBy}</Text>
                    </View>
                    <View style={styles.coverMetaItem}>
                        <Text style={styles.coverMetaLabel}>DATE</Text>
                        <Text style={styles.coverMetaValue}>{generatedAt.toLocaleDateString('fr-FR')}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.coverFooter} fixed>
                <Text>SmartMaint — L.C PROD · GMAO Agroalimentaire</Text>
                <Text>Confidentiel · usage interne</Text>
            </View>
        </Page>
    );
}

function ExecutiveSummary({ kpi, actionItems, generatedAt }: { kpi: Kpi; actionItems: ReportProps['actionItems']; generatedAt: Date }) {
    const hero: { label: string; value: string; accent: string }[] = [
        { label: 'DISPONIBILITÉ', value: `${kpi.avgAvailability}%`, accent: palette.green },
        { label: 'MTBF MOYEN', value: `${kpi.avgMTBF} h`, accent: palette.blue },
        { label: 'MTTR MOYEN', value: `${kpi.avgMTTR} h`, accent: palette.accent },
    ];
    const secondary: { label: string; value: string; accent: string }[] = [
        { label: 'MACHINES TOTAL', value: String(kpi.totalMachines), accent: palette.blue },
        { label: 'OPÉRATIONNELLES', value: String(kpi.operationalMachines), accent: palette.green },
        { label: 'EN PANNE', value: String(kpi.brokenMachines), accent: palette.red },
        { label: 'CRITIQUES', value: String(kpi.criticalMachines), accent: palette.red },
        { label: 'INTERVENTIONS', value: String(kpi.totalInterventions), accent: palette.blue },
        { label: 'EN COURS', value: String(kpi.ongoingInterventions), accent: palette.amber },
        { label: 'TRS MOYEN', value: `${kpi.avgTRS}%`, accent: palette.purple },
        { label: 'COÛT TOTAL', value: `${kpi.totalMaintenanceCost.toLocaleString('fr-FR')} MAD`, accent: palette.purple },
    ];
    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageHeaderTitle}>Résumé exécutif</Text>
                <Text style={styles.pageHeaderSub}>PAGE 2 · KPI GLOBAUX</Text>
            </View>

            <Text style={styles.sectionTitle}>KPI principaux</Text>
            <View style={styles.kpiRow}>
                {hero.map(h => (
                    <View key={h.label} style={styles.kpiCard}>
                        <View style={[styles.kpiAccent, { backgroundColor: h.accent }]} />
                        <Text style={styles.kpiLabel}>{h.label}</Text>
                        <Text style={styles.kpiValue}>{h.value}</Text>
                    </View>
                ))}
            </View>

            <Text style={styles.sectionTitle}>Indicateurs secondaires</Text>
            <View style={[styles.kpiRow, { flexWrap: 'wrap' }]}>
                {secondary.map(s => (
                    <View key={s.label} style={[styles.kpiCard, { flexBasis: '23%', maxWidth: '24%', marginBottom: 8 }]}>
                        <View style={[styles.kpiAccent, { backgroundColor: s.accent }]} />
                        <Text style={styles.kpiLabel}>{s.label}</Text>
                        <Text style={styles.kpiValue}>{s.value}</Text>
                    </View>
                ))}
            </View>

            <Text style={styles.sectionTitle}>Backlog — actions à traiter</Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flexGrow: 1 }]}>Domaine</Text>
                    <Text style={[styles.tableHeadCell, { width: 60, textAlign: 'right' }]}>Nombre</Text>
                </View>
                {actionItems.map((item, i) => (
                    <View key={item.label} style={[styles.tableRow, i % 2 === 0 ? styles.tableRowAlt : {}]}>
                        <Text style={[styles.tableCell, { flexGrow: 1 }]}>{item.label}</Text>
                        <Text style={[styles.tableCell, { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: item.count > 0 ? palette.red : palette.green }]}>{item.count}</Text>
                    </View>
                ))}
            </View>

            <PageFooter pageNum={2} generatedAt={generatedAt} />
        </Page>
    );
}

function PannesParMois({ monthlyBreakdowns, generatedAt }: { monthlyBreakdowns: ReportProps['monthlyBreakdowns']; generatedAt: Date }) {
    const max = Math.max(1, ...monthlyBreakdowns.map(m => m.pannes));
    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageHeaderTitle}>Pannes par mois</Text>
                <Text style={styles.pageHeaderSub}>PAGE 3 · TENDANCE 6 MOIS</Text>
            </View>

            <Text style={styles.sectionTitle}>Distribution mensuelle des pannes</Text>
            {monthlyBreakdowns.map(row => {
                const w = (row.pannes / max) * 100;
                return (
                    <View key={`${row.year}-${row.month}`} style={styles.barRow}>
                        <Text style={styles.barLabel}>{row.month} {String(row.year).slice(2)}</Text>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${w}%`, backgroundColor: palette.red }]} />
                        </View>
                        <Text style={styles.barValue}>{row.pannes}</Text>
                    </View>
                );
            })}

            <Text style={styles.sectionTitle}>Lecture</Text>
            <View style={{ padding: 10, backgroundColor: palette.surfaceMuted, borderRadius: 6, borderLeft: `3pt solid ${palette.accent}` }}>
                <Text style={{ fontSize: 9.5, color: palette.text, lineHeight: 1.5 }}>
                    La fenêtre glissante des 6 derniers mois donne la dynamique réelle de la
                    sinistralité du parc. Toute augmentation supérieure à +30 % par rapport à
                    la moyenne mobile doit déclencher une revue HACCP + plan préventif renforcé.
                </Text>
            </View>

            <PageFooter pageNum={3} generatedAt={generatedAt} />
        </Page>
    );
}

function Top5Page({ top5, interventionsByType, generatedAt }: { top5: ReportProps['top5']; interventionsByType: ReportProps['interventionsByType']; generatedAt: Date }) {
    const max = Math.max(1, ...top5.map(t => t.criticalityScore));
    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageHeaderTitle}>Machines critiques & nature des OT</Text>
                <Text style={styles.pageHeaderSub}>PAGE 4 · RISQUE & MIX</Text>
            </View>

            <Text style={styles.sectionTitle}>Top 5 — Score de criticité</Text>
            {top5.length === 0
                ? <Text style={{ fontSize: 10, color: palette.textMuted }}>Aucune machine identifiée comme critique.</Text>
                : top5.map(m => {
                    const w = (m.criticalityScore / max) * 100;
                    return (
                        <View key={m.machineCode} style={styles.barRow}>
                            <Text style={styles.barLabel}>{m.machineCode}</Text>
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: `${w}%`, backgroundColor: m.criticalityScore >= 70 ? palette.red : m.criticalityScore >= 40 ? palette.amber : palette.green }]} />
                            </View>
                            <Text style={styles.barValue}>{m.criticalityScore}</Text>
                        </View>
                    );
                })
            }

            <Text style={styles.sectionTitle}>Interventions par type</Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flexGrow: 1 }]}>Type</Text>
                    <Text style={[styles.tableHeadCell, { width: 80, textAlign: 'right' }]}>Nombre</Text>
                </View>
                {interventionsByType.map((row, i) => (
                    <View key={row.type} style={[styles.tableRow, i % 2 === 0 ? styles.tableRowAlt : {}]}>
                        <View style={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center' }}>
                            <Svg width={10} height={10} style={{ marginRight: 6 }}>
                                <Rect x={0} y={2} width={10} height={6} fill={row.color} rx={2} />
                            </Svg>
                            <Text style={styles.tableCell}>{row.type}</Text>
                        </View>
                        <Text style={[styles.tableCell, { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{row.count}</Text>
                    </View>
                ))}
            </View>

            <PageFooter pageNum={4} generatedAt={generatedAt} />
        </Page>
    );
}

function CostPage({ costByMachine, availability, generatedAt }: { costByMachine: ReportProps['costByMachine']; availability: ReportProps['availability']; generatedAt: Date }) {
    const ranked = [...costByMachine].sort((a, b) => b['coût'] - a['coût']);
    const maxCost = Math.max(1, ...ranked.map(c => c.coût));
    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageHeaderTitle}>Coûts & disponibilité par machine</Text>
                <Text style={styles.pageHeaderSub}>PAGE 5 · ÉCONOMIQUE</Text>
            </View>

            <Text style={styles.sectionTitle}>Coût maintenance par machine (MAD)</Text>
            {ranked.map(c => {
                const w = (c['coût'] / maxCost) * 100;
                return (
                    <View key={c.machine} style={styles.barRow}>
                        <Text style={styles.barLabel}>{c.machine}</Text>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${w}%`, backgroundColor: palette.purple }]} />
                        </View>
                        <Text style={[styles.barValue, { width: 70 }]}>{c['coût'].toLocaleString('fr-FR')}</Text>
                    </View>
                );
            })}

            <Text style={styles.sectionTitle}>Disponibilité par machine</Text>
            <View style={styles.table}>
                <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, { flexGrow: 1 }]}>Machine</Text>
                    <Text style={[styles.tableHeadCell, { width: 80, textAlign: 'right' }]}>Disponibilité</Text>
                </View>
                {availability.map((row, i) => (
                    <View key={row.machine} style={[styles.tableRow, i % 2 === 0 ? styles.tableRowAlt : {}]}>
                        <Text style={[styles.tableCell, { flexGrow: 1 }]}>{row.machine}</Text>
                        <Text style={[styles.tableCell, { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: row.disponibilité >= 95 ? palette.green : row.disponibilité >= 85 ? palette.amber : palette.red }]}>
                            {row.disponibilité}%
                        </Text>
                    </View>
                ))}
            </View>

            <PageFooter pageNum={5} generatedAt={generatedAt} />
        </Page>
    );
}

function Methodology({ generatedAt }: { generatedAt: Date }) {
    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageHeaderTitle}>Méthodologie & lecture</Text>
                <Text style={styles.pageHeaderSub}>PAGE 6 · NOTES</Text>
            </View>

            <Text style={styles.sectionTitle}>Définitions</Text>
            {[
                { k: 'MTBF', v: 'Mean Time Between Failures — temps moyen de bon fonctionnement entre deux pannes. Plus c\'est haut, mieux c\'est.' },
                { k: 'MTTR', v: 'Mean Time To Repair — temps moyen de réparation. Plus c\'est bas, mieux c\'est.' },
                { k: 'Disponibilité', v: 'Pourcentage du temps planifié pendant lequel la machine est apte à produire. Formule : MTBF / (MTBF + MTTR).' },
                { k: 'Criticité', v: 'Score 0-100 combinant impact production, fréquence des pannes et coût d\'arrêt horaire. Au-dessus de 70 = revue urgente.' },
                { k: 'TRS', v: 'Taux de Rendement Synthétique = Disponibilité × Performance × Qualité. Standard agroalimentaire : > 75%.' },
            ].map(d => (
                <View key={d.k} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: palette.accent }}>{d.k}</Text>
                    <Text style={{ fontSize: 9.5, color: palette.text, lineHeight: 1.5, marginTop: 2 }}>{d.v}</Text>
                </View>
            ))}

            <Text style={styles.sectionTitle}>Source des données</Text>
            <Text style={{ fontSize: 9.5, color: palette.text, lineHeight: 1.5 }}>
                Toutes les valeurs proviennent de la base SmartMaint Supabase, agrégées en
                temps réel au moment de la génération. Les KPI sont calculés sur l&apos;ensemble
                des interventions clôturées de la période. Aucune saisie manuelle requise.
            </Text>

            <Text style={styles.sectionTitle}>Signature</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                {['Responsable maintenance', 'Responsable production', 'Qualité / HACCP'].map(label => (
                    <View key={label} style={{ flexGrow: 1, flexBasis: 0 }}>
                        <View style={{ height: 50, borderBottom: `1pt solid ${palette.border}` }} />
                        <Text style={{ fontSize: 8, color: palette.textMuted, marginTop: 4 }}>{label}</Text>
                    </View>
                ))}
            </View>

            <PageFooter pageNum={6} generatedAt={generatedAt} />
        </Page>
    );
}

function MaintenanceReport(props: ReportProps) {
    return (
        <Document
            title={`SmartMaint — Rapport ${props.generatedAt.toLocaleDateString('fr-FR')}`}
            author="SmartMaint L.C PROD"
            subject="Rapport maintenance — généré automatiquement"
        >
            <Cover generatedAt={props.generatedAt} generatedBy={props.generatedBy} />
            <ExecutiveSummary kpi={props.kpi} actionItems={props.actionItems} generatedAt={props.generatedAt} />
            <PannesParMois monthlyBreakdowns={props.monthlyBreakdowns} generatedAt={props.generatedAt} />
            <Top5Page top5={props.top5} interventionsByType={props.interventionsByType} generatedAt={props.generatedAt} />
            <CostPage costByMachine={props.costByMachine} availability={props.availability} generatedAt={props.generatedAt} />
            <Methodology generatedAt={props.generatedAt} />
        </Document>
    );
}

/** Generate the PDF blob and trigger a browser download. */
export async function generateDashboardReport(props: ReportProps) {
    const blob = await pdf(<MaintenanceReport {...props} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartMaint-Rapport-${props.generatedAt.toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
