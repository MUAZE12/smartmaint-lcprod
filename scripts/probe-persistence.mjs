// Probe: operator breakdown + technician report + settings persistence.
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
    const id = `int-probe-${ts}`;

    // 1) Operator breakdown -> intervention, technicianId NULL, status planifiée
    let r = await supabase.from('interventions').insert({
        id, machineId: 'mach-001', technicianId: null, interventionType: 'corrective',
        description: 'Panne signalée par opérateur — Symptômes: mechanical. Impact: stopped.',
        probableCause: '', actionDone: '',
        startDate: new Date().toISOString(), endDate: null,
        downtimeHours: 0, laborCost: 0, partsCost: 0, downtimeCost: 0, totalCost: 0,
        status: 'planifiée',
    }).select().single();
    log('[operator breakdown] insert (technicianId=null):', r.error ? 'FAIL ' + r.error.message : `OK — status=${r.data.status}`);

    // 2) Technician report -> close the intervention
    r = await supabase.from('interventions').update({
        status: 'terminée', endDate: new Date().toISOString(),
        actionDone: 'Roulement remplacé', probableCause: 'Usure', partsCost: 170, totalCost: 170,
    }).eq('id', id).select().single();
    log('[technician report] update:', r.error ? 'FAIL ' + r.error.message : `OK — status=${r.data.status}, actionDone="${r.data.actionDone}"`);

    // 3) Settings -> app_settings
    await supabase.from('app_settings').upsert(
        { key: 'notif_prefs', value: JSON.stringify({ stock: true, panne: false, validation: true, email: false }), updatedAt: new Date().toISOString() },
        { onConflict: 'key' });
    await supabase.from('app_settings').upsert(
        { key: 'session_expiry', value: '8h', updatedAt: new Date().toISOString() },
        { onConflict: 'key' });
    const { data: np } = await supabase.from('app_settings').select('value').eq('key', 'notif_prefs').single();
    const { data: se } = await supabase.from('app_settings').select('value').eq('key', 'session_expiry').single();
    log(`[settings] notif_prefs=${np.value}`);
    log(`[settings] session_expiry=${se.value}`);

    // Cleanup
    await supabase.from('interventions').delete().eq('id', id);
    await supabase.from('app_settings').delete().eq('key', 'notif_prefs');
    await supabase.from('app_settings').delete().eq('key', 'session_expiry');
    log('\n[cleanup] OK');

    await supabase.auth.signOut();
    const ok = !r.error;
    log(ok ? '\n=== PERSISTENCE CHECKS PASSED ===' : '\n=== CHECKS FAILED ===');
    process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('Crashed:', e); process.exit(1); });
