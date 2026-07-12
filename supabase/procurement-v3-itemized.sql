-- ============================================================
-- SmartMaint-Tex — Procurement v3: itemized RFQ
-- ------------------------------------------------------------
-- An RFQ now lists the exact parts + quantities needed.
-- Each supplier quotes a unit price PER LINE, so the winning
-- quote converts into a PO line-by-line.
--
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor.
-- ============================================================

-- ── RFQ LINES — the parts/quantities the RFQ asks for ────────
create table if not exists quote_request_lines (
  id            text primary key,
  "rfqId"       text references quote_requests(id) on delete cascade,
  "sparePartId" text references spare_parts(id) on delete set null,
  quantity      integer not null default 1,
  "createdAt"   timestamptz default now()
);

-- ── QUOTE LINES — one supplier's unit price for one RFQ line ─
create table if not exists quote_lines (
  id            text primary key,
  "quoteId"     text references quotes(id) on delete cascade,
  "rfqLineId"   text references quote_request_lines(id) on delete cascade,
  "sparePartId" text references spare_parts(id) on delete set null,
  "unitPrice"   numeric default 0,
  "createdAt"   timestamptz default now()
);

-- ============================================================
-- REALTIME + RLS + grants for the two new tables
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array['quote_request_lines','quote_lines']) loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;

    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "auth read"   on %I', t);
    execute format('drop policy if exists "auth insert" on %I', t);
    execute format('drop policy if exists "auth update" on %I', t);
    execute format('drop policy if exists "auth delete" on %I', t);

    execute format('create policy "auth read"   on %I for select to authenticated using (true)', t);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "auth update" on %I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth delete" on %I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ── Verify ────────────────────────────────────────────────────
select 'quote_request_lines' as t, count(*) from quote_request_lines
union all select 'quote_lines', count(*) from quote_lines;
