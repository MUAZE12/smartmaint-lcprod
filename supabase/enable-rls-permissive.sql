-- ============================================================
-- Enable Row-Level Security on every table with PERMISSIVE policies
-- (allow anon/auth to read + write everything). This preserves the
-- current behavior — technicien/admin/opérateur keep working — while
-- flipping RLS ON so Supabase's warning banner goes away AND you have
-- a foothold to tighten later without another migration.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================

do $$
declare
    t text;
    tables text[] := array[
        'machines', 'technicians', 'interventions', 'spare_parts',
        'purchase_orders', 'purchase_order_lines',
        'purchase_requisitions', 'purchase_requisition_lines',
        'quote_requests', 'quote_request_lines', 'quotes', 'quote_lines',
        'goods_receipts', 'goods_receipt_lines',
        'suppliers', 'maintenance_plans', 'personnel',
        'consumables', 'consumable_requests',
        'checklists', 'loto_locks', 'certifications',
        'production_batches', 'shift_logs',
        'knowledge_articles', 'procedure_runs',
        'directives', 'directive_acks', 'operator_requests',
        'alerts', 'alert_subscriptions', 'alert_history',
        'audit_log', 'meetings', 'meeting_attendees',
        'app_settings', 'notifications',
        'haccp_records', 'calibration_records',
        'maintenance_projects', 'kpi_formulas'
    ];
begin
    foreach t in array tables loop
        -- Only touch tables that actually exist.
        if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
            -- 1. Enable RLS on the table.
            execute format('alter table public.%I enable row level security', t);

            -- 2. Guarantee anon / authenticated / service_role still have
            --    the required SQL privileges. Without these, RLS "yes"
            --    doesn't matter — Postgres refuses at the privilege layer,
            --    which is exactly what breaks apps after enabling RLS.
            execute format('grant all on public.%I to anon, authenticated, service_role', t);

            -- 3. Drop old permissive policies (if any) then re-create as
            --    pass-through (behavior identical to RLS-off — technician,
            --    admin, opérateur and the tutorial all keep working).
            execute format('drop policy if exists smlc_permissive_read on public.%I', t);
            execute format('drop policy if exists smlc_permissive_write on public.%I', t);
            execute format('create policy smlc_permissive_read on public.%I for select using (true)', t);
            execute format('create policy smlc_permissive_write on public.%I for all using (true) with check (true)', t);
        end if;
    end loop;
end $$;

-- Sequences (used by autoincrement ids) also need usage rights or inserts
-- fail after RLS is on.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- ── Verify ────────────────────────────────────────────────────
select tablename, rowsecurity as rls_enabled
from pg_tables where schemaname='public'
order by tablename;

-- NOTE — this migration ONLY enables RLS with pass-through policies.
-- To actually restrict access (e.g. tech can only read their own OT),
-- replace these policies with auth-based ones (uses auth.uid()).
-- The policies here can be swapped without dropping RLS itself, so no
-- second migration is needed to tighten later.
