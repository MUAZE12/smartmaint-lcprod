// Create 37 Supabase auth users (2 admins, 5 techs, 30 operators) +
// matching rows in the `technicians` table. Uses service_role.
//
//   node scripts/create-accounts.mjs
//
// Re-runnable: skips emails that already exist.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const SUPABASE_URL = 'https://odnszwngptfqozrxexri.supabase.co';
const SERVICE_KEY = readFileSync(join(projectRoot, 'publish-secret.txt'), 'utf8').trim();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const TEMP_PASSWORD = 'LCProd2026!';

const admins = [
    { prenom: 'Mustapha', nom: 'Baroudi', poste: 'Responsable maintenance' },
    { prenom: 'Mounir', nom: 'Lahnine', poste: 'Responsable maintenance' },
];

const techniciens = [
    { prenom: 'Safae', nom: 'Salami', specialty: 'Mécanique' },
    { prenom: 'Yassir', nom: 'Bouchnaf', specialty: 'Électricité industrielle' },
    { prenom: 'Mouhamed', nom: 'Maaqoul', specialty: 'Hydraulique / pneumatique' },
    { prenom: 'Ilyass', nom: 'Mansori', specialty: 'Automatisme' },
    { prenom: 'Mohcine', nom: 'Tebaa', specialty: 'Mécanique' },
];

// 30 Moroccan ouvriers — prénoms/noms réalistes, mix masculin/féminin.
const ouvriers = [
    { prenom: 'Hamza', nom: 'Bennani' },
    { prenom: 'Karim', nom: 'El Fassi' },
    { prenom: 'Youssef', nom: 'Amrani' },
    { prenom: 'Said', nom: 'Benkirane' },
    { prenom: 'Rachid', nom: 'Berrada' },
    { prenom: 'Khalid', nom: 'Tazi' },
    { prenom: 'Abdellah', nom: 'Cherkaoui' },
    { prenom: 'Omar', nom: 'Sebti' },
    { prenom: 'Mehdi', nom: 'Idrissi' },
    { prenom: 'Anas', nom: 'Lazrak' },
    { prenom: 'Hicham', nom: 'Belmekki' },
    { prenom: 'Tarik', nom: 'Bouazza' },
    { prenom: 'Nabil', nom: 'Chraibi' },
    { prenom: 'Adil', nom: 'Mekouar' },
    { prenom: 'Hassan', nom: 'Ouazzani' },
    { prenom: 'Mostafa', nom: 'Hajji' },
    { prenom: 'Brahim', nom: 'Bouhaddou' },
    { prenom: 'Aziz', nom: 'Naciri' },
    { prenom: 'Abdelilah', nom: 'Drissi' },
    { prenom: 'Jamal', nom: 'Skalli' },
    { prenom: 'Fatima', nom: 'Ait Ali' },
    { prenom: 'Salma', nom: 'Boukili' },
    { prenom: 'Naima', nom: 'El Khattabi' },
    { prenom: 'Asmae', nom: 'Belhaj' },
    { prenom: 'Imane', nom: 'Rahmouni' },
    { prenom: 'Khadija', nom: 'Sefrioui' },
    { prenom: 'Hanane', nom: 'Bennis' },
    { prenom: 'Latifa', nom: 'Kabbaj' },
    { prenom: 'Souad', nom: 'Ziani' },
    { prenom: 'Meryem', nom: 'Alaoui' },
];

if (ouvriers.length !== 30) {
    console.error('Liste ouvriers doit contenir 30 entrées, trouvé', ouvriers.length);
    process.exit(1);
}

/** Normalize "Mouhamed El Fassi" → "mouhamed.elfassi" — strip accents, spaces, dashes. */
function localPart(prenom, nom) {
    const clean = s => s
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    return `${clean(prenom)}.${clean(nom)}`;
}

function emailOf(p, n) { return `${localPart(p, n)}@lcprod.ma`; }

async function userExistsByEmail(email) {
    // Paginated admin search — Supabase Auth API doesn't expose an
    // email-only lookup, but it's a small org so we walk all pages.
    let page = 1;
    while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const hit = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (hit) return hit;
        if (data.users.length < 200) return null;
        page++;
    }
}

async function createOne({ prenom, nom, role, poste, specialty }) {
    const email = emailOf(prenom, nom);
    const full_name = `${prenom} ${nom}`;
    const existing = await userExistsByEmail(email);
    if (existing) {
        console.log(`= ${email.padEnd(40)} (déjà existant — skip)`);
        return { email, full_name, role, status: 'exists', userId: existing.id };
    }
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
        email_confirm: true,
        user_metadata: { role, full_name, poste: poste ?? (role === 'technician' ? 'Technicien maintenance' : role === 'admin' ? 'Responsable maintenance' : 'Opérateur production') },
    });
    if (error) {
        console.log(`✗ ${email.padEnd(40)} ERREUR: ${error.message}`);
        return { email, full_name, role, status: 'error', err: error.message };
    }
    console.log(`✓ ${email.padEnd(40)} (${role})`);
    return { email, full_name, role, status: 'created', userId: data.user.id };
}

async function ensureTechnicianRow({ prenom, nom, specialty }) {
    const email = emailOf(prenom, nom);
    const full_name = `${prenom} ${nom}`;
    // Skip if a row with this email already exists.
    const { data: existing } = await supabase
        .from('technicians').select('id').eq('email', email).maybeSingle();
    if (existing) {
        console.log(`  = technicians row déjà présente pour ${email}`);
        return;
    }
    const row = {
        id: `tech-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: full_name,
        specialty,
        phone: '',
        email,
        availability: 'disponible',
        createdAt: new Date().toISOString(),
    };
    const { error } = await supabase.from('technicians').insert(row);
    if (error) console.log(`  ⚠ technicians insert ${email}: ${error.message}`);
    else console.log(`  + technicians row insérée pour ${email}`);
}

async function main() {
    const results = [];
    console.log('\n── ADMINS (2) ──');
    for (const a of admins) results.push(await createOne({ ...a, role: 'admin' }));

    console.log('\n── TECHNICIENS (5) ──');
    for (const t of techniciens) {
        const r = await createOne({ ...t, role: 'technician' });
        results.push(r);
        if (r.status !== 'error') await ensureTechnicianRow(t);
    }

    console.log('\n── OUVRIERS (30) ──');
    for (const o of ouvriers) results.push(await createOne({ ...o, role: 'operator' }));

    // Write a CSV the user can hand out — useful for the first rollout.
    const csv = [
        'role,full_name,email,mot_de_passe_temporaire,status',
        ...results.map(r => `${r.role},"${r.full_name}",${r.email},${TEMP_PASSWORD},${r.status}`),
    ].join('\n');
    const csvPath = join(projectRoot, 'comptes-utilisateurs.csv');
    writeFileSync(csvPath, csv, 'utf8');
    console.log(`\n📄 CSV des comptes écrit dans: ${csvPath}`);

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'exists').length;
    const errored = results.filter(r => r.status === 'error').length;
    console.log(`\n✓ ${created} créés · = ${skipped} déjà existants · ✗ ${errored} erreurs · total ${results.length}`);
    if (errored > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
