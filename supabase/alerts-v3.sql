-- ============================================================
-- Alerts v3 — Phase 2 features:
--
--   1. alert_subscriptions — per-recipient prefs (category + channels)
--   2. New app_settings keys for severity routing + WhatsApp + escalation
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. PER-RECIPIENT SUBSCRIPTIONS ───────────────────────────
-- Each row says "this email wants this category on these channels,
-- between these hours". Missing rows = recipient gets everything
-- (back-compat with the global alert_email list).
create table if not exists alert_subscriptions (
  id              text primary key,
  email           text not null,                       -- the recipient
  category        text not null,                       -- 'panne' | 'stock' | 'haccp' | 'digest' | 'weekly' | 'all'
  channels        jsonb not null default '["email"]'::jsonb,  -- ['email','whatsapp']
  hours_start     integer default 0,                   -- earliest allowed hour UTC (0..23)
  hours_end       integer default 24,                  -- exclusive (24 = no limit)
  active          boolean default true,
  phone           text,                                -- WhatsApp / SMS number for this recipient
  "createdAt"     timestamptz default now()
);
create index if not exists alert_subs_email_idx on alert_subscriptions (email);
create index if not exists alert_subs_active_idx on alert_subscriptions (active) where active = true;

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table alert_subscriptions';
  exception when duplicate_object then null;
  end;
  execute 'alter table alert_subscriptions enable row level security';
  execute 'grant select, insert, update, delete on public.alert_subscriptions to authenticated';
  execute 'grant select, insert, update, delete on public.alert_subscriptions to service_role';
  execute 'drop policy if exists "auth read"   on alert_subscriptions';
  execute 'drop policy if exists "auth insert" on alert_subscriptions';
  execute 'drop policy if exists "auth update" on alert_subscriptions';
  execute 'drop policy if exists "auth delete" on alert_subscriptions';
  execute 'create policy "auth read"   on alert_subscriptions for select to authenticated using (true)';
  execute 'create policy "auth insert" on alert_subscriptions for insert to authenticated with check (true)';
  execute 'create policy "auth update" on alert_subscriptions for update to authenticated using (true) with check (true)';
  execute 'create policy "auth delete" on alert_subscriptions for delete to authenticated using (true)';
end $$;

-- ── App settings for new Phase 2 features ────────────────────
insert into app_settings (key, value) values
  -- Severity → channels mapping (JSON arrays). Default: critical = email; info = email.
  ('alert_route_critical', '["email"]'),
  ('alert_route_warning',  '["email"]'),
  ('alert_route_info',     '["email"]'),
  -- Escalation
  ('alert_escalation_min',  '15'),     -- minutes before re-pinging unacked critical
  -- WhatsApp (Cloud API)
  ('alert_whatsapp_enabled', 'off')
on conflict (key) do nothing;

-- ── Verify ───────────────────────────────────────────────────
select 'alert_subscriptions' as t, count(*) from alert_subscriptions
union all select 'app_settings (alert keys)', count(*) from app_settings where key like 'alert_%';
