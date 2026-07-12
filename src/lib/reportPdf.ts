// ============================================================
// Direct-draw PDF report generator.
//
// Why this exists: DOM-snapshotting Recharts (via html2canvas /
// html-to-image / window.print) has been an endless source of "blank
// chart" bugs. This module skips the DOM entirely — it takes RAW DATA
// and DRAWS the charts + tables + KPI tiles straight into the PDF
// using jsPDF's vector primitives. If we have the data, the PDF will
// contain a chart of that data, guaranteed.
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Layout constants (A4 portrait, mm) ────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// A single palette used across chart types.
const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

// ── Cursor + page break management ────────────────────────────
export interface Cursor {
    pdf: jsPDF;
    y: number;
}

export function newDoc(): Cursor {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    return { pdf, y: MARGIN };
}

export function ensureSpace(c: Cursor, needMm: number) {
    if (c.y + needMm > PAGE_H - MARGIN) {
        c.pdf.addPage();
        c.y = MARGIN;
    }
}

// ── Text helpers ──────────────────────────────────────────────
export function docHeader(c: Cursor, title: string, subtitle: string) {
    c.pdf.setFont('helvetica', 'bold');
    c.pdf.setFontSize(18);
    c.pdf.setTextColor(30, 41, 59);
    c.pdf.text(title, MARGIN, c.y + 6);
    c.y += 8;
    c.pdf.setFont('helvetica', 'normal');
    c.pdf.setFontSize(10);
    c.pdf.setTextColor(100, 116, 139);
    c.pdf.text(subtitle, MARGIN, c.y + 4);
    c.y += 6;
    c.pdf.setDrawColor(30, 64, 175);
    c.pdf.setLineWidth(0.6);
    c.pdf.line(MARGIN, c.y + 1, PAGE_W - MARGIN, c.y + 1);
    c.y += 6;
}

export function sectionHeader(c: Cursor, title: string, colorHex = '#1e40af') {
    ensureSpace(c, 12);
    const rgb = hexToRgb(colorHex);
    c.pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    c.pdf.rect(MARGIN, c.y, 3, 6, 'F');
    c.pdf.setFont('helvetica', 'bold');
    c.pdf.setFontSize(13);
    c.pdf.setTextColor(15, 23, 42);
    c.pdf.text(title, MARGIN + 6, c.y + 5);
    c.y += 10;
}

export function paragraph(c: Cursor, text: string, opts: { size?: number; color?: string } = {}) {
    const size = opts.size ?? 10;
    const rgb = hexToRgb(opts.color ?? '#334155');
    c.pdf.setFont('helvetica', 'normal');
    c.pdf.setFontSize(size);
    c.pdf.setTextColor(rgb.r, rgb.g, rgb.b);
    const lines = c.pdf.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
        ensureSpace(c, size * 0.5);
        c.pdf.text(line, MARGIN, c.y + size * 0.35);
        c.y += size * 0.45;
    }
    c.y += 2;
}

// ── KPI tile row ──────────────────────────────────────────────
export interface KpiTile {
    label: string;
    value: string;
    unit?: string;
    color?: string;
}

export function kpiRow(c: Cursor, tiles: KpiTile[]) {
    const cols = Math.min(4, tiles.length);
    const rows = Math.ceil(tiles.length / cols);
    const tileW = (CONTENT_W - (cols - 1) * 3) / cols;
    const tileH = 22;
    ensureSpace(c, rows * (tileH + 3));

    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = MARGIN + col * (tileW + 3);
        const y = c.y + row * (tileH + 3);
        const colorRgb = hexToRgb(t.color ?? '#3b82f6');

        // Card
        c.pdf.setDrawColor(226, 232, 240);
        c.pdf.setFillColor(255, 255, 255);
        c.pdf.roundedRect(x, y, tileW, tileH, 2, 2, 'FD');
        // Accent bar
        c.pdf.setFillColor(colorRgb.r, colorRgb.g, colorRgb.b);
        c.pdf.rect(x, y, 2, tileH, 'F');
        // Label
        c.pdf.setFont('helvetica', 'normal');
        c.pdf.setFontSize(8);
        c.pdf.setTextColor(100, 116, 139);
        c.pdf.text(t.label.toUpperCase(), x + 5, y + 6);
        // Value
        c.pdf.setFont('helvetica', 'bold');
        c.pdf.setFontSize(15);
        c.pdf.setTextColor(colorRgb.r, colorRgb.g, colorRgb.b);
        c.pdf.text(t.value, x + 5, y + 15);
        // Unit
        if (t.unit) {
            c.pdf.setFont('helvetica', 'normal');
            c.pdf.setFontSize(8);
            c.pdf.setTextColor(100, 116, 139);
            const valW = c.pdf.getTextWidth(t.value);
            c.pdf.text(t.unit, x + 5 + valW + 1.5, y + 15);
        }
    }
    c.y += rows * (tileH + 3);
}

