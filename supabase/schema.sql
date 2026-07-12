-- ============================================================
-- SmartMaint-Tex — schema + RLS + realtime + seed
-- Safe to re-run: every CREATE uses IF NOT EXISTS.
-- Paste the WHOLE file into Supabase → SQL Editor → New query → Run.
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
do $$
declare t text;
begin
  for t in select unnest(array[
    'machines','technicians','interventions','spare_parts',
    'suppliers','purchase_orders','production_metrics','personnel'
  ]) loop
    -- Wrap in exception block so re-runs don't fail if already added
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then
      -- already in publication, ignore
      null;
    end;
  end loop;
end $$;

-- ============================================================
-- BASE PRIVILEGES — required BEFORE RLS policies kick in.
-- Without these GRANTs, even matching policies return 42501.
-- ============================================================
grant usage on schema public to authenticated, anon;

do $$
declare t text;
begin
  for t in select unnest(array[
    'machines','technicians','interventions','spare_parts',
    'suppliers','purchase_orders','production_metrics','personnel'
  ]) loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

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
    -- Drop existing policies to keep this script idempotent
    execute format('drop policy if exists "auth read"   on %I;', t);
    execute format('drop policy if exists "auth insert" on %I;', t);
    execute format('drop policy if exists "auth update" on %I;', t);
    execute format('drop policy if exists "auth delete" on %I;', t);

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

-- Interventions
insert into interventions (id, "machineId", "technicianId", "interventionType",
  description, "probableCause", "actionDone", "startDate", "endDate",
  "downtimeHours", "laborCost", "partsCost", "downtimeCost", "totalCost", status, "createdAt") values
('int-001','mach-001','tech-001','corrective','Panne moteur principal — arrêt total du métier à tisser','Usure du roulement moteur','Remplacement du roulement et réalignement moteur','2025-01-10T08:00:00Z','2025-01-10T14:00:00Z',6,800,1200,2700,4700,'terminée','2025-01-10T08:00:00Z'),
('int-002','mach-001','tech-002','préventive','Maintenance préventive trimestrielle — graissage et contrôle','Programme de maintenance préventive','Graissage roulements, vérification tension courroie, contrôle alignement','2025-02-15T09:00:00Z','2025-02-15T12:00:00Z',3,500,200,1350,2050,'terminée','2025-02-15T09:00:00Z'),
('int-003','mach-001','tech-003','conditionnelle','Vibration anormale détectée sur l''axe principal','Désalignement progressif de l''axe','Réalignement de l''axe et remplacement des silent-blocs','2025-04-05T10:00:00Z','2025-04-05T15:00:00Z',5,700,900,2250,3850,'terminée','2025-04-05T10:00:00Z'),
('int-004','mach-002','tech-001','corrective','Surchauffe du moteur de broche — arrêt d''urgence','Défaut du système de refroidissement','Nettoyage du circuit de refroidissement et remplacement du ventilateur','2025-01-20T07:00:00Z','2025-01-20T16:00:00Z',9,900,1500,3420,5820,'terminée','2025-01-20T07:00:00Z'),
('int-005','mach-002','tech-002','corrective','Défaut capteur de tension du fil','Capteur endommagé par la poussière','Remplacement du capteur et nettoyage de la zone','2025-03-12T08:00:00Z','2025-03-12T12:00:00Z',4,600,800,1520,2920,'terminée','2025-03-12T08:00:00Z'),
('int-006','mach-002','tech-004','corrective','Fuite hydraulique sur le système de tension','Joint torique usé','Remplacement des joints et purge du circuit hydraulique','2025-05-01T09:00:00Z',null,8,750,400,3040,4190,'en cours','2025-05-01T09:00:00Z'),
('int-007','mach-003','tech-003','préventive','Maintenance préventive semestrielle — contrôle complet','Programme de maintenance préventive','Inspection complète, nettoyage des buses, vérification des vannes','2025-01-05T08:00:00Z','2025-01-05T17:00:00Z',8,1000,600,4160,5760,'terminée','2025-01-05T08:00:00Z'),
('int-008','mach-003','tech-001','corrective','Problème de régulation de température','Thermocouple défectueux','Remplacement du thermocouple et recalibrage','2025-03-20T10:00:00Z','2025-03-20T14:00:00Z',4,600,350,2080,3030,'terminée','2025-03-20T10:00:00Z'),
('int-009','mach-004','tech-002','corrective','Défaut sur le rouleau de calandrage — marques sur le tissu','Usure du revêtement du rouleau','Rectification du rouleau et remplacement du revêtement','2025-02-10T08:00:00Z','2025-02-11T12:00:00Z',28,2000,3500,8400,13900,'terminée','2025-02-10T08:00:00Z'),
('int-010','mach-004','tech-004','améliorative','Installation d''un système de surveillance vibratoire','Amélioration continue — prévention des pannes récurrentes','Installation capteurs vibratoires et configuration du monitoring','2025-04-15T08:00:00Z','2025-04-16T17:00:00Z',16,1800,4500,4800,11100,'terminée','2025-04-15T08:00:00Z'),
('int-011','mach-004','tech-001','préventive','Maintenance en cours — vérification générale','Programme de maintenance préventive','En cours de diagnostic','2025-05-14T08:00:00Z',null,4,500,0,1200,1700,'en cours','2025-05-14T08:00:00Z'),
('int-012','mach-005','tech-003','préventive','Affûtage et réglage des lames de coupe','Programme de maintenance préventive','Affûtage des lames, réglage de la pression et contrôle de précision','2025-02-20T09:00:00Z','2025-02-20T12:00:00Z',3,400,150,840,1390,'terminée','2025-02-20T09:00:00Z'),
('int-013','mach-005','tech-004','corrective','Problème de calibration du laser de positionnement','Dérive du capteur laser après choc','Recalibration du système laser et vérification de la précision','2025-04-28T08:00:00Z','2025-04-28T11:00:00Z',3,500,250,840,1590,'terminée','2025-04-28T08:00:00Z'),
('int-014','mach-001','tech-004','corrective','Rupture courroie de transmission','Usure et tension excessive','Remplacement courroie et réglage tension','2025-05-08T07:00:00Z','2025-05-08T10:00:00Z',3,400,350,1350,2100,'terminée','2025-05-08T07:00:00Z'),
('int-015','mach-002','tech-003','préventive','Inspection préventive trimestrielle','Programme de maintenance préventive','Contrôle général, lubrification, test de fonctionnement','2025-04-10T09:00:00Z','2025-04-10T13:00:00Z',4,550,180,1520,2250,'terminée','2025-04-10T09:00:00Z')
on conflict (id) do nothing;

