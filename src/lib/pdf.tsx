// ============================================================
// PDF generator for the weekly maintenance digest.
// Uses @react-pdf/renderer (server-side, small bundle, no headless
// Chrome dependency — fits comfortably under Vercel size limits).
// ============================================================

import React from 'react';
import {
    Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';

const C = {
    primary: '#1e40af',
    primaryLight: '#3b82f6',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    text: '#0f172a',
    muted: '#64748b',
    border: '#e2e8f0',
    bgSoft: '#f8fafc',
};

const styles = StyleSheet.create({
    page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10, color: C.text, backgroundColor: 'white' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
    badge: { fontSize: 8, fontWeight: 'bold', color: 'white', backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, letterSpacing: 1 },
    title: { fontSize: 22, fontWeight: 'bold', color: C.primary, marginTop: 12 },
    period: { fontSize: 10, color: C.muted, marginBottom: 14 },
    rule: { borderBottomWidth: 2, borderBottomColor: C.primary, marginBottom: 8 },
    sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 16, marginBottom: 6 },
    table: { borderTopWidth: 1, borderColor: C.border },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.border, paddingVertical: 6, paddingHorizontal: 6 },
    rowAlt: { backgroundColor: C.bgSoft },
    cellLabel: { flex: 2, fontSize: 10, color: C.muted },
    cellValue: { flex: 1, fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
    footer: { position: 'absolute', bottom: 24, left: 32, right: 32, fontSize: 8, color: C.muted, textAlign: 'center', borderTopWidth: 1, borderColor: C.border, paddingTop: 8 },
});

export interface WeeklyReportData {
    fromDate: string;
    toDate: string;
    interventions: number;
    closedInterventions: number;
    corrective: number;
    preventive: number;
    avgMTTR: number;
    totalDowntime: number;
    totalCost: number;
    planRunsDone: number;
    haccpDone: number;
    haccpNonConforme: number;
    batches: number;
    totalProduced: number;
    totalPlanned: number;
    yieldPct: number | null;
}

interface RowProps { label: string; value: string; alt?: boolean; danger?: boolean }
function Row({ label, value, alt, danger }: RowProps) {
    return (
        <View style={[styles.row, alt ? styles.rowAlt : {}]}>
            <Text style={styles.cellLabel}>{label}</Text>
            <Text style={[styles.cellValue, danger ? { color: C.danger } : {}]}>{value}</Text>
        </View>
    );
}

function ReportDocument({ data }: { data: WeeklyReportData }) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.headerRow}>
                    <Text style={styles.badge}>SMARTMAINT — L.C PROD</Text>
                    <Text style={{ fontSize: 9, color: C.muted }}>{new Date().toLocaleDateString('fr-FR')}</Text>
                </View>
                <Text style={styles.title}>Rapport hebdomadaire de maintenance</Text>
                <Text style={styles.period}>Période : {data.fromDate} → {data.toDate}</Text>
                <View style={styles.rule} />

                <Text style={[styles.sectionTitle, { color: C.primaryLight }]}>Maintenance</Text>
                <View style={styles.table}>
                    <Row label="Interventions totales" value={String(data.interventions)} />
                    <Row label="Interventions clôturées" value={String(data.closedInterventions)} alt />
                    <Row label="Correctives / Préventives" value={`${data.corrective} / ${data.preventive}`} />
                    <Row label="MTTR moyen" value={`${data.avgMTTR.toFixed(2)} h`} alt />
                    <Row label="Temps d'arrêt total" value={`${data.totalDowntime.toFixed(1)} h`} />
                    <Row label="Coût total maintenance" value={`${data.totalCost.toLocaleString()} MAD`} alt />
                    <Row label="Plans préventifs exécutés" value={String(data.planRunsDone)} />
                </View>

                <Text style={[styles.sectionTitle, { color: C.success }]}>Conformité HACCP</Text>
                <View style={styles.table}>
                    <Row label="Contrôles effectués" value={String(data.haccpDone)} />
                    <Row label="Non conformes" value={String(data.haccpNonConforme)} danger={data.haccpNonConforme > 0} alt />
                </View>

                <Text style={[styles.sectionTitle, { color: C.warning }]}>Production</Text>
                <View style={styles.table}>
                    <Row label="Lots produits" value={String(data.batches)} />
                    <Row label="Quantité produite" value={data.totalProduced.toLocaleString()} alt />
                    <Row label="Quantité planifiée" value={data.totalPlanned.toLocaleString()} />
                    <Row
                        label="Rendement"
                        value={data.yieldPct === null ? '—' : `${data.yieldPct} %`}
                        alt
                        danger={data.yieldPct !== null && data.yieldPct < 90}
                    />
                </View>

                <Text style={styles.footer}>
                    Document généré automatiquement par SmartMaint — L.C PROD · cron Vercel · {new Date().toLocaleString('fr-FR')}
                </Text>
            </Page>
        </Document>
    );
}

/** Build the weekly digest as a PDF buffer ready for email attachment. */
export async function buildWeeklyReportPDF(data: WeeklyReportData): Promise<Buffer> {
    return renderToBuffer(<ReportDocument data={data} />);
}
