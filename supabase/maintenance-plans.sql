-- ============================================================
-- SmartMaint-Tex — Plans de maintenance préventive
-- ------------------------------------------------------------
-- Define a recurring plan per machine (every N days). The app
-- flags plans that are due/overdue and generates the planned
-- intervention on demand.
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor.
-- ============================================================

create table if not exists maintenance_plans (
  id                  text primary key,
  "machineId"         text references machines(id) on delete cascade,
  title               text not null,
  "interventionType"  text default 'préventive',   -- préventive | conditionnelle | améliorative
  "frequencyDays"     integer not null default 30,
  "lastDoneDate"      date,
  "nextDueDate"       date,
  active              boolean default true,
  notes               text,
  "createdAt"         timestamptz default now()
);

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table maintenance_plans';
  exception when duplicate_object then null;
  end;
end $$;

alter table maintenance_plans enable row level security;
grant select, insert, update, delete on public.maintenance_plans to authenticated;
drop policy if exists "auth read"   on maintenance_plans;
drop policy if exists "auth insert" on maintenance_plans;
drop policy if exists "auth update" on maintenance_plans;
drop policy if exists "auth delete" on maintenance_plans;
create policy "auth read"   on maintenance_plans for select to authenticated using (true);
create policy "auth insert" on maintenance_plans for insert to authenticated with check (true);
create policy "auth update" on maintenance_plans for update to authenticated using (true) with check (true);
create policy "auth delete" on maintenance_plans for delete to authenticated using (true);

-- ── Seed — example preventive plans for the textile machines ─
insert into maintenance_plans (id, "machineId", title, "interventionType", "frequencyDays", "lastDoneDate", "nextDueDate", active, notes) values
('mp-001','mach-001','Graissage roulements & contrôle tension courroie','préventive',30,
  (current_date - 20), (current_date + 10), true, 'Métier à tisser — graissage mensuel'),
('mp-002','mach-003','Nettoyage buses & contrôle vannes bain de teinture','préventive',90,
  (current_date - 95), (current_date - 5), true, 'Machine de teinture — révision trimestrielle (en retard)'),
('mp-003','mach-005','Affûtage lames & calibration laser de coupe','préventive',45,
  (current_date - 45), current_date, true, 'Machine de coupe — affûtage à échéance')
on conflict (id) do nothing;

select 'maintenance_plans' as t, count(*) from maintenance_plans;