// ── Bar chart (grouped or stacked) ────────────────────────────
export interface BarChartSpec {
    title?: string;
    labels: string[];                              // x-axis category labels
    series: { name: string; values: number[]; color?: string }[];
    stacked?: boolean;
    valueFormatter?: (v: number) => string;
    heightMm?: number;
}

export function barChart(c: Cursor, spec: BarChartSpec) {
    const H = spec.heightMm ?? 70;
    const legendH = 8;
    const totalH = (spec.title ? 8 : 0) + H + legendH + 4;
    ensureSpace(c, totalH);

    if (spec.title) {
        c.pdf.setFont('helvetica', 'bold');
        c.pdf.setFontSize(11);
        c.pdf.setTextColor(15, 23, 42);
        c.pdf.text(spec.title, MARGIN, c.y + 5);
        c.y += 7;
    }

    const chartX = MARGIN + 18; // room for y-axis labels
    const chartY = c.y;
    const chartW = CONTENT_W - 18;
    const chartH = H - 8; // room for x labels

    // Y axis scale
    let maxV = 0;
    if (spec.stacked) {
        for (let i = 0; i < spec.labels.length; i++) {
            const stackSum = spec.series.reduce((s, sr) => s + (sr.values[i] || 0), 0);
            if (stackSum > maxV) maxV = stackSum;
        }
    } else {
        for (const sr of spec.series) for (const v of sr.values) if (v > maxV) maxV = v;
    }
    if (maxV <= 0) maxV = 1;
    // Round to nice number
    maxV = niceCeil(maxV);

    // Grid + Y labels
    c.pdf.setDrawColor(226, 232, 240);
    c.pdf.setLineWidth(0.1);
    c.pdf.setFont('helvetica', 'normal');
    c.pdf.setFontSize(7);
    c.pdf.setTextColor(100, 116, 139);
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
        const yy = chartY + chartH - (i / ticks) * chartH;
        c.pdf.line(chartX, yy, chartX + chartW, yy);
        const val = (maxV * i / ticks);
        const label = spec.valueFormatter ? spec.valueFormatter(val) : formatShort(val);
        c.pdf.text(label, chartX - 1.5, yy + 1.2, { align: 'right' });
    }

    // Bars
    const groupCount = spec.labels.length;
    const groupW = chartW / groupCount;
    const seriesCount = spec.series.length;
    const barW = spec.stacked ? groupW * 0.6 : (groupW * 0.85) / seriesCount;
    for (let g = 0; g < groupCount; g++) {
        const groupX = chartX + g * groupW;
        if (spec.stacked) {
            let stackY = chartY + chartH;
            for (let s = 0; s < seriesCount; s++) {
                const v = spec.series[s].values[g] || 0;
                const h = (v / maxV) * chartH;
                const color = hexToRgb(spec.series[s].color ?? PALETTE[s % PALETTE.length]);
                c.pdf.setFillColor(color.r, color.g, color.b);
                c.pdf.rect(groupX + (groupW - barW) / 2, stackY - h, barW, h, 'F');
                stackY -= h;
            }
        } else {
            for (let s = 0; s < seriesCount; s++) {
                const v = spec.series[s].values[g] || 0;
                const h = (v / maxV) * chartH;
                const color = hexToRgb(spec.series[s].color ?? PALETTE[s % PALETTE.length]);
                c.pdf.setFillColor(color.r, color.g, color.b);
                c.pdf.rect(groupX + (groupW * 0.075) + s * barW, chartY + chartH - h, barW * 0.9, h, 'F');
            }
        }
        // X label
        c.pdf.setFontSize(7);
        c.pdf.setTextColor(71, 85, 105);
        const label = spec.labels[g];
        c.pdf.text(label, groupX + groupW / 2, chartY + chartH + 3, { align: 'center' });
    }
    c.y += H + 2;

    // Legend
    drawLegend(c, spec.series.map((s, i) => ({ name: s.name, color: s.color ?? PALETTE[i % PALETTE.length] })));
}

// ── Pie chart ─────────────────────────────────────────────────
export interface PieSlice { label: string; value: number; color?: string }

