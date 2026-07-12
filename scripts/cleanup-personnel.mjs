// Remove demo / legacy personnel rows so the /personnel directory shows
// exactly the 35 employees from comptes-utilisateurs.csv (5 techniciens
// + 30 ouvriers). Admins live only in Supabase Auth (role 'admin') — the
// personnel table accepts technicien|operateur only.
//
//   node scripts/cleanup-personnel.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SUPABASE_URL = 'https://odnszwngptfqozrxexri.supabase.co';
const SERVICE_KEY = readFileSync(join(root, 'publish-secret.txt'), 'utf8').trim();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// Parse the CSV to get the canonical employee email list.
function loadKeepList() {
    const csv = readFileSync(join(root, 'comptes-utilisateurs.csv'), 'utf8');
    const lines = csv.split(/\r?\n/).slice(1).filter(Boolean);
    const out = new Set();
    for (const line of lines) {
        // Simple parser — handles the quoted full_name column.
        const cells = line.match(/("([^"]*)"|[^,]+)/g) || [];
        const role = cells[0];
        const email = cells[2]?.replace(/^"|"$/g, '').toLowerCase();
        if (!email) continue;
        if (role === 'technician' || role === 'operator') out.add(email);
    }
    return out;
}

async function main() {
    const keep = loadKeepList();
    console.log(`Garder ${keep.size} emails de la CSV.`);

    const { data: rows, error } = await supabase
        .from('personnel')
        .select('id, nom, role, email');
    if (error) throw new Error(error.message);

    let deleted = 0, kept = 0;
    for (const r of rows) {
        const email = (r.email || '').toLowerCase();
        if (keep.has(email)) {
            kept++; continue;
        }
        const { error: delErr } = await supabase.from('personnel').delete().eq('id', r.id);
        if (delErr) {
            console.log(`✗ delete ${r.nom} (${email}): ${delErr.message}`);
            continue;
        }
        console.log(`− ${r.nom.padEnd(28)} ${email}`);
        deleted++;
    }
    console.log(`\n✓ ${kept} gardés · − ${deleted} supprimés · total ${rows.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
