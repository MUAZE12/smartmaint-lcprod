'use client';

// In-app pop-ups gated by the Settings → Notifications toggles.
//
// Watches DataContext and fires a Toast whenever a new event lands, but
// only if the matching toggle is on. Uses refs to remember what was already
// seen so a re-render doesn't re-fire the same toast, and skips the first
// render entirely so the admin isn't blasted with historical items when
// the app boots.

import { useEffect, useRef } from 'react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';

interface NotifPrefs { stock: boolean; panne: boolean; validation: boolean; email: boolean }
const DEFAULTS: NotifPrefs = { stock: true, panne: true, validation: true, email: false };

function readPrefs(): NotifPrefs {
    if (typeof localStorage === 'undefined') return DEFAULTS;
    try {
        const raw = localStorage.getItem('smartmaint-notif-prefs');
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw);
        return {
            stock: parsed.stock !== false,
            panne: parsed.panne !== false,
            validation: parsed.validation !== false,
            email: parsed.email === true,
        };
    } catch { return DEFAULTS; }
}

export default function NotifWatcher() {
    const { user } = useAuth();
    const { machines, spareParts, purchaseOrders } = useData();
    const { showToast } = useToast();

    // Snapshot the ids we've already seen. Populated on first render → the
    // baseline. Only NEW ids in subsequent renders trigger a toast.
    const seenPanneIds = useRef<Set<string> | null>(null);
    const seenLowStockIds = useRef<Set<string> | null>(null);
    const seenPendingPoIds = useRef<Set<string> | null>(null);

    useEffect(() => {
        // Only for admin — the operator/technician UIs have their own signals.
        if (!user || user.role !== 'admin') return;
        const prefs = readPrefs();

        // ── Machines en panne ──
        const brokenNow = new Set(machines.filter(m => m.status === 'en panne').map(m => m.id));
        if (seenPanneIds.current === null) {
            seenPanneIds.current = brokenNow;
        } else {
            const fresh = [...brokenNow].filter(id => !seenPanneIds.current!.has(id));
            if (prefs.panne) {
                for (const id of fresh) {
                    const m = machines.find(x => x.id === id);
                    if (m) showToast(`🔴 Panne — ${m.code} ${m.name}`, 'error');
                }
            }
            seenPanneIds.current = brokenNow;
        }

        // ── Stock critique ──
        const lowNow = new Set(spareParts.filter(p => p.quantity <= p.minimumStock).map(p => p.id));
        if (seenLowStockIds.current === null) {
            seenLowStockIds.current = lowNow;
        } else {
            const fresh = [...lowNow].filter(id => !seenLowStockIds.current!.has(id));
            if (prefs.stock) {
                for (const id of fresh) {
                    const p = spareParts.find(x => x.id === id);
                    if (p) showToast(`📦 Stock critique — ${p.name} (${p.quantity} en stock)`, 'error');
                }
            }
            seenLowStockIds.current = lowNow;
        }

        // ── Bons de commande à valider ──
        const pendingNow = new Set(purchaseOrders.filter(po => po.approvalStatus === 'en attente').map(po => po.id));
        if (seenPendingPoIds.current === null) {
            seenPendingPoIds.current = pendingNow;
        } else {
            const fresh = [...pendingNow].filter(id => !seenPendingPoIds.current!.has(id));
            if (prefs.validation) {
                for (const id of fresh) {
                    const po = purchaseOrders.find(x => x.id === id);
                    if (po) showToast(`📄 BC à valider — ${po.poNumber} (${po.totalAmount.toLocaleString('fr-FR')} MAD)`);
                }
            }
            seenPendingPoIds.current = pendingNow;
        }
    }, [user, machines, spareParts, purchaseOrders, showToast]);

    return null;
}