export function pieChart(c: Cursor, spec: { title?: string; slices: PieSlice[]; sizeMm?: number; valueFormatter?: (v: number) => string }) {
    const size = spec.sizeMm ?? 60;
    const totalH = (spec.title ? 8 : 0) + size + 8;
    ensureSpace(c, totalH);

    if (spec.title) {
        c.pdf.setFont('helvetica', 'bold');
        c.pdf.setFontSize(11);
        c.pdf.setTextColor(15, 23, 42);
        c.pdf.text(spec.title, MARGIN, c.y + 5);
        c.y += 7;
    }

    const cx = MARGIN + size / 2;
    const cy = c.y + size / 2;
    const r = size / 2 - 2;
    const total = spec.slices.reduce((s, sl) => s + sl.value, 0) || 1;

    // Draw slices by triangle-fan approximation (jsPDF has no true arc-fill).
    // Approximate each slice by many thin triangles from center.
    let angle = -Math.PI / 2;
    for (let i = 0; i < spec.slices.length; i++) {
        const slice = spec.slices[i];
        const sweep = (slice.value / total) * 2 * Math.PI;
        const color = hexToRgb(slice.color ?? PALETTE[i % PALETTE.length]);
        c.pdf.setFillColor(color.r, color.g, color.b);
        c.pdf.setDrawColor(color.r, color.g, color.b);
        // Fan triangles — small steps for smooth arc.
        const steps = Math.max(6, Math.floor(sweep / (Math.PI / 30)));
        for (let s = 0; s < steps; s++) {
            const a1 = angle + (s / steps) * sweep;
            const a2 = angle + ((s + 1) / steps) * sweep;
            const x1 = cx + Math.cos(a1) * r;
            const y1 = cy + Math.sin(a1) * r;
            const x2 = cx + Math.cos(a2) * r;
            const y2 = cy + Math.sin(a2) * r;
            c.pdf.triangle(cx, cy, x1, y1, x2, y2, 'F');
        }
        angle += sweep;
    }

    // Legend to the right of the pie
    const legendX = MARGIN + size + 8;
    let ly = c.y + 2;
    for (let i = 0; i < spec.slices.length; i++) {
        const slice = spec.slices[i];
        const color = hexToRgb(slice.color ?? PALETTE[i % PALETTE.length]);
        c.pdf.setFillColor(color.r, color.g, color.b);
        c.pdf.rect(legendX, ly - 2.5, 3.5, 3.5, 'F');
        const pct = ((slice.value / total) * 100).toFixed(1);
        const valTxt = spec.valueFormatter ? spec.valueFormatter(slice.value) : String(slice.value);
        c.pdf.setFont('helvetica', 'normal');
        c.pdf.setFontSize(9);
        c.pdf.setTextColor(51, 65, 85);
        c.pdf.text(`${slice.label}  ${valTxt}  (${pct}%)`, legendX + 5, ly);
        ly += 5;
    }
    c.y += size + 6;
}

// ── Line chart ────────────────────────────────────────────────
export interface LineChartSpec {
    title?: string;
    xLabels: string[];
    series: { name: string; values: number[]; color?: string; area?: boolean }[];
    heightMm?: number;
    valueFormatter?: (v: number) => string;
}

