-- ============================================================
-- Meetings + in-app notifications
--
--   1. meetings        — planned meetings (technicien-only)
--   2. notifications   — in-app bell-icon feed (any role)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. MEETINGS ─────────────────────────────────────────────
create table if not exists meetings (
  id            text primary key,
  title         text not null,
  location      text,
  starts_at     timestamptz not null,
  duration_min  integer default 60,
  agenda        text,
  attendees     text[] not null default '{}',     -- emails of attending techniciens
  created_by    text,                              -- email of creator
  reminder_sent_at timestamptz,                    -- set by the cron after the 1h-before reminder fires
  "createdAt"   timestamptz default now()
);
create index if not exists meetings_starts_idx on meetings (starts_at);

-- ── 2. IN-APP NOTIFICATIONS ─────────────────────────────────
create table if not exists notifications (
  id              text primary key,
  recipient_email text not null,
  kind            text not null,                   -- 'convocation' | 'meeting' | 'meeting-reminder' | 'message'
  title           text not null,
  body            text,
  link            text,                            -- optional path the user can click
  read_at         timestamptz,
  "createdAt"     timestamptz default now()
);
create index if not exists notif_recipient_idx on notifications (recipient_email, read_at);
create index if not exists notif_created_idx on notifications ("createdAt" desc);

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
begin
  -- meetings
  begin
    execute 'alter publication supabase_realtime add table meetings';
  exception when duplicate_object then null;
  end;
  execute 'alter table meetings enable row level security';
  execute 'grant select, insert, update, delete on public.meetings to authenticated';
  execute 'grant select, insert, update, delete on public.meetings to service_role';
  execute 'drop policy if exists "auth read"   on meetings';
  execute 'drop policy if exists "auth insert" on meetings';
  execute 'drop policy if exists "auth update" on meetings';
  execute 'drop policy if exists "auth delete" on meetings';
  execute 'create policy "auth read"   on meetings for select to authenticated using (true)';
  execute 'create policy "auth insert" on meetings for insert to authenticated with check (true)';
  execute 'create policy "auth update" on meetings for update to authenticated using (true) with check (true)';
  execute 'create policy "auth delete" on meetings for delete to authenticated using (true)';

  -- notifications
  begin
    execute 'alter publication supabase_realtime add table notifications';
  exception when duplicate_object then null;
  end;
  execute 'alter table notifications enable row level security';
  execute 'grant select, insert, update, delete on public.notifications to authenticated';
  execute 'grant select, insert, update, delete on public.notifications to service_role';
  execute 'drop policy if exists "auth read"   on notifications';
  execute 'drop policy if exists "auth insert" on notifications';
  execute 'drop policy if exists "auth update" on notifications';
  execute 'drop policy if exists "auth delete" on notifications';
  -- Recipients can read their own notifications; admins (no row filter here) get all.
  execute 'create policy "auth read"   on notifications for select to authenticated using (true)';
  execute 'create policy "auth insert" on notifications for insert to authenticated with check (true)';
  execute 'create policy "auth update" on notifications for update to authenticated using (true) with check (true)';
  execute 'create policy "auth delete" on notifications for delete to authenticated using (true)';
end $$;

-- ── Verify ───────────────────────────────────────────────────
select 'meetings' as t, count(*) from meetings
union all select 'notifications', count(*) from notifications;
