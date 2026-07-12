// Phase 2 probe — CRUD round-trip on technicians, interventions, spare_parts, personnel.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://odnszwngptfqozrxexri.supabase.co',
    'sb_publishable_D1C1g7YMqbgx8I3kqPhHSQ_PwXyTtWS'
);
const log = (...a) => console.log(...a);

async function crud(table, insertRow, patch) {
    const { data: ins, error: insErr } = await supabase.from(table).insert(insertRow).select().single();
    if (insErr) { log(`[${table}] INSERT FAIL: ${insErr.message}`); return false; }
    const { data: upd, error: updErr } = await supabase.from(table).update(patch).eq('id', ins.id).select().single();
    if (updErr) { log(`[${table}] UPDATE FAIL: ${updErr.message}`); return false; }
    const { error: delErr } = await supabase.from(table).delete().eq('id', ins.id);
    if (delErr) { log(`[${table}] DELETE FAIL: ${delErr.message}`); return false; }
    log(`[${table}] INSERT+UPDATE+DELETE OK`);
    return true;
}

async function main() {
    const { error: authErr } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com', password: 'password123',
    });
    if (authErr) { log('AUTH FAILED:', authErr.message); process.exit(1); }
    log('=== AUTH OK ===\n');

    const ts = Date.now();
    let allOk = true;

    allOk &= await crud('technicians',
        { id: `tech-probe-${ts}`, fullName: 'Probe Tech', specialty: 'QA', phone: '0', email: 'p@p.com', availability: 'disponible' },
        { availability: 'en intervention' });

    allOk &= await crud('interventions',
        { id: `int-probe-${ts}`, machineId: 'mach-001', technicianId: 'tech-001', interventionType: 'préventive', description: 'Probe', startDate: new Date().toISOString(), endDate: null, downtimeHours: 1, laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0, status: 'planifiée' },
        { status: 'en cours' });

    allOk &= await crud('spare_parts',
        { id: `sp-probe-${ts}`, name: 'Probe Part', reference: 'PROBE-REF', quantity: 5, minimumStock: 2, machineId: null, unitCost: 10 },
        { quantity: 99 });

    allOk &= await crud('personnel',
        { id: `op-probe-${ts}`, nom: 'Probe Op', role: 'operateur', specialite: 'QA', telephone: '0', email: 'o@o.com', statut: 'actif' },
        { statut: 'inactif' });

    // Final counts
    log('');
    for (const t of ['machines', 'technicians', 'interventions', 'spare_parts', 'personnel', 'suppliers', 'purchase_orders', 'production_metrics']) {
        const { data } = await supabase.from(t).select('id');
        log(`[count ${t}] ${data?.length ?? '?'}`);
    }

    await supabase.auth.signOut();
    log(allOk ? '\n=== ALL PHASE 2 CRUD CHECKS PASSED ===' : '\n=== SOME CHECKS FAILED ===');
    process.exit(allOk ? 0 : 1);
}

main().catch(e => { console.error('Crashed:', e); process.exit(1); });
