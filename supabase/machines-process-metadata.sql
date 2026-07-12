-- ============================================================
-- Add the agro-food process columns to the machines table so the
-- catalog can carry Zone / Ligne / Fonction the way the operations
-- team works on paper (matches the spreadsheet they hand to QHSE).
-- Safe to re-run.
-- ============================================================
alter table machines add column if not exists "line"     text;
alter table machines add column if not exists "function" text;
