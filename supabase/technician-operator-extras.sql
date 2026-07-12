-- ============================================================
-- SmartMaint — L.C PROD  ·  Technician + Operator extras
-- ------------------------------------------------------------
-- Adds the schema for the second wave of role-specific features:
--   T6 procedure_runs        — recorded step-by-step run of a SOP
--   T7 tech_certifications   — habilitations (B1V, BR, chemical, confined-space)
--   O3 relief_requests       — operator "demande de relais" → admin bell
--   O4 consumable_requests   — operator "EPI/consommables manquants"
--   O5 directives + directive_acks — admin directives operators must acknowledge
--   O6 production_batches.qualityPhotos  (jsonb column added)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── T6 PROCEDURE RUNS ──────────────────────────────────────────
create table if not exists procedure_runs (
  id              text primary key,
  "articleId"     text,                            -- knowledge article followed
  "articleTitle"  text not null,
  "machineId"     text references machines(id) on delete set null,
  "interventionId" text references interventions(id) on delete set null,
  "technicianName" text not null,
  steps           jsonb not null default '[]'::jsonb,  -- [{label, done, durationSec, note}]
  "startedAt"     timestamptz default now(),
  "completedAt"   timestamptz,
  "totalDurationSec" integer default 0,
  "createdAt"     timestamptz default now()
);
create index if not exists procedure_runs_active_idx on procedure_runs ("completedAt") where "completedAt" is null;

-- ── T7 TECHNICIAN CERTIFICATIONS ──────────────────────────────
create table if not exists tech_certifications (
  id              text primary key,
  "technicianId"  text references technicians(id) on delete cascade,
  "technicianName" text not null,
  "certType"      text not null,                   -- B1V | BR | chimique | espaces confinés | autre
  "certNumber"    text default '',
  "issuedAt"      date,
  "expiresAt"     date,
  "issuingBody"   text default '',
  notes           text default '',
  "createdAt"     timestamptz default now()
);
create index if not exists tech_certs_expiring_idx on tech_certifications ("expiresAt");

-- ── O3 RELIEF REQUESTS (demande de relais) ────────────────────
create table if not exists relief_requests (
  id              text primary key,
  "operatorName"  text not null,
  "machineId"     text references machines(id) on delete set null,
  reason          text default '',
  status          text default 'en attente',       -- en attente | accepté | refusé
  "respondedBy"   text,
  "respondedAt"   timestamptz,
  "createdAt"     timestamptz default now()
);
create index if not exists relief_pending_idx on relief_requests (status) where status = 'en attente';

-- ── O4 CONSUMABLE REQUESTS (EPI / consommables manquants) ─────
create table if not exists consumable_requests (
  id              text primary key,
  "operatorName"  text not null,
  category        text not null,                   -- EPI | consommable | autre
  item            text not null,                   -- "casque cassé", "gants jetables M"
  quantity        integer default 1,
  urgency         text default 'normale',          -- normale | urgente
  notes           text default '',
  status          text default 'ouverte',          -- ouverte | traitée | annulée
  "handledBy"     text,
  "handledAt"     timestamptz,
  "createdAt"     timestamptz default now()
);
create index if not exists consumable_requests_open_idx on consumable_requests (status) where status = 'ouverte';

-- ── O5 DIRECTIVES + ACKNOWLEDGEMENTS ─────────────────────────
-- The admin publishes a directive ("today: huile d'olive vierge extra only").
-- Each operator must acknowledge before starting their shift → ISO trail.
create table if not exists directives (
  id              text primary key,
  title           text not null,
  content         text not null,
  "publishedBy"   text not null,
  "publishedAt"   timestamptz default now(),
  "expiresAt"     timestamptz,                     -- null = no automatic expiry
  active          boolean default true,
  "createdAt"     timestamptz default now()
);
create index if not exists directives_active_idx on directives (active) where active = true;

create table if not exists directive_acks (
  id              text primary key,
  "directiveId"   text not null references directives(id) on delete cascade,
  "operatorName"  text not null,
  "ackAt"         timestamptz default now(),
  "createdAt"     timestamptz default now()
);
create unique index if not exists directive_acks_unique on directive_acks ("directiveId", "operatorName");

-- ── O6 BATCH QUALITY PHOTOS — extend existing production_batches ─
alter table production_batches
  add column if not exists "qualityPhotos" jsonb default '[]'::jsonb;

-- ── REALTIME + RLS + grants ──────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'procedure_runs','tech_certifications','relief_requests',
    'consumable_requests','directives','directive_acks'
  ] loop
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
-- T7 certifications for the seeded technicians
insert into tech_certifications (id, "technicianId", "technicianName", "certType", "certNumber", "issuedAt", "expiresAt", "issuingBody") values
('cert-seed-1','tech-001','Ahmed El Amrani','B1V','HAB-2024-AEA-091','2024-03-15','2027-03-15','APAVE Maroc'),
('cert-seed-2','tech-001','Ahmed El Amrani','BR','HAB-2024-AEA-092','2024-03-15','2027-03-15','APAVE Maroc'),
('cert-seed-3','tech-002','Hicham Tazi','B1V','HAB-2023-HT-044','2023-09-10','2026-09-10','APAVE Maroc'),
('cert-seed-4','tech-002','Hicham Tazi','chimique','CHM-2024-HT-018','2024-01-20','2026-07-20','Bureau Veritas'),
('cert-seed-5','tech-003','Younes Bouzid','espaces confinés','ECF-2024-YB-007','2024-05-02','2025-11-02','APAVE Maroc')
on conflict (id) do nothing;

-- O5 directives — today's instruction operators must acknowledge
insert into directives (id, title, content, "publishedBy", "publishedAt", active) values
('dir-seed-1','Production du jour — Huile vierge extra uniquement',
 'Aujourd''hui, la ligne de remplissage REM-001 produit exclusivement l''huile d''olive vierge extra 1 L. Vérifier les étiquettes avant démarrage. Toute autre référence doit être validée par le chef d''atelier.',
 'Mustapha Gamer', now() - interval '4 hours', true)
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'procedure_runs' as t, count(*) from procedure_runs
union all select 'tech_certifications', count(*) from tech_certifications
union all select 'relief_requests', count(*) from relief_requests
union all select 'consumable_requests', count(*) from consumable_requests
union all select 'directives', count(*) from directives
union all select 'directive_acks', count(*) from directive_acks;
