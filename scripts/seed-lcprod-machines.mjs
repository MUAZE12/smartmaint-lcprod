// Upsert the 12 real L.C PROD machines into the database. Matches each
// row by name (fuzzy) — if the machine already exists it is updated with
// the canonical Zone / Ligne / Type / Fonction / État; otherwise it is
// created with sane defaults.
//
//   node scripts/seed-lcprod-machines.mjs
//
// Requires the `line` and `function` columns to exist on the machines
// table (see supabase/machines-process-metadata.sql).

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

// The 12 machines straight from the L.C PROD process sheet.
// `code` follows the existing naming convention used elsewhere in the app.
const MACHINES = [
    { code: 'POM-001', name: 'Pompe de transfert huile', workshop: 'Réception MP', line: 'Réception',  type: 'Pompe',        function: 'Transfert matière première',     hourlyDowntimeCost: 250, importanceLevel: 7 },
    { code: 'FIL-001', name: 'Filtre industriel',         workshop: 'Traitement',   line: 'Préparation', type: 'Filtration',  function: 'Filtrer les impuretés',           hourlyDowntimeCost: 280, importanceLevel: 8 },
    { code: 'MEL-001', name: 'Cuve de mélange',           workshop: 'Production',   line: 'Ligne 1',     type: 'Mélangeur',   function: 'Mélange produit',                 hourlyDowntimeCost: 420, importanceLevel: 9 },
    { code: 'ECH-001', name: 'Échangeur thermique',       workshop: 'Production',   line: 'Ligne 1',     type: 'Chauffage',   function: 'Traitement thermique',            hourlyDowntimeCost: 460, importanceLevel: 9 },
    { code: 'CNV-001', name: 'Convoyeur bouteilles',      workshop: 'Conditionnement', line: 'Ligne 1', type: 'Convoyeur',   function: 'Transport bouteilles',            hourlyDowntimeCost: 180, importanceLevel: 6 },
    { code: 'REM-001', name: 'Remplisseuse automatique',  workshop: 'Remplissage',  line: 'Ligne 1',     type: 'Remplisseuse', function: 'Remplissage bouteilles',         hourlyDowntimeCost: 520, importanceLevel: 10 },
    { code: 'BOU-001', name: 'Bouchonneuse automatique',  workshop: 'Conditionnement', line: 'Ligne 1', type: 'Bouchonneuse', function: 'Fermeture bouteilles',           hourlyDowntimeCost: 380, importanceLevel: 9 },
    { code: 'ETQ-001', name: 'Étiqueteuse automatique',   workshop: 'Conditionnement', line: 'Ligne 1', type: 'Étiqueteuse', function: 'Pose étiquettes',                hourlyDowntimeCost: 320, importanceLevel: 8 },
    { code: 'EMB-001', name: 'Machine d\'emballage',      workshop: 'Emballage',    line: 'Ligne 1',     type: 'Emballage',   function: 'Mise en cartons',                 hourlyDowntimeCost: 360, importanceLevel: 8 },
    { code: 'PAL-001', name: 'Palettiseur',               workshop: 'Expédition',   line: 'Fin de ligne', type: 'Palettiseur', function: 'Palettisation',                 hourlyDowntimeCost: 300, importanceLevel: 7 },
    { code: 'CMP-001', name: 'Compresseur air',           workshop: 'Utilités',     line: 'Général',     type: 'Compresseur', function: 'Fournir air comprimé',           hourlyDowntimeCost: 600, importanceLevel: 9 },
    { code: 'CHD-001', name: 'Chaudière industrielle',    workshop: 'Utilités',     line: 'Général',     type: 'Chaudière',   function: 'Production vapeur/chaleur',       hourlyDowntimeCost: 700, importanceLevel: 10 },
];

function uid() { return `mach-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

async function main() {
    const { data: existing, error } = await supabase
        .from('machines')
        .select('id, code, name');
    if (error) throw new Error(error.message);
    const byCode = new Map((existing || []).map(m => [m.code, m]));
    const byNameLower = new Map((existing || []).map(m => [m.name.toLowerCase(), m]));

    let updated = 0, created = 0, errored = 0;
    for (const spec of MACHINES) {
        // Match priority: code first, then name (case-insensitive, contains).
        let target = byCode.get(spec.code) || byNameLower.get(spec.name.toLowerCase());
        if (!target) {
            // Looser fuzzy: any existing name that contains the key word.
            const key = spec.name.split(' ')[0].toLowerCase();
            target = (existing || []).find(m => m.name.toLowerCase().includes(key) && !byCode.has(spec.code));
        }
        const payload = {
            code: spec.code,
            name: spec.name,
            workshop: spec.workshop,
            line: spec.line,
            function: spec.function,
            type: spec.type,
            status: 'opérationnelle',                       // « En service » → opérationnelle
            hourlyDowntimeCost: spec.hourlyDowntimeCost,
            importanceLevel: spec.importanceLevel,
        };
        if (target) {
            const { error: upErr } = await supabase.from('machines').update(payload).eq('id', target.id);
            if (upErr) { console.log(`✗ update ${spec.code}: ${upErr.message}`); errored++; }
            else { console.log(`= ${spec.code.padEnd(8)} ${spec.name}`); updated++; }
        } else {
            const id = uid();
            const { error: insErr } = await supabase.from('machines').insert({
                id,
                ...payload,
                installationDate: new Date(Date.now() - 365 * 86400000).toISOString(),
                criticalityScore: spec.importanceLevel * 8,
                createdAt: new Date().toISOString(),
            });
            if (insErr) { console.log(`✗ insert ${spec.code}: ${insErr.message}`); errored++; }
            else { console.log(`+ ${spec.code.padEnd(8)} ${spec.name}`); created++; }
        }
    }
    console.log(`\n✓ ${updated} mises à jour · + ${created} créées · ✗ ${errored} erreurs · total ${MACHINES.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
