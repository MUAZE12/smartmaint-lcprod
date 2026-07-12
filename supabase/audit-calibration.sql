-- ============================================================
-- SmartMaint — L.C PROD  ·  Journal d'audit + Étalonnage
-- ------------------------------------------------------------
-- Two more admin modules for the edible-oil plant:
--   1. audit_log           — an immutable trail of every
--      create / update / delete made through the app
--   2. calibration_records — calibration certificates for the
--      plant's measuring instruments (probes, scales, gauges)
--
-- Idempotent — safe to re-run. Paste into the Supabase SQL Editor.
-- ============================================================

-- ── 1. AUDIT LOG ─────────────────────────────────────────────
create table if not exists audit_log (
  id            text primary key,
  action        text,                       -- création | modification | suppression
  "entityType"  text,                       -- machine | intervention | pièce ...
  "entityId"    text,
  summary       text,
  "userName"    text default 'Système',
  "createdAt"   timestamptz default now()
);
create index if not exists audit_log_created_idx on audit_log ("createdAt" desc);

-- ── 2. CALIBRATION RECORDS ───────────────────────────────────
create table if not exists calibration_records (
  id                  text primary key,
  "instrumentName"    text not null,
  "instrumentTag"     text,
  "machineId"         text references machines(id) on delete set null,
  "calibrationType"   text default 'température', -- température|pression|pesage|débit|pH|humidité|autre
  "lastCalibration"   date,
  "nextDueDate"       date,
  "certificateNumber" text,
  "calibratedBy"      text,
  status              text default 'valide',     -- valide | à étalonner | expiré
  notes               text,
  "createdAt"         timestamptz default now()
);

-- ── REALTIME + RLS + grants ──────────────────────────────────
-- audit_log: select + insert only (an audit trail is never edited or deleted).
-- calibration_records: full CRUD.
do $$
declare tbl text;
begin
  foreach tbl in array array['audit_log','calibration_records'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', tbl);
    exception when duplicate_object then null;
    end;
    execute format('alter table %I enable row level security', tbl);
    execute format('drop policy if exists "auth read"   on %I', tbl);
    execute format('drop policy if exists "auth insert" on %I', tbl);
    execute format('create policy "auth read"   on %I for select to authenticated using (true)', tbl);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', tbl);
  end loop;

  -- audit_log — read + append, no update/delete (immutable trail)
  grant select, insert on public.audit_log to authenticated;

  -- calibration_records — full CRUD
  grant select, insert, update, delete on public.calibration_records to authenticated;
  drop policy if exists "auth update" on calibration_records;
  drop policy if exists "auth delete" on calibration_records;
  create policy "auth update" on calibration_records for update to authenticated using (true) with check (true);
  create policy "auth delete" on calibration_records for delete to authenticated using (true);
end $$;

-- ── Seed — calibration certificates for plant instruments ────
insert into calibration_records
  (id, "instrumentName", "instrumentTag", "machineId", "calibrationType",
   "lastCalibration", "nextDueDate", "certificateNumber", "calibratedBy", status, notes) values
('cal-001','Sonde de température cuve de mélange','TT-301','mach-003','température',
  (current_date - 40),(current_date + 320),'CERT-2026-TT301','Bureau Veritas','valide',
  'Étalonnage 5 points 0–150 °C — écart max 0,3 °C'),
('cal-002','Manomètre chaudière vapeur','PT-901','mach-012','pression',
  (current_date - 110),(current_date + 20),'CERT-2025-PT901','Bureau Veritas','à étalonner',
  'Étalonnage 0–10 bar — échéance proche'),
('cal-003','Balance de dosage remplisseuse','WT-601','mach-006','pesage',
  (current_date - 200),(current_date - 15),'CERT-2025-WT601','LPEE','expiré',
  'Vérification métrologique légale — certificat expiré, à renouveler'),
('cal-004','Débitmètre huile raffinée','FT-502','mach-005','débit',
  (current_date - 25),(current_date + 340),'CERT-2026-FT502','Endress+Hauser','valide',
  'Étalonnage massique — erreur < 0,2 %'),
('cal-005','Sonde de température pasteurisation','TT-205','mach-004','température',
  (current_date - 60),(current_date + 305),'CERT-2026-TT205','Bureau Veritas','valide',
  'Point critique HACCP — étalonnage conforme'),
('cal-006','pH-mètre laboratoire qualité','PH-101',null,'pH',
  (current_date - 95),(current_date + 5),'CERT-2025-PH101','LPEE','à étalonner',
  'Étalonnage tampons 4 / 7 / 10 — à reprogrammer')
on conflict (id) do nothing;

-- ── Seed — a few audit-log entries so the journal isn't empty ─
insert into audit_log (id, action, "entityType", "entityId", summary, "userName", "createdAt") values
('aud-seed-1','création','plan préventif','mp-seed','Plan préventif initial du parc','Système',(now() - interval '6 days')),
('aud-seed-2','modification','machine','mach-006','Remplisseuse RMP-001 — passage en maintenance','Système',(now() - interval '4 days')),
('aud-seed-3','création','contrôle HACCP','hac-001','Contrôle sanitation filtre industriel','Système',(now() - interval '3 days')),
('aud-seed-4','création','étalonnage','cal-004','Débitmètre huile raffinée FT-502','Système',(now() - interval '2 days')),
('aud-seed-5','modification','pièce','sp-seed','Réajustement du seuil de stock minimum','Système',(now() - interval '1 day'))
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'audit_log' as t, count(*) from audit_log
union all select 'calibration_records', count(*) from calibration_records;
