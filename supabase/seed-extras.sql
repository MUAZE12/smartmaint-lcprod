-- ============================================================
-- SmartMaint-Tex — Missing seed data (interventions, production
-- metrics, purchase orders) that the original schema.sql skipped.
-- Idempotent (on conflict do nothing). Paste + Run in Supabase
-- SQL Editor.
-- ============================================================

-- ── INTERVENTIONS ─────────────────────────────────────────────
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

-- ── PRODUCTION METRICS ────────────────────────────────────────
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

-- ── PURCHASE ORDERS ───────────────────────────────────────────
insert into purchase_orders (id, "poNumber", "supplierId", "sparePartId", quantity,
  "unitCost", "totalAmount", status, "orderDate", "expectedDelivery", "receivedDate", "receivedQty", "createdAt") values
('po-001','PO-2025-001','sup-001','sp-001',20,85,1700,'réceptionnée','2025-01-05T00:00:00Z','2025-01-10T00:00:00Z','2025-01-09T00:00:00Z',20,'2025-01-05T00:00:00Z'),
('po-002','PO-2025-002','sup-002','sp-002',10,120,1200,'envoyée','2025-04-20T00:00:00Z','2025-05-02T00:00:00Z',null,null,'2025-04-20T00:00:00Z'),
('po-003','PO-2025-003','sup-003','sp-003',4,250,1000,'partielle','2025-04-28T00:00:00Z','2025-05-01T00:00:00Z',null,2,'2025-04-28T00:00:00Z'),
('po-004','PO-2025-004','sup-004','sp-008',2,2200,4400,'brouillon','2025-05-10T00:00:00Z','2025-05-25T00:00:00Z',null,null,'2025-05-10T00:00:00Z')
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'interventions' as table_name, count(*) from interventions
union all
select 'production_metrics', count(*) from production_metrics
union all
select 'purchase_orders', count(*) from purchase_orders;
