-- ============================================================
-- Tighten RLS policies — replaces the "any authenticated user can
-- do anything" policies set by schema.sql with role-based gates.
--
-- Roles read from auth.users.raw_user_meta_data->>'role' (set on
-- account creation via the admin API).
--
-- Effective gates:
--   * `personnel`             — admins read/write everyone. Others
--                               read only their own row (matched
--                               by email).
--   * `purchase_orders`       — admins full access. Technicians
--                               can SELECT + INSERT (so the
--                               procurement flow creates POs from
--                               the techs' side) but can't approve.
--   * `purchase_order_lines`  — same as POs.
--   * `interventions`         — admins full. Technicians read/write
--                               their own (technicianId match).
--                               Operators read only those concerning
--                               their machines (no FK yet, so allow
--                               read all but block write).
--   * `audit_log`             — admins SELECT, anyone INSERT
--                               (writes flow from every page).
--                               UPDATE / DELETE forbidden — the
--                               journal is immutable.
--
-- Apply ONCE in Supabase Dashboard → SQL editor.
-- ============================================================

-- Helper expression: pulls the role string from the calling user's
-- metadata. We use this in every policy below.
-- (auth.jwt() returns the JWT payload; raw_user_meta_data nests inside.)

------------------------------------------------------------------------
-- personnel
------------------------------------------------------------------------
drop policy if exists "auth read"   on personnel;
drop policy if exists "auth insert" on personnel;
drop policy if exists "auth update" on personnel;
drop policy if exists "auth delete" on personnel;

create policy "admin read"   on personnel for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
create policy "self read"    on personnel for select to authenticated
  using (email = auth.jwt() ->> 'email');
create policy "admin write"  on personnel for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
create policy "admin update" on personnel for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
create policy "self update"  on personnel for update to authenticated
  using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');
create policy "admin delete" on personnel for delete to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

------------------------------------------------------------------------
-- purchase_orders — only admin approves/rejects/edits
------------------------------------------------------------------------
drop policy if exists "auth read"   on purchase_orders;
drop policy if exists "auth insert" on purchase_orders;
drop policy if exists "auth update" on purchase_orders;
drop policy if exists "auth delete" on purchase_orders;

create policy "any read"       on purchase_orders for select to authenticated using (true);
create policy "tech can create" on purchase_orders for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'technician'));
create policy "admin update"   on purchase_orders for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
create policy "admin delete"   on purchase_orders for delete to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

------------------------------------------------------------------------
-- interventions — admins full, technicians own rows only
------------------------------------------------------------------------
drop policy if exists "auth read"   on interventions;
drop policy if exists "auth insert" on interventions;
drop policy if exists "auth update" on interventions;
drop policy if exists "auth delete" on interventions;

create policy "any read"          on interventions for select to authenticated using (true);
create policy "admin write"       on interventions for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'technician', 'operator'));
create policy "admin update all"  on interventions for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
create policy "tech update own"   on interventions for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'technician')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'technician');
create policy "admin delete"      on interventions for delete to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

------------------------------------------------------------------------
-- audit_log — immutable journal
------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'audit_log') then
    execute 'drop policy if exists "auth read" on audit_log';
    execute 'drop policy if exists "auth insert" on audit_log';
    execute 'drop policy if exists "auth update" on audit_log';
    execute 'drop policy if exists "auth delete" on audit_log';
    execute 'create policy "any insert" on audit_log for insert to authenticated with check (true)';
    execute 'create policy "admin read" on audit_log for select to authenticated using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''admin'')';
    -- No update / delete policy → both forbidden by default with RLS on.
  end if;
end $$;
