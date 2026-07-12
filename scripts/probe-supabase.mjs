// Probe Supabase via supabase-js — same client the app uses.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://odnszwngptfqozrxexri.supabase.co',
    'sb_publishable_D1C1g7YMqbgx8I3kqPhHSQ_PwXyTtWS'
);

const log = (...args) => console.log(...args);

async function main() {
    // 1) Auth
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'password123',
    });
    if (authErr) { log('AUTH FAILED:', authErr); process.exit(1); }
    log('=== AUTH OK ===  user:', auth.user.email);

    // 2) Read all tables
    log('\n=== READS ===');
    const tables = ['machines', 'technicians', 'interventions', 'spare_parts', 'suppliers', 'purchase_orders', 'production_metrics', 'personnel'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('id');
        if (error) log(`[READ ${t}] FAILED:`, error.message);
        else log(`[READ ${t}] ${data.length} rows`);
    }

    // 3) Show all machines
    log('\n=== MACHINES detail ===');
    const { data: machines } = await supabase.from('machines').select('id, code, name, status');
    machines.forEach(m => log(`  ${m.id}  ${m.code}  "${m.name}"  [${m.status}]`));

    // 4) CRUD round-trip
    log('\n=== CRUD round-trip on machines ===');
    const testId = `mach-probe-${Date.now()}`;
    const { data: ins, error: insErr } = await supabase.from('machines').insert({
        id: testId,
        code: 'NODE-PROBE',
        name: 'Node probe machine',
        type: 'Tissage',
        status: 'opérationnelle',
        hourlyDowntimeCost: 100,
        importanceLevel: 1,
        criticalityScore: 0,
    }).select().single();
    if (insErr) log('[INSERT] FAILED:', insErr.message);
    else log(`[INSERT] OK id=${ins.id} code=${ins.code}`);

    const { data: upd, error: updErr } = await supabase.from('machines').update({
        status: 'en panne',
        hourlyDowntimeCost: 500,
    }).eq('id', testId).select().single();
    if (updErr) log('[UPDATE] FAILED:', updErr.message);
    else log(`[UPDATE] OK status=${upd.status} cost=${upd.hourlyDowntimeCost}`);

    const { error: delErr } = await supabase.from('machines').delete().eq('id', testId);
    if (delErr) log('[DELETE] FAILED:', delErr.message);
    else log('[DELETE] OK');

    const { data: after } = await supabase.from('machines').select('id');
    log(`[final count] ${after.length}`);

    // 5) Test realtime channel connects
    log('\n=== REALTIME ===');
    const channel = supabase.channel('probe-test')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, () => { })
        .subscribe((status) => {
            log(`[realtime status] ${status}`);
            if (status === 'SUBSCRIBED') {
                supabase.removeChannel(channel);
                supabase.auth.signOut();
                log('\n=== ALL CHECKS PASSED ===');
                process.exit(0);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                log('FAIL: realtime did not subscribe');
                process.exit(1);
            }
        });

    setTimeout(() => { log('Realtime timed out after 10s'); process.exit(1); }, 10000);
}

main().catch(e => { console.error('Crashed:', e); process.exit(1); });
