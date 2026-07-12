-- ============================================================
-- SmartMaint - L.C PROD  ·  Ordres de travail — pièces consommées
-- ------------------------------------------------------------
-- intervention_parts — records which spare parts (and how many)
-- were consumed on a work order. Adding a line decrements the
-- spare-part stock and feeds the intervention's parts cost.
--
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor.
-- ============================================================

create table if not exists intervention_parts (
  id               text primary key,
  "interventionId" text references interventions(id) on delete cascade,
  "sparePartId"    text references spare_parts(id) on delete set null,
  "partName"       text,
  quantity         integer default 1,
  "unitCost"       numeric default 0,
  "createdAt"      timestamptz default now()
);

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table intervention_parts';
  exception when duplicate_object then null;
  end;
end $$;

alter table intervention_parts enable row level security;
grant select, insert, update, delete on public.intervention_parts to authenticated;
drop policy if exists "auth read"   on intervention_parts;
drop policy if exists "auth insert" on intervention_parts;
drop policy if exists "auth update" on intervention_parts;
drop policy if exists "auth delete" on intervention_parts;
create policy "auth read"   on intervention_parts for select to authenticated using (true);
create policy "auth insert" on intervention_parts for insert to authenticated with check (true);
create policy "auth update" on intervention_parts for update to authenticated using (true) with check (true);
create policy "auth delete" on intervention_parts for delete to authenticated using (true);

-- ── Seed — example consumed parts on closed work orders ──────
insert into intervention_parts (id, "interventionId", "sparePartId", "partName", quantity, "unitCost") values
('ip-001','int-001','sp-002','Garniture mécanique de pompe',1,320),
('ip-002','int-003','sp-003','Cartouche filtrante alimentaire',3,145),
('ip-003','int-007','sp-008','Galet de convoyeur',1,60)
on conflict (id) do nothing;

select 'intervention_parts' as t, count(*) from intervention_parts;
