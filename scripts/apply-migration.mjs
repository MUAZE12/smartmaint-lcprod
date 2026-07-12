// One-shot DDL applier: posts the SQL file to Supabase's pg-meta /query
// endpoint using the service_role key. This works in modern Supabase
// projects without exposing the Postgres password — same path the dashboard
// SQL editor uses internally.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const SUPABASE_URL = 'https://odnszwngptfqozrxexri.supabase.co';
const SERVICE_KEY = readFileSync(join(projectRoot, 'publish-secret.txt'), 'utf8').trim();
const sqlFile = process.argv[2] || 'supabase/profile-imageurl.sql';
const sql = readFileSync(join(projectRoot, sqlFile), 'utf8');

console.log(`Applying ${sqlFile} →`);
console.log(sql);

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
if (!res.ok) process.exit(1);
