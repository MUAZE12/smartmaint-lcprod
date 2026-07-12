// Probe procurement v2 — multi-line PO round-trip + table reads.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://odnszwngptfqozrxexri.supabase.co',
    'sb_publishable_D1C1g7YMqbgx8I3kqPhHSQ_PwXyTtWS'
);
const log = (...a) => console.log(...a);

async function main() {
    const { error: authErr } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com', password: 'password123',
    });
    if (authErr) { log('AUTH FAILED:', authErr.message); process.exit(1); }
    log('=== AUTH OK ===\n');

    // 1) Read all new tables
    log('=== READS ===');
    for (const t of ['purchase_requisitions', 'purchase_requisition_lines', 'quote_requests',
        'quotes', 'purchase_order_lines', 'goods_receipts', 'app_settings']) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) log(`[${t}] FAIL: ${error.message}`);
        else log(`[${t}] ${data.length} rows`);
    }

    // 2) app_settings threshold
    const { data: thr } = await supabase.from('app_settings').select('value').eq('key', 'po_approval_threshold').maybeSingle();
    log(`\napproval threshold = ${thr?.value} MAD`);

    // 3) Multi-line PO round-trip
    log('\n=== MULTI-LINE PO round-trip ===');
    const ts = Date.now();
    const poId = `po-probe-${ts}`;
    const { error: poErr } = await supabase.from('purchase_orders').insert({
        id: poId, poNumber: 'PO-PROBE-ML', supplierId: 'sup-001',
        totalAmount: 0, status: 'brouillon',
        orderDate: new Date().toISOString(), expectedDelivery: new Date().toISOString(),
        approvalStatus: 'non requis',
    });
    if (poErr) { log('PO header INSERT FAIL:', poErr.message); process.exit(1); }
    log('[PO header] created');

    const lines = [
        { id: `pol-probe-${ts}-1`, poId, sparePartId: 'sp-001', quantity: 3, unitCost: 85, receivedQty: 0 },
        { id: `pol-probe-${ts}-2`, poId, sparePartId: 'sp-002', quantity: 2, unitCost: 120, receivedQty: 0 },
        { id: `pol-probe-${ts}-3`, poId, sparePartId: 'sp-005', quantity: 10, unitCost: 15, receivedQty: 0 },
    ];
    const { error: lErr } = await supabase.from('purchase_order_lines').insert(lines);
    if (lErr) { log('PO lines INSERT FAIL:', lErr.message); process.exit(1); }
    const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    log(`[PO lines] 3 lines created, total = ${total} MAD`);

    // Read back lines for this PO
    const { data: readback } = await supabase.from('purchase_order_lines').select('*').eq('poId', poId);
    log(`[readback] ${readback.length} lines linked to PO`);

    // Update PO total
    await supabase.from('purchase_orders').update({ totalAmount: total }).eq('id', poId);
    log('[PO header] total updated');

    // 4) Cleanup — delete PO header; lines should cascade
    await supabase.from('purchase_orders').delete().eq('id', poId);
    const { data: afterDel } = await supabase.from('purchase_order_lines').select('id').eq('poId', poId);
    log(`[cascade delete] lines remaining after PO delete: ${afterDel.length} (expect 0)`);

    await supabase.auth.signOut();
    const ok = readback.length === 3 && afterDel.length === 0;
    log(ok ? '\n=== MULTI-LINE PO CHECKS PASSED ===' : '\n=== CHECKS FAILED ===');
    process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('Crashed:', e); process.exit(1); });
