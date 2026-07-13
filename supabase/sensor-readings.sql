-- ============================================================
-- sensor-readings.sql
--
-- Real IoT ingestion for predictive maintenance.
--
--   sensor_readings   raw time-series, one row per capture
--   sensor_thresholds per-metric alert bounds (per machine)
--   sensor_rollups_15m  materialized 15-minute rollup (avg/min/max/count)
--
-- Idempotent. Realtime-published for the /synoptique live view.
-- ============================================================

BEGIN;

-- ── Raw stream ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
    id           bigserial PRIMARY KEY,
    machine_id   text NOT NULL,
    metric       text NOT NULL,      -- 'vibration' | 'temperature' | 'current' | 'pressure' | 'rpm'
    value        double precision NOT NULL,
    unit         text,               -- 'mm/s' | 'C' | 'A' | 'bar' | 'rpm'
    ts           timestamptz NOT NULL DEFAULT now(),
    source       text,               -- 'simulator' | 'plc' | 'modbus' | 'opc-ua'
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensor_readings_machine_metric_ts
    ON sensor_readings (machine_id, metric, ts DESC);

CREATE INDEX IF NOT EXISTS sensor_readings_ts_desc
    ON sensor_readings (ts DESC);

-- ── Alert thresholds ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_thresholds (
    id             text PRIMARY KEY,
    machine_id     text NOT NULL,
    metric         text NOT NULL,
    warn_below     double precision,
    warn_above     double precision,
    critical_below double precision,
    critical_above double precision,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (machine_id, metric)
);

-- ── 15-minute rollups (window functions, not a materialized view
--    so INSERTs are cheap; recompute via a Vercel cron or on demand). ──
CREATE TABLE IF NOT EXISTS sensor_rollups_15m (
    id           text PRIMARY KEY,     -- machine_id||metric||bucket_start (epoch/900)
    machine_id   text NOT NULL,
    metric       text NOT NULL,
    bucket_start timestamptz NOT NULL,
    avg_val      double precision,
    min_val      double precision,
    max_val      double precision,
    stddev_val   double precision,
    sample_count integer NOT NULL,
    UNIQUE (machine_id, metric, bucket_start)
);

CREATE INDEX IF NOT EXISTS sensor_rollups_15m_machine_metric_bucket
    ON sensor_rollups_15m (machine_id, metric, bucket_start DESC);

-- ── RLS (permissive per project convention; UI enforces) ───
ALTER TABLE sensor_readings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_rollups_15m ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sensor_readings_all"   ON sensor_readings;
DROP POLICY IF EXISTS "sensor_thresholds_all" ON sensor_thresholds;
DROP POLICY IF EXISTS "sensor_rollups_all"    ON sensor_rollups_15m;

CREATE POLICY "sensor_readings_all"   ON sensor_readings   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "sensor_thresholds_all" ON sensor_thresholds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "sensor_rollups_all"    ON sensor_rollups_15m FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON sensor_readings, sensor_thresholds, sensor_rollups_15m TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON sequence sensor_readings_id_seq TO anon, authenticated, service_role;

-- ── Realtime publication ───────────────────────────────────
-- Only the readings feed needs live pushes; rollups + thresholds
-- are read-mostly.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sensor_readings'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE sensor_readings';
    END IF;
END $$;

-- ── Convenience view: last known value per (machine, metric) ──
CREATE OR REPLACE VIEW sensor_latest AS
SELECT DISTINCT ON (machine_id, metric)
    machine_id, metric, value, unit, ts, source
FROM sensor_readings
ORDER BY machine_id, metric, ts DESC;

GRANT SELECT ON sensor_latest TO anon, authenticated, service_role;

COMMIT;
