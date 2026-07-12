// Probe itemized RFQ — RFQ lines, per-line supplier quotes, scoring, exact PO build.
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

    const ts = Date.now();
    const rfqId = `rfq-it-${ts}`;

    // 1) RFQ + 3 line items
    await supabase.from('quote_requests').insert({
        id: rfqId, rfqNumber: 'RFQ-IT-PROBE', requisitionId: null,
        status: 'ouverte', machineId: 'mach-001', notes: 'Révision TIS-001',
    });
    const rfqLines = [
        { id: `rfl-${ts}-1`, rfqId, sparePartId: 'sp-001', quantity: 4 },
        { id: `rfl-${ts}-2`, rfqId, sparePartId: 'sp-002', quantity: 2 },
        { id: `rfl-${ts}-3`, rfqId, sparePartId: 'sp-005', quantity: 10 },
    ];
    let r = await supabase.from('quote_request_lines').insert(rfqLines);
    if (r.error) { log('RFQ lines FAIL:', r.error.message); process.exit(1); }
    log('[RFQ] created with 3 line items (sp-001×4, sp-002×2, sp-005×10)');

    // 2) Two suppliers each quote per-line
    const mkQuote = async (qid, supId, prices) => {
        await supabase.from('quotes').insert({
            id: qid, rfqId, supplierId: supId, status: 'reçu',
            totalAmount: 0, deliveryDays: supId === 'sup-001' ? 5 : 12, notes: '',
        });
        const qLines = rfqLines.map((rl, i) => ({
            id: `${qid}-l${i}`, quoteId: qid, rfqLineId: rl.id,
            sparePartId: rl.sparePartId, unitPrice: prices[i],
        }));
        await supabase.from('quote_lines').insert(qLines);
        const total = rfqLines.reduce((s, rl, i) => s + prices[i] * rl.quantity, 0);
        await supabase.from('quotes').update({ totalAmount: total }).eq('id', qid);
        return total;
    };
    const t1 = await mkQuote(`q-${ts}-A`, 'sup-001', [90, 130, 16]);   // SKF
    const t2 = await mkQuote(`q-${ts}-B`, 'sup-002', [80, 125, 18]);   // Gates
    log(`[quotes] SKF total=${t1} MAD (5j), Gates total=${t2} MAD (12j)`);

    // 3) Read back + score
    const { data: qs } = await supabase.from('quotes').select('*').eq('rfqId', rfqId);
    const { data: ql } = await supabase.from('quote_lines').select('*').in('quoteId', qs.map(q => q.id));
    log(`[readback] ${qs.length} quotes, ${ql.length} quote lines total`);
    const { data: sup } = await supabase.from('suppliers').select('id,reliability').in('id', ['sup-001', 'sup-002']);
    const rel = Object.fromEntries(sup.map(x => [x.id, x.reliability]));
    const minP = Math.min(...qs.map(q => q.totalAmount));
    const minD = Math.min(...qs.map(q => q.deliveryDays));
    qs.forEach(q => {
        const sc = 0.5 * (minP / q.totalAmount) + 0.3 * (rel[q.supplierId] / 100) + 0.2 * (minD / q.deliveryDays);
        log(`  ${q.supplierId}: ${q.totalAmount} MAD, ${q.deliveryDays}j -> score ${Math.round(sc * 100)}%`);
    });

    // 4) Retain SKF + verify the PO would build exactly from its quote lines
    const winner = qs.find(q => q.supplierId === 'sup-001');
    const winnerLines = ql.filter(l => l.quoteId === winner.id);
    log('\n[PO build from retained quote]:');
    winnerLines.forEach(wl => {
        const rl = rfqLines.find(r => r.id === wl.rfqLineId);
        log(`  ${wl.sparePartId} × ${rl.quantity} @ ${wl.unitPrice} MAD = ${rl.quantity * wl.unitPrice} MAD`);
    });
    const poTotal = winnerLines.reduce((s, wl) => {
        const rl = rfqLines.find(r => r.id === wl.rfqLineId);
        return s + rl.quantity * wl.unitPrice;
    }, 0);
    log(`  -> PO total = ${poTotal} MAD (matches retained quote total ${winner.totalAmount}: ${poTotal === winner.totalAmount})`);

    // 5) Cleanup (cascade)
    await supabase.from('quote_requests').delete().eq('id', rfqId);
    const { data: leftLines } = await supabase.from('quote_request_lines').select('id').eq('rfqId', rfqId);
    const { data: leftQ } = await supabase.from('quotes').select('id').eq('rfqId', rfqId);
    log(`\n[cascade delete] rfq lines left: ${leftLines.length}, quotes left: ${leftQ.length} (expect 0/0)`);

    await supabase.auth.signOut();
    const ok = ql.length === 6 && poTotal === winner.totalAmount && leftLines.length === 0 && leftQ.length === 0;
    log(ok ? '\n=== ITEMIZED RFQ CHECKS PASSED ===' : '\n=== CHECKS FAILED ===');
    process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('Crashed:', e); process.exit(1); });
