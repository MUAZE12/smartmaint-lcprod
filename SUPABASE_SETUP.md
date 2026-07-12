# SmartMaint-Tex — Supabase Setup

This guide walks you through wiring SmartMaint-Tex to a fresh Supabase project. After completing all 5 steps, login + machine CRUD + real-time multiplayer sync will work end-to-end.

---

## 1. Create the Supabase project (free tier)

1. Go to https://supabase.com → **Sign up** (use GitHub or Google).
2. Click **New project**.
3. Pick a name (e.g. `smartmaint-tex`), generate a strong DB password, choose region **eu-west-3 (Paris)** or whichever is closest to Morocco.
4. Wait ~2 min for the project to provision.

---

## 2. Copy your API keys into `.env.local`

In the Supabase dashboard → **Project Settings** (gear icon) → **API**:

- **Project URL** → paste as `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public** key → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Edit `.env.local` (already exists in your project root):

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...
```

**Then restart `npm run dev` — Next.js loads `.env.local` once at startup.**

---

## 3. Run the schema SQL

In the dashboard → **SQL Editor** → **New query**, paste **the entire block below** and click **Run**.

This creates 7 tables with quoted camelCase columns (so they map directly to the TypeScript types), enables Realtime on each, sets up authenticated-only RLS policies, and seeds the same demo data you had in `lib/data.ts`.

