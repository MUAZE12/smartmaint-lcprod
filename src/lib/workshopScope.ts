// ============================================================
// workshopScope.ts — client-side workshop filter.
//
// RLS enforces this at the DB (per-workshop-rls.sql). This module is
// the client mirror — it filters realtime patches BEFORE they reach
// the UI, so a broken RLS doesn't leak cross-workshop data into
// component state. Defense in depth.
//
// Reads workshop_access from the current session at every call —
// cheap because Supabase caches the JWT.
// ============================================================

import type { Session } from '@supabase/supabase-js';

interface HasWorkshop { workshop?: string | null }
interface HasMachineId { machine_id?: string | null; machineId?: string | null }

/** Extract workshop_access from the JWT metadata. `null` = admin (see-all). */
export function workshopAccess(session: Session | null): string[] | null {
    if (!session) return null;
    const meta = session.user.user_metadata ?? {};
    const app = session.user.app_metadata ?? {};
    const role = meta.role ?? app.role;
    if (!role || role === 'admin') return null;   // admins bypass
    const list = meta.workshop_access ?? app.workshop_access;
    if (!Array.isArray(list)) return [];
    return list.map(String);
}

/** True if the item is visible for the given access list (null = see-all). */
export function isVisible(item: HasWorkshop, access: string[] | null): boolean {
    if (access === null) return true;
    if (!item.workshop) return false;
    return access.includes(item.workshop);
}

/** Filter a machines array by access. */
export function filterMachines<T extends HasWorkshop>(items: readonly T[], access: string[] | null): T[] {
    if (access === null) return [...items];
    return items.filter(m => isVisible(m, access));
}

/** Filter items with a `machine_id` by their machine's workshop. */
export function filterByMachine<T extends HasMachineId>(
    items: readonly T[],
    machineWorkshop: Map<string, string>,
    access: string[] | null,
): T[] {
    if (access === null) return [...items];
    return items.filter(x => {
        const mid = x.machine_id ?? x.machineId;
        if (!mid) return true;   // items without machine (e.g. relief_requests) pass — they're user-scoped
        const ws = machineWorkshop.get(mid);
        return !!ws && access.includes(ws);
    });
}

/** Build a fast lookup for the machine → workshop mapping. */
export function machineWorkshopMap(machines: ReadonlyArray<{ id: string; workshop?: string | null }>): Map<string, string> {
    const m = new Map<string, string>();
    for (const x of machines) {
        if (x.workshop) m.set(x.id, x.workshop);
    }
    return m;
}
