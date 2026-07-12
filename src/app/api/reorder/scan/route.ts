// Manual "kick" for auto-reorder — walks every spare part in stock,
// creates a purchase requisition for every part below its threshold that
// doesn't already have an open PR. Admin uses this when a webhook isn't
// wired up yet OR to confirm the flow works end-to-end.
//
// Idempotent: an open PR covering a part skips creation.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isApiCallAuthorized, unauthorizedResponse } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Part {
    id: string;
    name: string;
    quantity: number;
    minimumStock: number;
    unitCost: number;
    machineId: string | null;
}

interface OpenLine { id: string; requisitionId: string; sparePartId: string }
interface OpenReq { id: string; status: string }

export async function POST(request: Request) {
    if (!isApiCallAuthorized(request)) return unauthorizedResponse() as unknown as NextResponse;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase env vars manquantes' }, { status: 500 });

    const sb = createClient(url, key);

    // 1. Load low-stock parts.
    const { data: partsRaw, error: partsErr } = await sb
        .from('spare_parts')
        .select('id, name, quantity, minimumStock, unitCost, machineId');
    if (partsErr) return NextResponse.json({ ok: false, error: partsErr.message }, { status: 500 });
    const parts = (partsRaw ?? []) as Part[];
    const low = parts.filter(p => p.quantity <= p.minimumStock);
    if (low.length === 0) {
        return NextResponse.json({ ok: true, scanned: parts.length, low: 0, created: 0, skipped: 0, message: 'Aucune pièce sous seuil — rien à commander.' });
    }

    // 2. Load open PR lines so we don't duplicate.
    const partIds = low.map(p => p.id);
    const { data: openLines } = await sb
        .from('purchase_requisition_lines')
        .select('id, requisitionId, sparePartId')
        .in('sparePartId', partIds);
    const reqIds = Array.from(new Set(((openLines ?? []) as OpenLine[]).map(l => l.requisitionId)));
    const { data: openReqs } = reqIds.length > 0
        ? await sb.from('purchase_requisitions').select('id, status').in('id', reqIds)
        : { data: [] as OpenReq[] };
    const openReqIds = new Set(
        ((openReqs ?? []) as OpenReq[])
            .filter(r => r.status !== 'convertie' && r.status !== 'rejetée')
            .map(r => r.id)
    );
    const coveredPartIds = new Set(
        ((openLines ?? []) as OpenLine[])
            .filter(l => openReqIds.has(l.requisitionId))
            .map(l => l.sparePartId)
    );

    // 3. Create fresh PRs for uncovered low-stock parts.
    let created = 0;
    for (const p of low) {
        if (coveredPartIds.has(p.id)) continue;
        const reqNumber = 'REQ-AUTO-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5);
        const reqId = `req-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const qty = Math.max(p.minimumStock, p.minimumStock * 2 - p.quantity);

        const { error: reqErr } = await sb.from('purchase_requisitions').insert({
            id: reqId,
            reqNumber,
            status: 'soumise',
            machineId: p.machineId,
            interventionId: null,
            requestedBy: 'Réapprovisionnement automatique (scan)',
            notes: `Stock critique — ${p.name} : ${p.quantity} en stock / seuil ${p.minimumStock}. Créée depuis /api/reorder/scan.`,
            createdAt: new Date().toISOString(),
        });
        if (reqErr) continue;
        const { error: lineErr } = await sb.from('purchase_requisition_lines').insert({
            id: `rql-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            requisitionId: reqId,
            sparePartId: p.id,
            quantity: qty,
            estimatedUnitCost: p.unitCost,
            createdAt: new Date().toISOString(),
        });
        if (!lineErr) created++;
    }

    return NextResponse.json({
        ok: true,
        scanned: parts.length,
        low: low.length,
        created,
        skipped: low.length - created,
        message: created > 0
            ? `${created} demande(s) d'achat créée(s) automatiquement.`
            : 'Toutes les pièces sous seuil sont déjà couvertes par une demande ouverte.',
    });
}
