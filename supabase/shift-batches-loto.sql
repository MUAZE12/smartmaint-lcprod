-- ============================================================
-- SmartMaint — L.C PROD  ·  Carnet de quart, traçabilité lot, LOTO
-- ------------------------------------------------------------
--   1. shift_notes        — message qu'un technicien laisse à la
--      relève (continuité entre les 3×8).
--   2. production_batches — déclaration par l'opérateur du lot
--      en cours de production (exigence HACCP/ISO 22000).
--   3. loto_records       — verrouillage/consignation digitale
--      d'une machine pendant intervention (sécurité électrique).
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. CARNET DE QUART (shift handover) ─────────────────────
create table if not exists shift_notes (
  id            text primary key,
  content       text not null,
  priority      text default 'info',          -- info | warning | critical
  "machineId"   text references machines(id) on delete set null,
  "createdBy"   text not null,                 -- technician name
  "createdAt"   timestamptz default now(),
  "resolvedBy"  text,                          -- name of the next-shift tech who took it over
  "resolvedAt"  timestamptz
);
create index if not exists shift_notes_unresolved_idx on shift_notes ("resolvedAt") where "resolvedAt" is null;

-- ── 2. PRODUCTION BATCHES (lot traceability) ────────────────
create table if not exists production_batches (
  id            text primary key,
  "batchNumber" text not null,                 -- e.g. LOT-2026-0512-A
  "productName" text not null,                 -- e.g. Huile d'olive vierge extra 1L
  "machineId"   text references machines(id) on delete set null,
  "operatorName" text not null,
  "startedAt"   timestamptz default now(),
  "endedAt"     timestamptz,
  "plannedQty"  integer default 0,
  "actualQty"   integer default 0,
  notes         text default '',
  "createdAt"   timestamptz default now()
);
create index if not exists production_batches_active_idx on production_batches ("endedAt") where "endedAt" is null;

-- ── 3. LOTO RECORDS (lockout/tagout) ────────────────────────
create table if not exists loto_records (
  id              text primary key,
  "machineId"     text not null references machines(id) on delete cascade,
  "technicianName" text not null,
  reason          text not null,
  "padlockId"     text default '',             -- physical padlock number
  "startedAt"     timestamptz default now(),
  "endedAt"       timestamptz,
  notes           text default '',
  "createdAt"     timestamptz default now()
);
create index if not exists loto_records_active_idx on loto_records ("endedAt") where "endedAt" is null;

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['shift_notes','production_batches','loto_records'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', tbl);
    exception when duplicate_object then null;
    end;
    execute format('alter table %I enable row level security', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
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

-- ── Seed — examples to populate the UI immediately ───────────
insert into shift_notes (id, content, priority, "machineId", "createdBy", "createdAt") values
('sn-seed-1','REM-001 émet un bruit léger au démarrage — à surveiller la prochaine production. Cartouche filtre changée ce matin.','warning','mach-006','Ahmed El Amrani', now() - interval '6 hours'),
('sn-seed-2','Chaudière vapeur a atteint 8 bar normalement, pas d''anomalie sur ronde du matin.','info','mach-012','Hicham Tazi', now() - interval '14 hours')
on conflict (id) do nothing;

insert into production_batches (id, "batchNumber", "productName", "machineId", "operatorName", "startedAt", "endedAt", "plannedQty", "actualQty", notes) values
('pb-seed-1','LOT-2026-0523-A','Huile d''olive vierge extra 1 L','mach-006','Karim Benjelloun', now() - interval '5 hours', now() - interval '1 hour', 1200, 1156, 'Production normale — 44 bouteilles écartées au contrôle visuel'),
('pb-seed-2','LOT-2026-0523-B','Huile d''olive vierge 500 mL','mach-006','Karim Benjelloun', now() - interval '40 minutes', null, 800, 240, '')
on conflict (id) do nothing;

insert into loto_records (id, "machineId", "technicianName", reason, "padlockId", "startedAt", notes) values
('loto-seed-1','mach-006','Ahmed El Amrani','Remplacement joints de buses + nettoyage','CAD-014', now() - interval '40 minutes', 'Consigne sectionneur principal')
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'shift_notes' as t, count(*) from shift_notes
union all select 'production_batches', count(*) from production_batches
union all select 'loto_records', count(*) from loto_records;