```sql
-- ============================================================
-- SmartMaint-Tex — schema + RLS + realtime + seed
-- Safe to re-run: every CREATE uses IF NOT EXISTS
-- ============================================================

-- ── MACHINES ──────────────────────────────────────────────
create table if not exists machines (
  id                    text primary key,
  code                  text not null,
  name                  text not null,
  type                  text not null,
  workshop              text,
  location              text,
  "installationDate"    date,
  status                text not null,
  "criticalityScore"    numeric default 0,
  "hourlyDowntimeCost"  numeric default 0,
  "importanceLevel"     integer default 5,
  "createdAt"           timestamptz default now(),
  "imageUrl"            text,
  manufacturer          text,
  model                 text,
  "serialNumber"        text,
  voltage               numeric,
  power                 numeric,
  amperage              numeric,
  "airPressure"         numeric,
  "waterConsumption"    numeric,
  length                numeric,
  width                 numeric,
  height                numeric,
  weight                numeric,
  "manualFileName"      text,
  "mainCounterUnit"     text
);

-- ── TECHNICIANS ───────────────────────────────────────────
create table if not exists technicians (
  id            text primary key,
  "fullName"    text not null,
  specialty     text,
  phone         text,
  email         text,
  availability  text default 'disponible',
  "createdAt"   timestamptz default now()
);

-- ── INTERVENTIONS ─────────────────────────────────────────
create table if not exists interventions (
  id                  text primary key,
  "machineId"         text references machines(id) on delete cascade,
  "technicianId"      text references technicians(id) on delete set null,
  "interventionType"  text not null,
  description         text,
  "probableCause"     text,
  "actionDone"        text,
  "startDate"         timestamptz,
  "endDate"           timestamptz,
  "downtimeHours"     numeric default 0,
  "laborCost"         numeric default 0,
  "partsCost"         numeric default 0,
  "downtimeCost"      numeric default 0,
  "totalCost"         numeric default 0,
  status              text default 'planifiée',
  "createdAt"         timestamptz default now()
);

-- ── SPARE PARTS ───────────────────────────────────────────
create table if not exists spare_parts (
  id              text primary key,
  name            text not null,
  reference       text,
  quantity        integer default 0,
  "minimumStock"  integer default 0,
  "machineId"     text references machines(id) on delete set null,
  "unitCost"      numeric default 0,
  "imageUrl"      text,
  "createdAt"     timestamptz default now()
);

-- ── SUPPLIERS ─────────────────────────────────────────────
create table if not exists suppliers (
  id                  text primary key,
  name                text not null,
  "contactName"       text,
  email               text,
  phone               text,
  "avgDeliveryDays"   integer,
  reliability         integer,
  "createdAt"         timestamptz default now()
);

-- ── PURCHASE ORDERS ───────────────────────────────────────
create table if not exists purchase_orders (
  id                  text primary key,
  "poNumber"          text not null,
  "supplierId"        text references suppliers(id) on delete set null,
  "sparePartId"       text references spare_parts(id) on delete set null,
  quantity            integer,
  "unitCost"          numeric,
  "totalAmount"       numeric,
  status              text default 'brouillon',
  "orderDate"         timestamptz,
  "expectedDelivery"  timestamptz,
  "receivedDate"      timestamptz,
  "receivedQty"       integer,
  "createdAt"         timestamptz default now()
);

-- ── PRODUCTION METRICS ────────────────────────────────────
create table if not exists production_metrics (
  id                       text primary key,
  "machineId"              text references machines(id) on delete cascade,
  date                     date not null,
  "plannedTime"            numeric,
  downtime                 numeric,
  "producedQuantity"       integer,
  "rejectedQuantity"       integer,
  "theoreticalCycleTime"   numeric,
  "realCycleTime"          numeric,
  "createdAt"              timestamptz default now()
);

-- ── PERSONNEL (operators + technicians unified view) ──────
create table if not exists personnel (
  id           text primary key,
  nom          text not null,
  role         text not null check (role in ('technicien', 'operateur')),
  specialite   text,
  telephone    text,
  email        text,
  statut       text default 'actif',
  "imageUrl"   text,
  "createdAt"  timestamptz default now()
);

-- ============================================================
-- ENABLE REALTIME on every table
-- ============================================================
alter publication supabase_realtime add table machines;
alter publication supabase_realtime add table technicians;
alter publication supabase_realtime add table interventions;
alter publication supabase_realtime add table spare_parts;
alter publication supabase_realtime add table suppliers;
alter publication supabase_realtime add table purchase_orders;
alter publication supabase_realtime add table production_metrics;
alter publication supabase_realtime add table personnel;

-- ============================================================
-- ROW-LEVEL SECURITY
-- For now: any authenticated user has full access.
-- Tighten later to role-based policies if needed.
-- ============================================================
alter table machines           enable row level security;
alter table technicians        enable row level security;
alter table interventions      enable row level security;
alter table spare_parts        enable row level security;
alter table suppliers          enable row level security;
alter table purchase_orders    enable row level security;
alter table production_metrics enable row level security;
alter table personnel          enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'machines','technicians','interventions','spare_parts',
    'suppliers','purchase_orders','production_metrics','personnel'
  ]) loop
    execute format(
      'create policy "auth read"   on %I for select to authenticated using (true);', t);
    execute format(
      'create policy "auth insert" on %I for insert to authenticated with check (true);', t);
    execute format(
      'create policy "auth update" on %I for update to authenticated using (true) with check (true);', t);
    execute format(
      'create policy "auth delete" on %I for delete to authenticated using (true);', t);
  end loop;
end $$;

-- ============================================================
-- SEED DATA (mirrors src/lib/data.ts)
-- ============================================================

-- Machines
insert into machines (id, code, name, type, workshop, location, "installationDate", status,
  "hourlyDowntimeCost", "importanceLevel", "createdAt", manufacturer, model, "serialNumber",
  voltage, power, amperage, "airPressure", "waterConsumption", length, width, height, weight, "mainCounterUnit") values
('mach-001','TIS-001','Métier à tisser Jacquard','Tissage','Atelier Tissage','Hall A — Ligne 1','2019-03-15','opérationnelle',450,9,'2019-03-15T08:00:00Z','Stäubli','LX 3202','STB-2019-44821',400,15,28,6,0,4200,2800,2100,5200,'heures'),
('mach-002','FIL-002','Machine de filature ring','Filature','Atelier Filature','Hall B — Ligne 2','2018-06-20','en panne',380,8,'2018-06-20T08:00:00Z','Rieter','G 38','RIE-2018-33102',380,22,38,4,5,6000,1800,1900,7800,'km_fil'),
('mach-003','TEI-003','Machine de teinture jet','Teinture','Atelier Teinture','Hall C — Zone humide','2020-01-10','opérationnelle',520,7,'2020-01-10T08:00:00Z','Thies','iMaster H2O','THI-2020-10293',400,45,72,8,120,3500,2200,2400,4500,'heures'),
('mach-004','FIN-004','Machine de finition calandre','Finition','Atelier Finition','Hall D — Ligne 1','2021-05-05','en maintenance',300,6,'2021-05-05T08:00:00Z','Monforts','Montex 8500','MON-2021-55410',400,30,50,6,15,5000,2400,2600,9200,'heures'),
('mach-005','COU-005','Machine de coupe automatique','Coupe','Atelier Coupe','Hall E — Zone de découpe','2022-09-12','opérationnelle',280,5,'2022-09-12T08:00:00Z','Lectra','VectoriX Ti','LEC-2022-78923',230,8,12,7,0,3000,1800,1200,2100,'cycles')
on conflict (id) do nothing;

-- Technicians
insert into technicians (id, "fullName", specialty, phone, email, availability, "createdAt") values
('tech-001','Ahmed El Amrani','Mécanique industrielle','+212 6 12 34 56 78','ahmed.elamrani@smartmaint.ma','disponible','2019-01-10T08:00:00Z'),
('tech-002','Yassine Bennis','Électricité industrielle','+212 6 23 45 67 89','yassine.bennis@smartmaint.ma','en intervention','2019-03-15T08:00:00Z'),
('tech-003','Sara Idrissi','Automatisme & contrôle','+212 6 34 56 78 90','sara.idrissi@smartmaint.ma','disponible','2020-02-01T08:00:00Z'),
('tech-004','Omar El Fassi','Maintenance générale','+212 6 45 67 89 01','omar.elfassi@smartmaint.ma','disponible','2020-06-15T08:00:00Z')
on conflict (id) do nothing;

-- Suppliers
insert into suppliers (id, name, "contactName", email, phone, "avgDeliveryDays", reliability, "createdAt") values
('sup-001','SKF Maroc','Rachid Bennani','r.bennani@skf.ma','+212 5 22 33 44 55',5,95,'2023-01-15T00:00:00Z'),
('sup-002','Gates EMEA','Pierre Dupont','p.dupont@gates.eu','+33 1 42 33 44 55',12,88,'2023-02-20T00:00:00Z'),
('sup-003','Électro-Mécanique du Gharb','Abdelkader Slaoui','a.slaoui@emg.ma','+212 5 37 22 11 00',3,92,'2023-03-10T00:00:00Z'),
('sup-004','Parker Hannifin','James Wilson','j.wilson@parker.com','+44 20 7890 1234',15,97,'2023-04-05T00:00:00Z')
on conflict (id) do nothing;

-- Spare parts
insert into spare_parts (id, name, reference, quantity, "minimumStock", "machineId", "unitCost", "createdAt") values
('sp-001','Roulement à billes SKF 6205','SKF-6205-2RS',12,5,'mach-001',85,'2024-01-01T00:00:00Z'),
('sp-002','Courroie de transmission HTD','HTD-5M-450',4,3,'mach-001',120,'2024-01-01T00:00:00Z'),
('sp-003','Ventilateur moteur 380V','FAN-380-150',2,2,'mach-002',250,'2024-01-01T00:00:00Z'),
('sp-004','Capteur de tension fil','TENS-FIL-200',6,3,'mach-002',180,'2024-01-01T00:00:00Z'),
('sp-005','Joint torique hydraulique','JNT-HYD-025',20,10,'mach-002',15,'2024-01-01T00:00:00Z'),
('sp-006','Thermocouple type K','TC-K-500',3,2,'mach-003',95,'2024-01-01T00:00:00Z'),
('sp-007','Buse de teinture inox','BUS-INX-010',8,4,'mach-003',145,'2024-01-01T00:00:00Z'),
('sp-008','Revêtement rouleau calandre','REV-CAL-300',1,1,'mach-004',2200,'2024-01-01T00:00:00Z'),
('sp-009','Capteur vibratoire ICP','VIB-ICP-100',4,2,'mach-004',750,'2024-01-01T00:00:00Z'),
('sp-010','Lame de coupe carbure','LAM-CAR-200',6,4,'mach-005',320,'2024-01-01T00:00:00Z'),
('sp-011','Filtre huile hydraulique','FLT-HYD-050',8,4,null,45,'2024-01-01T00:00:00Z'),
('sp-012','Graisse industrielle SKF LGMT 2','GRS-SKF-1KG',5,3,null,35,'2024-01-01T00:00:00Z')
on conflict (id) do nothing;

-- Personnel (operators only — technicians live in technicians table)
insert into personnel (id, nom, role, specialite, telephone, email, statut) values
('op-001','Karim Benjelloun','operateur','Atelier Tissage','+212 6 56 78 90 12','karim.b@smartmaint.ma','actif'),
('op-002','Fatima Zahra','operateur','Atelier Filature','+212 6 67 89 01 23','fatima.z@smartmaint.ma','actif'),
('op-003','Hassan El Mourabiti','operateur','Atelier Teinture','+212 6 78 90 12 34','hassan.m@smartmaint.ma','inactif')
on conflict (id) do nothing;
```

