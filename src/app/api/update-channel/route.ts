// ============================================================
// GET /api/update-channel — returns the update channel URL the
// launcher uses (read from update-channel.txt at install root).
// The UpdateNotifier component polls <channel>/version.txt to
// detect newer releases. Empty string if the file is missing.
// ============================================================

import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const file = path.join(process.cwd(), 'update-channel.txt');
        const raw = await readFile(file, 'utf8');
        return Response.json({ channel: raw.trim() }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch {
        return Response.json({ channel: '' }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}