export function lineChart(c: Cursor, spec: LineChartSpec) {
    const H = spec.heightMm ?? 70;
    const totalH = (spec.title ? 8 : 0) + H + 10;
    ensureSpace(c, totalH);

    if (spec.title) {
        c.pdf.setFont('helvetica', 'bold');
        c.pdf.setFontSize(11);
        c.pdf.setTextColor(15, 23, 42);
        c.pdf.text(spec.title, MARGIN, c.y + 5);
        c.y += 7;
    }

    const chartX = MARGIN + 18;
    const chartY = c.y;
    const chartW = CONTENT_W - 18;
    const chartH = H - 8;

    let maxV = 0, minV = Infinity;
    for (const sr of spec.series) for (const v of sr.values) {
        if (v > maxV) maxV = v;
        if (v < minV) minV = v;
    }
    if (minV === Infinity) minV = 0;
    if (maxV <= minV) maxV = minV + 1;
    minV = Math.max(0, Math.floor(minV));
    maxV = niceCeil(maxV);

    // Grid + Y labels
    c.pdf.setDrawColor(226, 232, 240);
    c.pdf.setLineWidth(0.1);
    c.pdf.setFont('helvetica', 'normal');
    c.pdf.setFontSize(7);
    c.pdf.setTextColor(100, 116, 139);
    for (let i = 0; i <= 4; i++) {
        const yy = chartY + chartH - (i / 4) * chartH;
        c.pdf.line(chartX, yy, chartX + chartW, yy);
        const val = minV + (maxV - minV) * (i / 4);
        const label = spec.valueFormatter ? spec.valueFormatter(val) : formatShort(val);
        c.pdf.text(label, chartX - 1.5, yy + 1.2, { align: 'right' });
    }

    const xStep = spec.xLabels.length > 1 ? chartW / (spec.xLabels.length - 1) : chartW;

    for (let s = 0; s < spec.series.length; s++) {
        const sr = spec.series[s];
        const color = hexToRgb(sr.color ?? PALETTE[s % PALETTE.length]);
        c.pdf.setDrawColor(color.r, color.g, color.b);
        c.pdf.setLineWidth(0.7);
        const points: [number, number][] = sr.values.map((v, i) => {
            const x = chartX + i * xStep;
            const y = chartY + chartH - ((v - minV) / (maxV - minV)) * chartH;
            return [x, y];
        });
        if (sr.area) {
            // Fill area under the line
            c.pdf.setFillColor(color.r, color.g, color.b);
            const path: number[] = [];
            for (let i = 0; i < points.length; i++) {
                if (i === 0) {
                    c.pdf.setGState(new (c.pdf as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.15 }));
                }
            }
            // Approximate area fill via many thin rects between consecutive points.
            for (let i = 0; i < points.length - 1; i++) {
                const [x1, y1] = points[i];
                const [x2, y2] = points[i + 1];
                // Trapezoid: two triangles.
                c.pdf.triangle(x1, chartY + chartH, x1, y1, x2, y2, 'F');
                c.pdf.triangle(x1, chartY + chartH, x2, y2, x2, chartY + chartH, 'F');
            }
            // Restore opacity.
            c.pdf.setGState(new (c.pdf as unknown as { GState: new (o: object) => object }).GState({ opacity: 1 }));
            void path;
        }
        // Line
        c.pdf.setDrawColor(color.r, color.g, color.b);
        for (let i = 0; i < points.length - 1; i++) {
            c.pdf.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
        }
    }

    // X labels — sparse
    const step = Math.max(1, Math.floor(spec.xLabels.length / 6));
    for (let i = 0; i < spec.xLabels.length; i += step) {
        const x = chartX + i * xStep;
        c.pdf.setFontSize(7);
        c.pdf.setTextColor(71, 85, 105);
        c.pdf.text(spec.xLabels[i], x, chartY + chartH + 3, { align: 'center' });
    }

    c.y += H + 2;

    // Legend
    drawLegend(c, spec.series.map((s, i) => ({ name: s.name, color: s.color ?? PALETTE[i % PALETTE.length] })));
}

// ── Data table via autotable ──────────────────────────────────
export interface TableSpec {
    title?: string;
    columns: string[];
    rows: (string | number)[][];
    highlight?: (row: number) => boolean;   // returns true to shade a critical row
}

export function dataTable(c: Cursor, spec: TableSpec) {
    if (spec.title) {
        ensureSpace(c, 10);
        c.pdf.setFont('helvetica', 'bold');
        c.pdf.setFontSize(11);
        c.pdf.setTextColor(15, 23, 42);
        c.pdf.text(spec.title, MARGIN, c.y + 5);
        c.y += 7;
    }
    autoTable(c.pdf, {
        head: [spec.columns],
        body: spec.rows.map(r => r.map(v => String(v))),
        startY: c.y,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: [51, 65, 85] },
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
            if (data.section === 'body' && spec.highlight && spec.highlight(data.row.index)) {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [153, 27, 27];
            }
        },
    });
    // autoTable stashes the finalY here via lib API
    const finalY = ((c.pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY) ?? c.y;
    c.y = finalY + 6;
}

// ── Save helper ───────────────────────────────────────────────
export function saveAs(c: Cursor, filename: string) {
    c.pdf.save(filename);
}

// ── Utils ─────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return {
        r: parseInt(n.slice(0, 2), 16),
        g: parseInt(n.slice(2, 4), 16),
        b: parseInt(n.slice(4, 6), 16),
    };
}

function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const nrm = v / mag;
    let out: number;
    if (nrm <= 1) out = 1;
    else if (nrm <= 2) out = 2;
    else if (nrm <= 2.5) out = 2.5;
    else if (nrm <= 5) out = 5;
    else out = 10;
    return out * mag;
}

function formatShort(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k';
    if (v >= 10) return v.toFixed(0);
    return v.toFixed(1);
}

function drawLegend(c: Cursor, items: { name: string; color: string }[]) {
    c.pdf.setFont('helvetica', 'normal');
    c.pdf.setFontSize(8);
    c.pdf.setTextColor(71, 85, 105);
    let x = MARGIN;
    const startY = c.y + 3;
    for (const it of items) {
        const rgb = hexToRgb(it.color);
        const w = c.pdf.getTextWidth(it.name);
        // Wrap if needed
        if (x + 5 + w > PAGE_W - MARGIN) {
            x = MARGIN;
            c.y += 5;
        }
        c.pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        c.pdf.rect(x, startY - 2.5, 3, 3, 'F');
        c.pdf.text(it.name, x + 4.5, startY);
        x += 4.5 + w + 6;
    }
    c.y += 6;
}
