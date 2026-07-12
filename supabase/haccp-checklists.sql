-- ============================================================
-- SmartMaint — L.C PROD  ·  HACCP + Check-lists d'OT
-- ------------------------------------------------------------
-- Two admin modules for the edible-oil plant:
--   1. haccp_records      — food-safety checks (sanitation,
--      calibration, lubrification, inspection) per machine
--   2. checklist_templates / checklist_runs — work-order
--      check-lists generated from a template and ticked off
--
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor.
-- ============================================================

-- ── 1. HACCP RECORDS ─────────────────────────────────────────
create table if not exists haccp_records (
  id            text primary key,
  "machineId"   text references machines(id) on delete cascade,
  "checkType"   text default 'sanitation',   -- sanitation | calibration | lubrification | inspection
  result        text default 'conforme',     -- conforme | non conforme | à corriger
  "checkedBy"   text,
  "checkDate"   date,
  "nextDueDate" date,
  notes         text,
  "createdAt"   timestamptz default now()
);

-- ── 2. CHECKLIST TEMPLATES ───────────────────────────────────
create table if not exists checklist_templates (
  id            text primary key,
  "machineId"   text references machines(id) on delete set null,
  title         text not null,
  items         jsonb default '[]'::jsonb,   -- array of step labels
  "createdAt"   timestamptz default now()
);

-- ── 3. CHECKLIST RUNS (completed work-order check-lists) ─────
create table if not exists checklist_runs (
  id            text primary key,
  "templateId"  text references checklist_templates(id) on delete set null,
  "machineId"   text references machines(id) on delete cascade,
  title         text,
  results       jsonb default '[]'::jsonb,   -- array of {label, done, note}
  "completedBy" text,
  "completedAt" timestamptz default now(),
  "createdAt"   timestamptz default now()
);

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['haccp_records','checklist_templates','checklist_runs'] loop
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

-- ── Seed — HACCP checks on the food-contact machines ─────────
insert into haccp_records (id, "machineId", "checkType", result, "checkedBy", "checkDate", "nextDueDate", notes) values
('hac-001','mach-002','sanitation','conforme','Sara Idrissi',(current_date - 5),(current_date + 2),'Nettoyage CIP du filtre — conforme'),
('hac-002','mach-003','calibration','conforme','Sara Idrissi',(current_date - 12),(current_date + 18),'Étalonnage sonde température cuve de mélange'),
('hac-003','mach-006','sanitation','à corriger','Hicham Tazi',(current_date - 1),(current_date),'Joint remplisseuse à remplacer avant prochaine production'),
('hac-004','mach-006','lubrification','conforme','Ahmed El Amrani',(current_date - 8),(current_date + 22),'Graisse NSF H1 — buses de remplissage'),
('hac-005','mach-007','inspection','conforme','Omar El Fassi',(current_date - 15),(current_date + 15),'Inspection mâchoires bouchonneuse — RAS')
on conflict (id) do nothing;

-- ── Seed — example work-order check-list templates ──────────
insert into checklist_templates (id, "machineId", title, items) values
('clt-001','mach-006','Démarrage remplisseuse — contrôle pré-production',
  '["Vérifier propreté des becs de remplissage","Contrôler pression air comprimé (7 bar)","Vérifier graisse NSF H1 sur les buses","Tester dosage sur 5 bouteilles","Contrôler absence de fuite d''huile"]'::jsonb),
('clt-002','mach-002','Maintenance préventive filtre industriel',
  '["Arrêt et consignation de la machine","Remplacer les cartouches filtrantes","Nettoyer le carter et les joints","Contrôler l''étanchéité","Relancer et vérifier la pression"]'::jsonb),
('clt-003',null,'Sécurité générale — fin de poste',
  '["Arrêt des machines non utilisées","Nettoyage de la zone de travail","Vérification des arrêts d''urgence","Consignation des anomalies dans le carnet"]'::jsonb)
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'haccp_records' as t, count(*) from haccp_records
union all select 'checklist_templates', count(*) from checklist_templates
union all select 'checklist_runs', count(*) from checklist_runs;
