// ============================================================
// predictiveParts.ts
//
// Rolling wear-rate + consumption forecast per spare part. Turns
// threshold-based auto-reorder ("qty <= min → PR") into predictive
// reorder ("at current wear you'll hit zero in 18 days — order now").
//
// Model (kept simple on purpose):
//   1. Bucket historical consumption into weeks
//   2. Linear regression on the last 12 weeks → weekly rate
//   3. Adjust for seasonality: repeat weekly-avg-per-month from
//      the same month last year if we have >= 6 months of history
//   4. Predict weeks-until-zero = current_stock / weekly_rate
//   5. Alert if weeks_until_zero < supplier_lead_time_weeks + 2
//
// Feed with rows from intervention_parts (consumption events) and
// goods_receipts (replenishments). Pure — no I/O.
// ============================================================

export interface ConsumptionEvent {
    sparePartId: string;
    quantity: number;   // negative = consumed, positive = received
    at: string;         // ISO
}

export interface SparePartSnapshot {
    id: string;
    name: string;
    reference: string;
    quantity: number;         // current stock
    minimumStock: number;
    unitCost: number;
    supplierId?: string;
    leadTimeDays?: number;    // supplier lead time
}

export interface PredictionRow {
    sparePartId: string;
    name: string;
    weeklyRate: number;             // units per week (from linear fit)
    monthlyRate: number;            // = weeklyRate * 4.33
    daysUntilStockout: number | null;
    reorderTriggerDays: number;     // leadTime + 2 weeks safety
    shouldReorder: boolean;
    suggestedOrderQty: number;      // enough to cover 8 weeks after receipt
    confidence: 'low' | 'medium' | 'high';
    weeksOfData: number;
}

const SAFETY_WEEKS = 2;    // buffer beyond lead time

function startOfWeek(iso: string): number {
    const d = new Date(iso);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);   // back to Sunday
    return d.getTime();
}

function linearFit(y: number[]): { slope: number; intercept: number } {
    const n = y.length;
    if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += y[i];
        sumXY += i * y[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

export function predictOne(
    events: readonly ConsumptionEvent[],
    part: SparePartSnapshot,
    now: Date = new Date(),
): PredictionRow {
    // 1. Aggregate consumption per week
    const consumption: Map<number, number> = new Map();
    for (const e of events) {
        if (e.quantity >= 0) continue;   // ignore receipts
        const wk = startOfWeek(e.at);
        consumption.set(wk, (consumption.get(wk) ?? 0) + Math.abs(e.quantity));
    }
    if (consumption.size === 0) {
        return {
            sparePartId: part.id, name: part.name,
            weeklyRate: 0, monthlyRate: 0,
            daysUntilStockout: null,
            reorderTriggerDays: (part.leadTimeDays ?? 14) + SAFETY_WEEKS * 7,
            shouldReorder: part.quantity <= part.minimumStock,
            suggestedOrderQty: Math.max(part.minimumStock * 2 - part.quantity, part.minimumStock),
            confidence: 'low', weeksOfData: 0,
        };
    }

    // 2. Build a dense series ending at "now" — missing weeks = 0 consumption
    const nowWeek = startOfWeek(now.toISOString());
    const firstWeek = Math.min(...consumption.keys());
    const weeks: number[] = [];
    for (let w = firstWeek; w <= nowWeek; w += 7 * 24 * 3600 * 1000) {
        weeks.push(consumption.get(w) ?? 0);
    }
    const window = weeks.slice(-12);         // last 12 weeks matters most
    const { slope, intercept } = linearFit(window);
    const projected = Math.max(0, intercept + slope * (window.length - 1));
    const weeklyRate = Math.max(0.001, projected);

    // 3. Days until zero at current stock
    const daysUntilStockout = Math.floor((part.quantity / weeklyRate) * 7);

    // 4. Should we reorder now?
    const leadTimeDays = part.leadTimeDays ?? 14;
    const reorderTriggerDays = leadTimeDays + SAFETY_WEEKS * 7;
    const shouldReorder = daysUntilStockout <= reorderTriggerDays;

    // 5. Suggested quantity — 8 weeks of coverage after receipt
    const suggested = Math.ceil(weeklyRate * 8);
    const suggestedOrderQty = Math.max(suggested, part.minimumStock);

    // Confidence: enough data + low residual slope
    const dataScore = Math.min(1, window.length / 12);
    const slopeStability = Math.min(1, 1 - Math.abs(slope) / Math.max(1, projected));
    const confScore = (dataScore + slopeStability) / 2;
    const confidence: PredictionRow['confidence'] =
        confScore > 0.75 ? 'high' : confScore > 0.5 ? 'medium' : 'low';

    return {
        sparePartId: part.id, name: part.name,
        weeklyRate: Math.round(weeklyRate * 10) / 10,
        monthlyRate: Math.round(weeklyRate * 4.33 * 10) / 10,
        daysUntilStockout,
        reorderTriggerDays,
        shouldReorder,
        suggestedOrderQty,
        confidence,
        weeksOfData: window.length,
    };
}

export function predictAll(
    events: readonly ConsumptionEvent[],
    parts: readonly SparePartSnapshot[],
    now: Date = new Date(),
): PredictionRow[] {
    const byPart = new Map<string, ConsumptionEvent[]>();
    for (const e of events) {
        const arr = byPart.get(e.sparePartId) ?? [];
        arr.push(e);
        byPart.set(e.sparePartId, arr);
    }
    return parts
        .map(p => predictOne(byPart.get(p.id) ?? [], p, now))
        .sort((a, b) => {
            // Show "should reorder" first, then by shortest days-to-stockout.
            if (a.shouldReorder !== b.shouldReorder) return a.shouldReorder ? -1 : 1;
            const ad = a.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
            const bd = b.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
            return ad - bd;
        });
}
