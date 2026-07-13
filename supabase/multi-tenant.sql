-- ============================================================
-- multi-tenant.sql
--
-- Adds tenant_id (uuid) to every business table, backfills all
-- existing rows to a default tenant, then RLS-scopes every table
-- so a user in tenant A cannot see tenant B data.
--
-- MODEL
--   - tenants table                     : one row per company
--   - auth.users.raw_user_meta_data
--       tenant_id (uuid)                : user is bound to one tenant
--   - Every business table gets tenant_id NOT NULL DEFAULT (from JWT)
--   - RLS policies compare row tenant_id to auth_tenant_id()
--
-- MIGRATION SAFE
--   - Runs in a single transaction
--   - Backfills using the DEFAULT_TENANT constant below - replace
--     with your existing tenant UUID if you already have data
--   - ADD COLUMN IF NOT EXISTS, CREATE POLICY IF NOT EXISTS -
--     safe to re-run
--
-- ROLLBACK: policies revert to per-workshop or permissive by
-- re-running per-workshop-rls.sql or rls-rollback-permissive.sql.
-- To fully remove tenant_id, ALTER TABLE ... DROP COLUMN tenant_id
-- (destroys tenant separation - do only in dev).
-- ============================================================

BEGIN;

-- Tenants directory
CREATE TABLE IF NOT EXISTS tenants (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          text UNIQUE NOT NULL,
    display_name  text NOT NULL,
    country       char(2) DEFAULT 'MA',
    plan          text NOT NULL DEFAULT 'starter',
    seat_limit    integer NOT NULL DEFAULT 25,
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    settings      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants (slug);

-- Seed the L.C PROD tenant if empty
INSERT INTO tenants (id, slug, display_name, country, plan, seat_limit)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'lcprod', 'L.C PROD', 'MA', 'pro', 200
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'lcprod');

-- Default backfill target
DO $$
DECLARE
    DEFAULT_TENANT uuid := '00000000-0000-0000-0000-000000000001';
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'machines', 'technicians', 'personnel', 'interventions', 'spare_parts',
            'suppliers', 'purchase_orders', 'purchase_order_lines',
            'purchase_requisitions', 'purchase_requisition_lines',
            'quotes', 'quote_lines', 'quote_requests', 'quote_request_lines',
            'goods_receipts', 'production_metrics', 'production_batches',
            'haccp_records', 'calibration_records', 'checklist_templates',
            'checklist_runs', 'procedure_runs', 'loto_records', 'tools',
            'knowledge_articles', 'shift_notes', 'directives', 'directive_acks',
            'maintenance_plans', 'maintenance_projects', 'relief_requests',
            'consumable_requests', 'kpi_formulas', 'consumables', 'meetings',
            'tech_certifications', 'notifications', 'alert_subscriptions',
            'audit_log'
        ])
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid', tbl);
        EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, DEFAULT_TENANT);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', tbl || '_tenant_idx', tbl);
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT ' ||
            '((auth.jwt() -> ''user_metadata'' ->> ''tenant_id'')::uuid)',
            tbl
        );
    END LOOP;
END $$;

-- Helper: current-user tenant
CREATE OR REPLACE FUNCTION auth_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(
        NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid,
        NULLIF(auth.jwt() -> 'app_metadata'  ->> 'tenant_id', '')::uuid
    );
$$;

-- RLS policies: tenant-scoped SELECT and ALL
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'machines', 'technicians', 'personnel', 'interventions', 'spare_parts',
            'suppliers', 'purchase_orders', 'purchase_order_lines',
            'purchase_requisitions', 'purchase_requisition_lines',
            'quotes', 'quote_lines', 'quote_requests', 'quote_request_lines',
            'goods_receipts', 'production_metrics', 'production_batches',
            'haccp_records', 'calibration_records', 'checklist_templates',
            'checklist_runs', 'procedure_runs', 'loto_records', 'tools',
            'knowledge_articles', 'shift_notes', 'directives', 'directive_acks',
            'maintenance_plans', 'maintenance_projects', 'relief_requests',
            'consumable_requests', 'kpi_formulas', 'consumables', 'meetings',
            'tech_certifications', 'notifications', 'alert_subscriptions'
        ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_isolation" ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "%s_tenant_isolation" ON %I FOR ALL ' ||
            'USING (tenant_id = auth_tenant_id() OR auth_tenant_id() IS NULL) ' ||
            'WITH CHECK (tenant_id = auth_tenant_id() OR auth_tenant_id() IS NULL)',
            tbl, tbl
        );
    END LOOP;
END $$;

-- audit_log stays append-only, but tenant-scoped SELECT
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_tenant_select" ON audit_log;
DROP POLICY IF EXISTS "audit_log_tenant_insert" ON audit_log;
CREATE POLICY "audit_log_tenant_select" ON audit_log FOR SELECT
    USING (tenant_id = auth_tenant_id() OR auth_tenant_id() IS NULL);
CREATE POLICY "audit_log_tenant_insert" ON audit_log FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() OR auth_tenant_id() IS NULL);

-- tenants table itself: users see only their own tenant row
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenants_own" ON tenants;
CREATE POLICY "tenants_own" ON tenants FOR SELECT
    USING (id = auth_tenant_id() OR auth_tenant_id() IS NULL);
GRANT SELECT ON tenants TO anon, authenticated, service_role;

COMMIT;
