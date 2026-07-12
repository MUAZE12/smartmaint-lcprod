-- ============================================================
-- SmartMaint-Tex — Fix: grant base table privileges
-- ------------------------------------------------------------
-- RLS policies are not enough on their own. PostgreSQL also
-- requires the `authenticated` role to have SELECT/INSERT/
-- UPDATE/DELETE GRANTs on each table — otherwise the policy
-- never gets a chance to allow the row.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- ============================================================

grant usage on schema public to authenticated, anon;

do $$
declare t text;
begin
  for t in select unnest(array[
    'machines','technicians','interventions','spare_parts',
    'suppliers','purchase_orders','production_metrics','personnel'
  ]) loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Sanity check: show the privileges now granted to `authenticated`
-- on our 8 tables. You should see 4 rows (or more) per table.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('authenticated', 'anon')
  and table_name in (
    'machines','technicians','interventions','spare_parts',
    'suppliers','purchase_orders','production_metrics','personnel'
  )
order by table_name, privilege_type;
