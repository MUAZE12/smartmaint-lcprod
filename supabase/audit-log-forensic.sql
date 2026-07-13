-- ============================================================
-- audit-log-forensic.sql
--
-- Upgrades the audit_log from "who did what" to a forensic trail
-- suitable for ISO 22000, IFS Food, and cyber-security audits.
--
-- Adds:
--   ip                inet     : normalized IP (v4 or v6)
--   userAgent         text     : browser or tablet UA
--   sessionId         text     : Supabase Auth JWT jti
--   correlationId     text     : request-scoped trace id
--   ipCountry         char(2)  : best-effort geo (populated by app)
--
-- Uses the same camelCase quoted convention as the existing table
-- (see audit-calibration.sql).
--
-- Idempotent - safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS ip                inet,
    ADD COLUMN IF NOT EXISTS "userAgent"       text,
    ADD COLUMN IF NOT EXISTS "sessionId"       text,
    ADD COLUMN IF NOT EXISTS "correlationId"   text,
    ADD COLUMN IF NOT EXISTS "ipCountry"       char(2);

-- Indexes to make forensic queries fast:
CREATE INDEX IF NOT EXISTS audit_log_ip_idx             ON audit_log (ip)               WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_session_idx        ON audit_log ("sessionId")      WHERE "sessionId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_correlation_idx    ON audit_log ("correlationId")  WHERE "correlationId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx   ON audit_log ("userName", "createdAt" DESC);

-- Reinforce the append-only posture: no UPDATE, no DELETE, ever.
-- (RLS policies enforce this from the app side; a trigger backstops it
-- against direct DB writes by anyone who somehow got a service_role key.)
CREATE OR REPLACE FUNCTION audit_log_block_mutations() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE/DELETE forbidden';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutations();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutations();

COMMIT;
