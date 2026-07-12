-- ============================================================
-- Maintenance projects
-- Copy/paste the WHOLE file into Supabase SQL Editor, click Run.
-- ============================================================

create table if not exists maintenance_projects (
    id text primary key,
    title text not null,
    description text default '',
    status text not null default 'planned',
    priority text not null default 'medium',
    "startDate" text,
    "dueDate" text,
    "completedAt" text,
    "ownerName" text default '',
    "machineIds" text[] default '{}',
    "assigneeNames" text[] default '{}',
    budget numeric default 0,
    tasks jsonb default '[]'::jsonb,
    "photoUrls" text[] default '{}',
    "finalReport" text default '',
    "createdAt" text not null default now()::text
);

alter table maintenance_projects add column if not exists "photoUrls" text[] default '{}';
alter table maintenance_projects add column if not exists "finalReport" text default '';

-- ============================================================
-- THE ACTUAL FIX
-- ============================================================
-- "permission denied for table maintenance_projects" is NOT an RLS
-- error — it's a Postgres role privilege error. The table was created
-- but the anon / authenticated roles were never granted access. This
-- block fixes it for good.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;
grant all on maintenance_projects to anon, authenticated, service_role;
alter table maintenance_projects disable row level security;

-- Realtime broadcast so admin sees technician task-toggles live.
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table maintenance_projects;
        exception when duplicate_object then null;
        end;
    end if;
end $$;

-- Prove it worked. If this returns a number, you're done. If it errors,
-- copy the exact error and send it back — we need to see the raw message.
select count(*) as ok from maintenance_projects;
