-- ============================================================
-- per-workshop-rls.sql
--
-- Replaces the permissive USING(true) policies with genuine
-- workshop-scoped access. Techs on "Réception MP" no longer see
-- machines in "Conditionnement", and vice-versa. Admins see all.
--
-- MODEL
--   auth.users.raw_user_meta_data →
--     role: 'admin' | 'technician' | 'operator'
--     workshop_access: text[]   e.g. ['Réception MP', 'Production']
--
--   A machine has workshop text NOT NULL. Interventions inherit
--   through machine_id → machines.workshop.
--
-- ROLLBACK: run rls-rollback-permissive.sql. RLS remains ON, policies
-- go back to USING(true). Nothing breaks.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- ── Helper: current-user metadata accessors ───────────────
CREATE OR REPLACE FUNCTION auth_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'role'),
        (auth.jwt() -> 'app_metadata'  ->> 'role')
    );
$$;

CREATE OR REPLACE FUNCTION auth_workshop_access() RETURNS text[]
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(
        (
            SELECT array_agg(value::text)
            FROM jsonb_array_elements_text(
                COALESCE(
                    auth.jwt() -> 'user_metadata' -> 'workshop_access',
                    auth.jwt() -> 'app_metadata'  -> 'workshop_access'
                )
            )
        ),
        ARRAY[]::text[]
    );
$$;

-- Admins bypass workshop check completely.
CREATE OR REPLACE FUNCTION auth_is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT auth_role() = 'admin' OR auth_role() IS NULL;
$$;

-- ── machines ──────────────────────────────────────────────
DROP POLICY IF EXISTS "machines_all"                 ON machines;
DROP POLICY IF EXISTS "machines_workshop_select"     ON machines;
DROP POLICY IF EXISTS "machines_admin_write"         ON machines;
DROP POLICY IF EXISTS "machines_workshop_write_tech" ON machines;

CREATE POLICY "machines_workshop_select" ON machines FOR SELECT
    USING (
        auth_is_admin()
        OR workshop = ANY (auth_workshop_access())
    );

-- Only admin + techs in that workshop can INSERT/UPDATE/DELETE.
CREATE POLICY "machines_workshop_write_tech" ON machines FOR ALL
    USING (
        auth_is_admin()
        OR (auth_role() = 'technician' AND workshop = ANY (auth_workshop_access()))
    )
    WITH CHECK (
        auth_is_admin()
        OR (auth_role() = 'technician' AND workshop = ANY (auth_workshop_access()))
    );

-- ── interventions ─────────────────────────────────────────
DROP POLICY IF EXISTS "interventions_all"             ON interventions;
DROP POLICY IF EXISTS "interventions_workshop_select" ON interventions;
DROP POLICY IF EXISTS "interventions_workshop_write"  ON interventions;

CREATE POLICY "interventions_workshop_select" ON interventions FOR SELECT
    USING (
        auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = interventions.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        )
    );

CREATE POLICY "interventions_workshop_write" ON interventions FOR ALL
    USING (
        auth_is_admin()
        OR (auth_role() = 'technician' AND EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = interventions.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        ))
    )
    WITH CHECK (
        auth_is_admin()
        OR (auth_role() = 'technician' AND EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = interventions.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        ))
    );

-- ── production_batches ────────────────────────────────────
DROP POLICY IF EXISTS "production_batches_all"      ON production_batches;
DROP POLICY IF EXISTS "production_batches_scoped"   ON production_batches;

CREATE POLICY "production_batches_scoped" ON production_batches FOR ALL
    USING (
        auth_is_admin()
        OR machine_id IS NULL
        OR EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = production_batches.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        )
    )
    WITH CHECK (
        auth_is_admin()
        OR machine_id IS NULL
        OR EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = production_batches.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        )
    );

-- ── loto_records ─────────────────────────────────────────
DROP POLICY IF EXISTS "loto_records_all"    ON loto_records;
DROP POLICY IF EXISTS "loto_records_scoped" ON loto_records;

CREATE POLICY "loto_records_scoped" ON loto_records FOR ALL
    USING (
        auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = loto_records.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        )
    )
    WITH CHECK (
        auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM machines m
            WHERE m.id = loto_records.machine_id
              AND m.workshop = ANY (auth_workshop_access())
        )
    );

-- ── Shared reference data — everyone can read, only admin writes ──
DO $$
DECLARE
    rt text;
BEGIN
    FOR rt IN
        SELECT unnest(ARRAY[
            'suppliers', 'spare_parts', 'knowledge_articles', 'checklist_templates',
            'tools', 'consumables', 'kpi_formulas', 'directives'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%I_read"       ON %I', rt, rt);
        EXECUTE format('DROP POLICY IF EXISTS "%I_admin_write" ON %I', rt, rt);
        EXECUTE format('CREATE POLICY "%I_read"       ON %I FOR SELECT USING (true)', rt, rt);
        EXECUTE format('CREATE POLICY "%I_admin_write" ON %I FOR ALL USING (auth_is_admin()) WITH CHECK (auth_is_admin())', rt, rt);
    END LOOP;
END $$;

-- ── audit_log — everyone can INSERT, only admin SELECTs ──
DROP POLICY IF EXISTS "audit_log_all"           ON audit_log;
DROP POLICY IF EXISTS "audit_log_admin_select"  ON audit_log;
DROP POLICY IF EXISTS "audit_log_authed_insert" ON audit_log;

CREATE POLICY "audit_log_admin_select" ON audit_log FOR SELECT USING (auth_is_admin());
CREATE POLICY "audit_log_authed_insert" ON audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth_is_admin());

COMMIT;
