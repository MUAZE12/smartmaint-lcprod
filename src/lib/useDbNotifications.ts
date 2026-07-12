'use client';

// ============================================================
// useDbNotifications — pulls rows from the `notifications` table
// targeted at the currently-logged-in user, with realtime updates.
//
// Returns:
//   list: Notification[]               (in the same shape as buildLiveNotifications)
//   unreadIds: Set<string>             (DB rows that are still unread)
//   markAllReadDb: () => Promise<void> (stamps read_at on all unread rows)
//
// The Header bell merges these with derived notifications so the user
// sees one unified feed.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/notifications';

interface DbRow {
    id: string;
    recipient_email: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    createdAt: string;
}

const iconFor = (kind: string): { icon: string; color: string } => {
    if (kind === 'convocation') return { icon: '📣', color: '#dc2626' };
    if (kind === 'meeting') return { icon: '📅', color: '#3b82f6' };
    if (kind === 'meeting-reminder') return { icon: '⏰', color: '#d97706' };
    if (kind === 'message') return { icon: '📩', color: '#3b82f6' };
    return { icon: '🔔', color: '#64748b' };
};

export function useDbNotifications(userEmail: string | undefined) {
    const [rows, setRows] = useState<DbRow[]>([]);

    const fetchRows = useCallback(async () => {
        if (!userEmail) { setRows([]); return; }
        const { data } = await supabase.from('notifications')
            .select('*')
            .eq('recipient_email', userEmail)
            .order('createdAt', { ascending: false })
            .limit(30);
        setRows((data ?? []) as DbRow[]);
    }, [userEmail]);

    useEffect(() => {
        fetchRows();
        if (!userEmail) return;
        // Realtime — pick up convocations / meeting reminders as they're inserted
        const ch = supabase.channel(`notif-${userEmail}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'notifications',
                filter: `recipient_email=eq.${userEmail}`,
            }, () => { fetchRows(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [userEmail, fetchRows]);

    const markAllReadDb = useCallback(async () => {
        if (!userEmail) return;
        const now = new Date().toISOString();
        await supabase.from('notifications')
            .update({ read_at: now })
            .eq('recipient_email', userEmail)
            .is('read_at', null);
        await fetchRows();
    }, [userEmail, fetchRows]);

    const markOneRead = useCallback(async (id: string) => {
        const now = new Date().toISOString();
        await supabase.from('notifications').update({ read_at: now }).eq('id', id);
        setRows(prev => prev.map(r => r.id === id ? { ...r, read_at: now } : r));
    }, []);

    const list: Notification[] = rows.map(r => {
        const ic = iconFor(r.kind);
        return {
            id: `db-${r.id}`,
            title: r.title,
            message: r.body ?? '',
            timestamp: r.createdAt,
            icon: ic.icon,
            color: ic.color,
            link: r.link ?? '#',
        };
    });

    const unreadIds = new Set(
        rows.filter(r => !r.read_at).map(r => `db-${r.id}`),
    );

    return { list, unreadIds, markAllReadDb, markOneRead, rawIdFromKey: (key: string) => key.startsWith('db-') ? key.slice(3) : null };
}
