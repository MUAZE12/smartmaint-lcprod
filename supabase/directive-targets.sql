-- ============================================================
-- Add per-directive operator targeting.
--   NULL          → diffusée à TOUS les opérateurs (compat rétro)
--   text[] rempli → diffusée uniquement aux noms listés
--
-- Paste once in Supabase Dashboard → SQL Editor → Run.
-- Idempotent : le ADD COLUMN IF NOT EXISTS ne casse rien si déjà appliqué.
-- ============================================================

alter table if exists directives
    add column if not exists "targetOperators" text[] default null;
