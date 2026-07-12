-- ============================================================
-- SmartMaint-Tex — Consommables + Formules KPI
-- ------------------------------------------------------------
-- Two registries that used to be hard-coded demo data, now
-- real persisted tables.
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor.
-- ============================================================

-- ── CONSUMABLES — suivi d'usure des consommables machine ─────
create table if not exists consumables (
  id            text primary key,
  name          text not null,
  atelier       text,
  "totalHours"  numeric default 0,
  "usedHours"   numeric default 0,
  icon          text default '📦',
  "createdAt"   timestamptz default now()
);

-- ── KPI FORMULAS — indicateurs personnalisés sauvegardés ─────
create table if not exists kpi_formulas (
  id          text primary key,
  name        text not null,
  formula     text default '[]',   -- JSON-encoded token array
  "createdAt" timestamptz default now()
);

-- ============================================================
-- REALTIME + RLS + grants
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array['consumables','kpi_formulas']) loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "auth read"   on %I', t);
    execute format('drop policy if exists "auth insert" on %I', t);
    execute format('drop policy if exists "auth update" on %I', t);
    execute format('drop policy if exists "auth delete" on %I', t);
    execute format('create policy "auth read"   on %I for select to authenticated using (true)', t);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "auth update" on %I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth delete" on %I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ── Seed consommables (mirrors the former demo widget) ───────
insert into consumables (id, name, atelier, "totalHours", "usedHours", icon) values
('cons-001','Lames de coupe automatique','Atelier Coupe',500,360,'🔪'),
('cons-002','Huile lubrifiante machines','Tous ateliers',1000,450,'🛢️'),
('cons-003','Cartouches filtrantes bain de teinture','Atelier Teinture',300,264,'🧴'),
('cons-004','Fil de canette','Atelier Tissage',2000,620,'🧵'),
('cons-005','Navettes de métier à tisser','Atelier Tissage',400,260,'🪡')
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'consumables' as t, count(*) from consumables
union all select 'kpi_formulas', count(*) from kpi_formulas;