---

## 4. Create your auth users

In the dashboard → **Authentication** → **Users** → **Add user** → **Create new user**.

Create **3 users** (one per role). For each:
- Email/password as you wish
- ✅ Check **Auto Confirm User**
- After creation, click the user → **Edit** → set the **User metadata** field:

```json
{ "role": "admin", "full_name": "Mounir El Idrissi" }
```

```json
{ "role": "technician", "full_name": "Ahmed El Amrani" }
```

```json
{ "role": "operator", "full_name": "Karim Benjelloun" }
```

The app reads `role` and `full_name` from `user_metadata` to drive the post-login redirect and the avatar in the sidebar.

---

## 5. Restart the dev server and verify

```powershell
# Stop any running dev server first (Ctrl+C in its terminal)
cd "c:\Users\elitebook\OneDrive\Bureau\projet gmao\smartmaint-tex"
Remove-Item -Recurse -Force .next  # clear the build cache
npm run dev
```

Then open http://localhost:3000 in an **incognito / private** window (so no stale session). You should see:
- The new dark glassmorphism login screen (email + password)
- Log in with the admin account → redirected to `/dashboard`
- Open `/machines` → the 5 seeded machines appear
- Open a second browser, log in as another user, add a machine — it appears instantly in the first window without refresh

---

## Troubleshooting

- **Still seeing the old role-card login**: `.next` cache is stale. Stop dev server, delete the `.next` folder, restart.
- **"This page couldn't load"**: open the browser DevTools console — most likely cause is `NEXT_PUBLIC_SUPABASE_URL` still has the placeholder value, or the dev server wasn't restarted after editing `.env.local`.
- **Login succeeds but app stays on login screen**: the user's `user_metadata.role` is missing or not one of `admin / technician / operator`. Set it in the Auth → Users panel.
- **"new row violates row-level security policy"**: you skipped the RLS-policies block in step 3 — re-run the SQL.
- **Realtime doesn't update across tabs**: the `alter publication supabase_realtime add table …` block didn't run — re-run it from the SQL editor.
