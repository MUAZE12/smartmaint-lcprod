-- ============================================================
-- SmartMaint-Tex — Procurement v2 (SAP-inspired)
-- Demandes d'Achat · Devis · Bons de Commande multi-lignes ·
-- Approbation · Bons de Réception
-- ------------------------------------------------------------
-- Idempotent — safe to re-run. Paste the WHOLE file into
-- Supabase → SQL Editor → New query → Run.
-- ============================================================

-- ── PURCHASE REQUISITIONS (Demandes d'Achat) ─────────────────
create table if not exists purchase_requisitions (
  id              text primary key,
  "reqNumber"     text not null,
  status          text not null default 'brouillon',   -- brouillon|soumise|approuvée|convertie|rejetée
  "machineId"     text references machines(id) on delete set null,
  "interventionId" text references interventions(id) on delete set null,
  "requestedBy"   text,
  notes           text,
  "createdAt"     timestamptz default now()
);

create table if not exists purchase_requisition_lines (
  id                   text primary key,
  "requisitionId"      text references purchase_requisitions(id) on delete cascade,
  "sparePartId"        text references spare_parts(id) on delete set null,
  quantity             integer not null default 1,
  "estimatedUnitCost"  numeric default 0,
  "createdAt"          timestamptz default now()
);

-- ── QUOTE REQUESTS (Demandes de Devis / RFQ) ─────────────────
create table if not exists quote_requests (
  id              text primary key,
  "rfqNumber"     text not null,
  "requisitionId" text references purchase_requisitions(id) on delete set null,
  status          text not null default 'ouverte',      -- ouverte|clôturée
  "machineId"     text references machines(id) on delete set null,
  notes           text,
  "createdAt"     timestamptz default now()
);

create table if not exists quotes (
  id            text primary key,
  "rfqId"       text references quote_requests(id) on delete cascade,
  "supplierId"  text references suppliers(id) on delete set null,
  status        text not null default 'en attente',     -- en attente|reçu|refusé|retenu
  "totalAmount" numeric default 0,
  "deliveryDays" integer,
  notes         text,
  "createdAt"   timestamptz default now()
);

-- ── PURCHASE ORDER LINES (multi-lignes) ──────────────────────
create table if not exists purchase_order_lines (
  id            text primary key,
  "poId"        text references purchase_orders(id) on delete cascade,
  "sparePartId" text references spare_parts(id) on delete set null,
  quantity      integer not null default 1,
  "unitCost"    numeric default 0,
  "receivedQty" integer default 0,
  "createdAt"   timestamptz default now()
);

-- ── GOODS RECEIPTS (Bons de Réception) ───────────────────────
-- `lines` holds [{poLineId, sparePartId, receivedQty, condition}]
create table if not exists goods_receipts (
  id             text primary key,
  "grnNumber"    text not null,
  "poId"         text references purchase_orders(id) on delete cascade,
  "receivedBy"   text,
  "receivedDate" timestamptz default now(),
  notes          text,
  lines          jsonb default '[]'::jsonb,
  "createdAt"    timestamptz default now()
);

-- ── APP SETTINGS (key/value config — approval threshold, etc.) ─
create table if not exists app_settings (
  key         text primary key,
  value       text,
  "updatedAt" timestamptz default now()
);
insert into app_settings (key, value) values
  ('po_approval_threshold', '5000')
on conflict (key) do nothing;

-- ── EXTEND purchase_orders with the v2 workflow header fields ─
alter table purchase_orders add column if not exists "requisitionId"   text;
alter table purchase_orders add column if not exists "rfqId"           text;
alter table purchase_orders add column if not exists "approvalStatus"  text default 'non requis';  -- non requis|en attente|approuvé|rejeté
alter table purchase_orders add column if not exists "approvedBy"      text;
alter table purchase_orders add column if not exists "approvedAt"      timestamptz;
alter table purchase_orders add column if not exists "rejectionReason" text;
alter table purchase_orders add column if not exists "machineId"       text;
alter table purchase_orders add column if not exists notes             text;

-- ── Migrate the existing single-line POs into purchase_order_lines ─
insert into purchase_order_lines (id, "poId", "sparePartId", quantity, "unitCost", "receivedQty", "createdAt")
select 'pol-' || po.id, po.id, po."sparePartId",
       coalesce(po.quantity,1), coalesce(po."unitCost",0), coalesce(po."receivedQty",0), po."createdAt"
from purchase_orders po
where po."sparePartId" is not null
  and not exists (select 1 from purchase_order_lines pl where pl."poId" = po.id);

-- ============================================================
-- REALTIME — add the new tables to the publication
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'purchase_requisitions','purchase_requisition_lines','quote_requests',
    'quotes','purchase_order_lines','goods_receipts','app_settings'
  ]) loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- ROW-LEVEL SECURITY + base grants for the new tables
-- (any authenticated user has full access — same model as v1)
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'purchase_requisitions','purchase_requisition_lines','quote_requests',
    'quotes','purchase_order_lines','goods_receipts','app_settings'
  ]) loop
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
select 'purchase_requisitions' as t, count(*) from purchase_requisitions
union all select 'purchase_requisition_lines', count(*) from purchase_requisition_lines
union all select 'quote_requests', count(*) from quote_requests
union all select 'quotes', count(*) from quotes
union all select 'purchase_order_lines', count(*) from purchase_order_lines
union all select 'goods_receipts', count(*) from goods_receipts
union all select 'app_settings', count(*) from app_settings;
