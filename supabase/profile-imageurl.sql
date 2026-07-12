-- ============================================================
-- Adds the technician avatar column so admin's Personnel page
-- can render each tech's photo (operators already have it via
-- the `personnel` table).
-- Safe to re-run: IF NOT EXISTS guards the column add.
-- ============================================================

alter table technicians
  add column if not exists "imageUrl" text;
