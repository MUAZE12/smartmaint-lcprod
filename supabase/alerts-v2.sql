-- ============================================================
-- Alerts v2 — server-side history + cooldown + custom settings
--
-- 1. alert_history     — every email ever sent (audit, dashboard)
-- 2. alert_cooldown    — last-fired timestamp per condition for dedup
--
-- New app_settings keys consumed by the server (no migration needed,
-- the app_settings table is generic key/value):
--   alert_schedule_hour  '0'..'23' (UTC hour for daily cron — informative only;
--                                   real schedule lives in vercel.json. The
--                                   server still respects this for the in-app
--                                   AlertWatcher.)
--   alert_quiet_start    '0'..'23' (start of quiet hours, e.g. '22')
--   alert_quiet_end      '0'..'23' (end of quiet hours, e.g. '6')
--   alert_cooldown_min   integer minutes between same-key alerts (default 60)
--   alert_autoreorder    'on' | 'off'  (server-side auto-reorder toggle)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. ALERT HISTORY ─────────────────────────────────────────
create table if not exists alert_history (
  id              text primary key,
  source          text not null,                       -- 'instant' | 'cron-daily' | 'cron-weekly' | 'manual-test' | 'in-app'
  category        text not null,                       -- 'panne' | 'stock' | 'haccp' | 'digest' | 'weekly' | 'test'
  severity        text default 'info',                 -- 'info' | 'warning' | 'critical'
  subject         text not null,
  recipients      jsonb not null default '[]'::jsonb,  -- ["a@gmail.com", "b@gmail.com"]
  provider        text,                                -- 'gmail' | 'resend'
  status          text default 'sent',                 -- 'sent' | 'failed' | 'skipped'
  error_msg       text,
  entity_table    text,                                -- 'machines' | 'spare_parts' | 'haccp_records' (when applicable)
  entity_id       text,                                -- the row that triggered it
  ack_token       text unique,                         -- magic-link token (Phase 2)
  ack_at          timestamptz,
  ack_by          text,
  "createdAt"     timestamptz default now()
);
create index if not exists alert_history_created_idx on alert_history ("createdAt" desc);
create index if not exists alert_history_category_idx on alert_history (category, "createdAt" desc);

-- ── 2. COOLDOWN — one row per condition with last-fired timestamp ──
create table if not exists alert_cooldown (
  -- e.g. 'panne:mach-001', 'stock:part-042', 'haccp:rec-007'
  cooldown_key    text primary key,
  last_fired_at   timestamptz default now(),
  "createdAt"     timestamptz default now()
);
create index if not exists alert_cooldown_last_idx on alert_cooldown (last_fired_at desc);

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['alert_history','alert_cooldown'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', tbl);
    exception when duplicate_object then null;
    end;
    execute format('alter table %I enable row level security', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    -- service_role is what the server-side endpoints use
    execute format('grant select, insert, update, delete on public.%I to service_role', tbl);
    execute format('drop policy if exists "auth read"   on %I', tbl);
    execute format('drop policy if exists "auth insert" on %I', tbl);
    execute format('drop policy if exists "auth update" on %I', tbl);
    execute format('drop policy if exists "auth delete" on %I', tbl);
    execute format('create policy "auth read"   on %I for select to authenticated using (true)', tbl);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', tbl);
    execute format('create policy "auth update" on %I for update to authenticated using (true) with check (true)', tbl);
    execute format('create policy "auth delete" on %I for delete to authenticated using (true)', tbl);
  end loop;
end $$;

-- ── Defaults for new alert settings (idempotent upsert) ──
insert into app_settings (key, value) values
  ('alert_quiet_start',   '22'),
  ('alert_quiet_end',     '6'),
  ('alert_cooldown_min',  '60'),
  ('alert_schedule_hour', '7'),
  ('alert_autoreorder',   'off')
on conflict (key) do nothing;

-- ── Verify ───────────────────────────────────────────────────
select 'alert_history' as t, count(*) from alert_history
union all select 'alert_cooldown', count(*) from alert_cooldown
union all select 'app_settings (alert keys)', count(*) from app_settings where key like 'alert_%';
