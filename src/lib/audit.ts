// ============================================================
// SmartMaint — L.C PROD  ·  Audit trail
// ------------------------------------------------------------
// `recordAudit` appends one row to `audit_log` for every
// create / update / delete made through `db.ts`. It is wired
// into the CRUD helpers by `auditWrap` — pages never call it
// directly. It is strictly best-effort: a failure to log must
// never break or block the action the user actually performed.
// ============================================================

import { supabase } from './supabase';

// The signed-in user's name, kept in module scope so the
// (non-React) db.ts layer can attribute changes. DataContext
// pushes it on every auth change via `setAuditUser`.
let currentUser: string | null = null;

/** Called by DataContext when the signed-in user changes. */
export function setAuditUser(name: string | null) {
    currentUser = name;
}

function uid() {
    return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Append an entry to the audit log. Fire-and-forget — never throws,
 * never awaited by callers, never disrupts the originating action.
 */
export function recordAudit(action: string, entityType: string, entityId: string, summary: string) {
    try {
        const row = {
            id: uid(),
            action,
            entityType,
            entityId,
            summary: (summary || '').slice(0, 280),
            userName: currentUser || 'Système',
            createdAt: new Date().toISOString(),
        };
        // Thenable — resolve/reject both swallowed on purpose.
        supabase.from('audit_log').insert(row).then(() => { }, () => { });
    } catch {
        /* auditing must never disrupt the app */
    }
}
