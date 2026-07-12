// Backfill the `personnel` table with the operator / technician auth users
// already created via `create-accounts.mjs`. They existed only in Supabase
// Auth (with role/full_name in user_metadata), so the in-app /personnel
// page didn't show them. This script reads every auth user, derives the
// employee row from user_metadata, and inserts it if missing.
//
//   node scripts/backfill-personnel.mjs
//
// Re-runnable — checks email before inserting.

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

const SPECIALTIES_BY_TYPE = {
    Mécanique: 'Mécanique',
    'Électricité industrielle': 'Électricité industrielle',
    'Hydraulique / pneumatique': 'Hydraulique',
    Automatisme: 'Automatisme',
};

async function listAllUsers() {
    const out = [];
    let page = 1;
    while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        out.push(...data.users);
        if (data.users.length < 200) break;
        page++;
    }
    return out;
}

async function existingPersonnelEmails() {
    const { data, error } = await supabase.from('personnel').select('email');
    if (error) throw new Error(error.message);
    return new Set((data || []).map(r => (r.email || '').toLowerCase()).filter(Boolean));
}

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
    const users = await listAllUsers();
    const existing = await existingPersonnelEmails();
    console.log(`Auth users : ${users.length} · déjà dans personnel : ${existing.size}`);

    let inserted = 0;
    let skipped = 0;
    for (const u of users) {
        const meta = u.user_metadata || {};
        const role = meta.role;
        if (role !== 'operator' && role !== 'technician') { skipped++; continue; }
        const email = (u.email || '').toLowerCase();
        if (!email) { skipped++; continue; }
        if (existing.has(email)) { skipped++; continue; }

        const personnelRole = role === 'technician' ? 'technicien' : 'operateur';
        const row = {
            id: uid(role === 'technician' ? 'tech' : 'op'),
            nom: meta.full_name || u.email.split('@')[0],
            role: personnelRole,
            specialite: role === 'technician' ? (meta.specialty || SPECIALTIES_BY_TYPE.Mécanique) : 'Conduite de ligne',
            telephone: meta.phone || '',
            email,
            statut: 'actif',
            createdAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('personnel').insert(row);
        if (error) {
            console.log(`✗ ${email}: ${error.message}`);
            continue;
        }
        console.log(`+ ${row.nom.padEnd(28)} (${personnelRole}) ${email}`);
        inserted++;
    }

    console.log(`\n✓ ${inserted} insérés · = ${skipped} ignorés · total auth = ${users.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
