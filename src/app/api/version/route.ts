// ============================================================
// GET /api/version — returns the installed app's version string.
// Read from version.txt at the Next process cwd (the install root,
// where the launcher placed both .next and version.txt).
// The UpdateNotifier polls this and compares with the remote
// version.txt published on the update channel.
// ============================================================

import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const file = path.join(process.cwd(), 'version.txt');
        const raw = await readFile(file, 'utf8');
        return Response.json({ version: raw.trim() }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch {
        return Response.json({ version: '' }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}
