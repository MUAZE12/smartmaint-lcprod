-- ============================================================
-- EMERGENCY ROLLBACK — restore permissive RLS on every table.
-- The role-based-rls.sql attempt broke writes because the JWT
-- structure expected (`auth.jwt() -> 'user_metadata' ->> 'role'`)
-- doesn't always return the role string as expected, so admin
-- inserts on `interventions` were rejected with the dreaded
-- "new row violates row-level security policy" toast.
--
-- This file resets to the original schema.sql policies: any
-- authenticated user can do anything. The UI route guards in
-- AuthContext are the active access control until proper
-- role-based RLS is re-introduced with verified JWT shape.
--
-- Paste once in Supabase Dashboard → SQL Editor → Run.
-- ============================================================

do $$
declare
  t text;
begin
  -- Every table that gets touched from the app.
  for t in select unnest(array[
    'machines', 'technicians', 'interventions', 'spare_parts',
    'suppliers', 'purchase_orders', 'production_metrics', 'personnel',
    'purchase_requisitions', 'purchase_requisition_lines',
    'quote_requests', 'quotes', 'quote_request_lines', 'quote_lines',
    'purchase_order_lines', 'goods_receipts',
    'consumables', 'kpi_formulas', 'maintenance_plans',
    'haccp_records', 'checklist_templates', 'checklist_runs',
    'intervention_parts', 'calibration_records', 'audit_log',
    'tools', 'knowledge_articles', 'shift_notes', 'production_batches',
    'loto_records', 'procedure_runs', 'tech_certifications',
    'relief_requests', 'consumable_requests', 'directives',
    'directive_acks', 'notifications', 'app_settings'
  ]) loop
    -- Skip tables that don't exist on this project (older snapshots
    -- might miss a few of the newer ones).
    if exists (select 1 from information_schema.tables where table_name = t) then
      -- Drop every old policy by every name we have ever used.
      execute format('drop policy if exists "auth read"   on %I;', t);
      execute format('drop policy if exists "auth insert" on %I;', t);
      execute format('drop policy if exists "auth update" on %I;', t);
      execute format('drop policy if exists "auth delete" on %I;', t);
      execute format('drop policy if exists "admin read"   on %I;', t);
      execute format('drop policy if exists "admin write"  on %I;', t);
      execute format('drop policy if exists "admin update" on %I;', t);
      execute format('drop policy if exists "admin update all" on %I;', t);
      execute format('drop policy if exists "admin delete" on %I;', t);
      execute format('drop policy if exists "any read"    on %I;', t);
      execute format('drop policy if exists "any insert"  on %I;', t);
      execute format('drop policy if exists "self read"   on %I;', t);
      execute format('drop policy if exists "self update" on %I;', t);
      execute format('drop policy if exists "tech can create" on %I;', t);
      execute format('drop policy if exists "tech update own" on %I;', t);
      -- Re-create the four permissive policies.
      execute format(
        'create policy "auth read"   on %I for select to authenticated using (true);', t);
      execute format(
        'create policy "auth insert" on %I for insert to authenticated with check (true);', t);
      execute format(
        'create policy "auth update" on %I for update to authenticated using (true) with check (true);', t);
      execute format(
        'create policy "auth delete" on %I for delete to authenticated using (true);', t);
    end if;
  end loop;
end $$;