-- Production metrics
insert into production_metrics (id, "machineId", date, "plannedTime", downtime,
  "producedQuantity", "rejectedQuantity", "theoreticalCycleTime", "realCycleTime", "createdAt") values
('pm-001','mach-001','2025-04-01',8,0.5,450,12,0.8,0.95,'2025-04-01T00:00:00Z'),
('pm-002','mach-001','2025-04-02',8,0,480,8,0.8,0.88,'2025-04-02T00:00:00Z'),
('pm-003','mach-001','2025-04-03',8,1.5,380,15,0.8,1.0,'2025-04-03T00:00:00Z'),
('pm-004','mach-002','2025-04-01',8,2,320,25,1.0,1.3,'2025-04-01T00:00:00Z'),
('pm-005','mach-002','2025-04-02',8,1,390,18,1.0,1.15,'2025-04-02T00:00:00Z'),
('pm-006','mach-003','2025-04-01',8,0,200,5,2.0,2.2,'2025-04-01T00:00:00Z'),
('pm-007','mach-003','2025-04-02',8,0.5,185,8,2.0,2.3,'2025-04-02T00:00:00Z'),
('pm-008','mach-004','2025-04-01',8,3,250,20,1.5,2.0,'2025-04-01T00:00:00Z'),
('pm-009','mach-005','2025-04-01',8,0,600,10,0.6,0.65,'2025-04-01T00:00:00Z'),
('pm-010','mach-005','2025-04-02',8,0.5,570,15,0.6,0.7,'2025-04-02T00:00:00Z')
on conflict (id) do nothing;

-- Purchase orders
insert into purchase_orders (id, "poNumber", "supplierId", "sparePartId", quantity,
  "unitCost", "totalAmount", status, "orderDate", "expectedDelivery", "receivedDate", "receivedQty", "createdAt") values
('po-001','PO-2025-001','sup-001','sp-001',20,85,1700,'réceptionnée','2025-01-05T00:00:00Z','2025-01-10T00:00:00Z','2025-01-09T00:00:00Z',20,'2025-01-05T00:00:00Z'),
('po-002','PO-2025-002','sup-002','sp-002',10,120,1200,'envoyée','2025-04-20T00:00:00Z','2025-05-02T00:00:00Z',null,null,'2025-04-20T00:00:00Z'),
('po-003','PO-2025-003','sup-003','sp-003',4,250,1000,'partielle','2025-04-28T00:00:00Z','2025-05-01T00:00:00Z',null,2,'2025-04-28T00:00:00Z'),
('po-004','PO-2025-004','sup-004','sp-008',2,2200,4400,'brouillon','2025-05-10T00:00:00Z','2025-05-25T00:00:00Z',null,null,'2025-05-10T00:00:00Z')
on conflict (id) do nothing;
