-- ============================================================
-- SmartMaint — L.C PROD  ·  RESEED
-- ------------------------------------------------------------
-- Wipes the old textile sample data and seeds the L.C PROD
-- edible-oil plant: 12 machines, 5 technicians, spare parts,
-- interventions, production metrics, purchase orders, plans.
--
-- Run ONCE in Supabase → SQL Editor. Wrapped in a transaction.
-- ============================================================
begin;

-- ── Clear transactional + sample data (FK-safe order) ────────
delete from quote_lines;
delete from quote_request_lines;
delete from quotes;
delete from quote_requests;
delete from goods_receipts;
delete from purchase_order_lines;
delete from purchase_orders;
delete from purchase_requisition_lines;
delete from purchase_requisitions;
delete from interventions;
delete from production_metrics;
delete from maintenance_plans;
delete from spare_parts;
delete from machines;
delete from technicians;
delete from suppliers;
delete from personnel;
delete from consumables;

-- ── MACHINES ─────────────────────────────────────────────────
insert into machines (id, code, name, type, workshop, location, "installationDate", status,
  "hourlyDowntimeCost", "importanceLevel", "createdAt", manufacturer, model, "serialNumber",
  voltage, power, amperage, "airPressure", "waterConsumption", length, width, height, weight, "mainCounterUnit") values
('mach-001','POM-001','Pompe de transfert huile','Réception','Réception MP','Zone réception','2019-03-15','opérationnelle',420,8,'2019-03-15T08:00:00Z','Grundfos','NB 65-200','GRF-2019-44821',400,11,22,0,0,1200,600,700,320,'heures'),
('mach-002','FIL-001','Filtre industriel','Préparation','Traitement','Préparation','2018-06-20','opérationnelle',380,7,'2018-06-20T08:00:00Z','Alfa Laval','AF 200','ALF-2018-33102',400,7.5,16,4,2,2000,1100,1800,850,'heures'),
('mach-003','MEL-001','Cuve de mélange','Production','Production','Ligne 1','2020-01-10','opérationnelle',560,9,'2020-01-10T08:00:00Z','INOXPA','MX-3000','INX-2020-10293',400,18.5,34,6,8,2400,2400,3200,2100,'heures'),
('mach-004','ECH-001','Échangeur thermique','Production','Production','Ligne 1','2021-05-05','en maintenance',510,8,'2021-05-05T08:00:00Z','Alfa Laval','M10-BFG','ALF-2021-55410',400,22,40,0,30,1600,800,1900,1250,'heures'),
('mach-005','CNV-001','Convoyeur bouteilles','Conditionnement','Conditionnement','Ligne 1','2020-09-12','opérationnelle',240,6,'2020-09-12T08:00:00Z','Sidel','CV-Flex','SID-2020-78923',230,4,9,6,0,12000,600,1000,1400,'heures'),
('mach-006','REM-001','Remplisseuse automatique','Remplissage','Remplissage','Ligne 1','2021-02-18','en panne',680,10,'2021-02-18T08:00:00Z','KRONES','Sensometic VPR','KRO-2021-66120',400,15,28,7,4,4500,2600,2400,3800,'cycles'),
('mach-007','BOU-001','Bouchonneuse automatique','Conditionnement','Conditionnement','Ligne 1','2021-02-18','opérationnelle',360,7,'2021-02-18T08:00:00Z','Arol','EURO 3T','ARO-2021-66121',400,6,13,6,0,2200,1800,2300,1600,'cycles'),
('mach-008','ETQ-001','Étiqueteuse automatique','Conditionnement','Conditionnement','Ligne 1','2021-02-18','opérationnelle',300,6,'2021-02-18T08:00:00Z','P.E. Labellers','Modular','PEL-2021-66122',230,3,8,5,0,2600,1600,2000,1100,'cycles'),
('mach-009','EMB-001','Machine d''emballage','Conditionnement','Emballage','Ligne 1','2022-04-03','opérationnelle',280,6,'2022-04-03T08:00:00Z','SMI','LSK 25F','SMI-2022-90011',400,9,18,7,0,5000,2400,2300,2900,'cycles'),
('mach-010','PAL-001','Palettiseur','Expédition','Expédition','Fin de ligne','2022-04-03','opérationnelle',320,7,'2022-04-03T08:00:00Z','Fanuc','M-410iC','FAN-2022-90012',400,12,24,6,0,3500,3500,2800,4200,'cycles'),
('mach-011','CMP-001','Compresseur air','Utilités','Utilités','Salle des utilités','2018-11-22','opérationnelle',600,9,'2018-11-22T08:00:00Z','Atlas Copco','GA 30 VSD','ATC-2018-22014',400,30,55,8,0,1900,1100,1700,980,'heures'),
('mach-012','CHD-001','Chaudière industrielle','Utilités','Utilités','Salle des utilités','2017-08-30','opérationnelle',720,10,'2017-08-30T08:00:00Z','Bosch','UL-S 4000','BSC-2017-30015',400,45,72,0,120,4000,2000,2600,6500,'heures');

-- ── TECHNICIENS ──────────────────────────────────────────────
insert into technicians (id, "fullName", specialty, phone, email, availability, "createdAt") values
('tech-001','Ahmed El Amrani','Mécanique industrielle','+212 6 12 34 56 78','ahmed.elamrani@lcprod.ma','disponible','2019-01-10T08:00:00Z'),
('tech-002','Yassine Bennis','Électricité industrielle','+212 6 23 45 67 89','yassine.bennis@lcprod.ma','en intervention','2019-03-15T08:00:00Z'),
('tech-003','Sara Idrissi','Automatisme & instrumentation','+212 6 34 56 78 90','sara.idrissi@lcprod.ma','disponible','2020-02-01T08:00:00Z'),
('tech-004','Omar El Fassi','Froid & thermique','+212 6 45 67 89 01','omar.elfassi@lcprod.ma','disponible','2020-06-15T08:00:00Z'),
('tech-005','Hicham Tazi','Maintenance générale','+212 6 56 78 90 12','hicham.tazi@lcprod.ma','disponible','2021-09-01T08:00:00Z');

-- ── FOURNISSEURS ─────────────────────────────────────────────
insert into suppliers (id, name, "contactName", email, phone, "avgDeliveryDays", reliability, "createdAt") values
('sup-001','SKF Maroc','Rachid Bennani','r.bennani@skf.ma','+212 5 22 33 44 55',5,95,'2023-01-15T00:00:00Z'),
('sup-002','Alfa Laval Maroc','Pierre Dupont','contact@alfalaval.ma','+212 5 22 66 77 88',12,90,'2023-02-20T00:00:00Z'),
('sup-003','Électro-Mécanique du Gharb','Abdelkader Slaoui','a.slaoui@emg.ma','+212 5 37 22 11 00',3,92,'2023-03-10T00:00:00Z'),
('sup-004','Atlas Copco Maroc','James Wilson','service@atlascopco.ma','+212 5 22 99 00 11',15,97,'2023-04-05T00:00:00Z');

-- ── PIÈCES DE RECHANGE ───────────────────────────────────────
insert into spare_parts (id, name, reference, quantity, "minimumStock", "machineId", "unitCost", "createdAt") values
('sp-001','Roulement à billes SKF 6205','SKF-6205-2RS',14,6,'mach-001',85,'2024-01-01T00:00:00Z'),
('sp-002','Garniture mécanique de pompe','GAR-MEC-32',5,3,'mach-001',320,'2024-01-01T00:00:00Z'),
('sp-003','Cartouche filtrante alimentaire','CAR-FIL-10',9,4,'mach-002',145,'2024-01-01T00:00:00Z'),
('sp-004','Joint d''étanchéité alimentaire EPDM','JNT-ALIM-50',24,12,'mach-003',22,'2024-01-01T00:00:00Z'),
('sp-005','Palier d''agitateur de cuve','PAL-AGI-40',3,2,'mach-003',540,'2024-01-01T00:00:00Z'),
('sp-006','Résistance chauffante 3 kW','RES-CH-3KW',4,2,'mach-004',380,'2024-01-01T00:00:00Z'),
('sp-007','Sonde de température PT100','PT100-TEMP',6,3,'mach-004',165,'2024-01-01T00:00:00Z'),
('sp-008','Galet de convoyeur','GAL-CNV-80',10,6,'mach-005',60,'2024-01-01T00:00:00Z'),
('sp-009','Buse de remplissage inox','BUS-REM-INX',2,4,'mach-006',290,'2024-01-01T00:00:00Z'),
('sp-010','Électrovanne pneumatique','EV-PNEU-14',7,4,'mach-006',210,'2024-01-01T00:00:00Z'),
('sp-011','Filtre à air compresseur','FLT-AIR-100',8,4,'mach-011',95,'2024-01-01T00:00:00Z'),
('sp-012','Soupape de sécurité chaudière 8 bar','SOUP-SEC-8B',1,1,'mach-012',1250,'2024-01-01T00:00:00Z'),
('sp-013','Courroie de transmission HTD','HTD-5M-450',6,4,null,120,'2024-01-01T00:00:00Z'),
('sp-014','Graisse alimentaire NSF H1','GRS-NSF-1KG',5,3,null,95,'2024-01-01T00:00:00Z');

-- ── INTERVENTIONS ────────────────────────────────────────────
insert into interventions (id, "machineId", "technicianId", "interventionType", description, "probableCause",
  "actionDone", "startDate", "endDate", "downtimeHours", "laborCost", "partsCost", "downtimeCost", "totalCost", status, "createdAt") values
('int-001','mach-001','tech-001','corrective','Fuite au niveau de la garniture mécanique de la pompe','Usure de la garniture','Remplacement de la garniture mécanique et contrôle alignement','2025-01-12T08:00:00Z','2025-01-12T12:00:00Z',4,600,850,1680,3130,'terminée','2025-01-12T08:00:00Z'),
('int-002','mach-001','tech-002','préventive','Contrôle mensuel pompe — graissage et vérification','Programme préventif','Graissage roulements, contrôle débit et étanchéité','2025-02-15T09:00:00Z','2025-02-15T11:00:00Z',2,350,120,840,1310,'terminée','2025-02-15T09:00:00Z'),
('int-003','mach-002','tech-005','préventive','Remplacement cartouches filtrantes','Colmatage des cartouches','Remplacement des cartouches et nettoyage du carter','2025-03-05T08:00:00Z','2025-03-05T10:30:00Z',2.5,300,450,950,1700,'terminée','2025-03-05T08:00:00Z'),
('int-004','mach-003','tech-001','corrective','Vibration anormale de l''agitateur de la cuve de mélange','Désalignement de l''arbre d''agitation','Réalignement de l''arbre et remplacement des paliers','2025-03-20T07:00:00Z','2025-03-20T15:00:00Z',8,1000,1600,4480,7080,'terminée','2025-03-20T07:00:00Z'),
('int-005','mach-004','tech-004','corrective','Baisse de rendement thermique de l''échangeur','Encrassement des plaques','Démontage et nettoyage chimique des plaques (en cours)','2025-05-18T08:00:00Z',null,6,800,300,3060,4160,'en cours','2025-05-18T08:00:00Z'),
('int-006','mach-006','tech-002','corrective','Arrêt remplisseuse — défaut de dosage sur 4 becs','Buses encrassées / électrovanne défectueuse','Diagnostic en cours','2025-05-20T07:30:00Z',null,9,900,600,6120,7620,'en cours','2025-05-20T07:30:00Z'),
('int-007','mach-005','tech-005','corrective','Blocage du convoyeur bouteilles en sortie remplissage','Galet de convoyeur grippé','Remplacement du galet et lubrification de la chaîne','2025-04-10T10:00:00Z','2025-04-10T12:30:00Z',2.5,350,280,600,1230,'terminée','2025-04-10T10:00:00Z'),
('int-008','mach-007','tech-003','préventive','Réglage et contrôle de la bouchonneuse','Programme préventif','Réglage couple de serrage, contrôle mâchoires','2025-04-22T09:00:00Z','2025-04-22T11:00:00Z',2,300,90,720,1110,'terminée','2025-04-22T09:00:00Z'),
('int-009','mach-008','tech-003','corrective','Étiquettes mal positionnées sur les bouteilles','Dérive du capteur de position','Recalibrage du capteur et nettoyage des rouleaux','2025-04-28T08:00:00Z','2025-04-28T10:00:00Z',2,300,150,600,1050,'terminée','2025-04-28T08:00:00Z'),
('int-010','mach-011','tech-002','préventive','Maintenance préventive compresseur — filtre & huile','Programme préventif','Remplacement filtre à air et vidange huile','2025-03-28T08:00:00Z','2025-03-28T11:00:00Z',3,450,700,1800,2950,'terminée','2025-03-28T08:00:00Z'),
('int-011','mach-012','tech-004','conditionnelle','Contrôle de la soupape de sécurité de la chaudière','Surveillance réglementaire','Test et étalonnage de la soupape de sécurité','2025-05-02T08:00:00Z','2025-05-02T12:00:00Z',4,700,400,2880,3980,'terminée','2025-05-02T08:00:00Z'),
('int-012','mach-010','tech-001','améliorative','Installation d''un capteur de surveillance du palettiseur','Amélioration continue','Installation capteur vibratoire et configuration alarme','2025-04-15T08:00:00Z','2025-04-16T16:00:00Z',12,1500,2200,3840,7540,'terminée','2025-04-15T08:00:00Z');

-- ── MÉTRIQUES DE PRODUCTION ──────────────────────────────────
insert into production_metrics (id, "machineId", date, "plannedTime", downtime, "producedQuantity",
  "rejectedQuantity", "theoreticalCycleTime", "realCycleTime", "createdAt") values
('pm-001','mach-006','2025-04-01',8,0.5,9200,140,0.05,0.055,'2025-04-01T00:00:00Z'),
('pm-002','mach-006','2025-04-02',8,1.5,8100,210,0.05,0.06,'2025-04-02T00:00:00Z'),
('pm-003','mach-007','2025-04-01',8,0,9400,80,0.05,0.051,'2025-04-01T00:00:00Z'),
('pm-004','mach-007','2025-04-02',8,0.5,9000,95,0.05,0.053,'2025-04-02T00:00:00Z'),
('pm-005','mach-003','2025-04-01',8,0,240,4,2.0,2.1,'2025-04-01T00:00:00Z'),
('pm-006','mach-003','2025-04-02',8,1,210,6,2.0,2.25,'2025-04-02T00:00:00Z'),
('pm-007','mach-008','2025-04-01',8,0.5,9100,120,0.05,0.054,'2025-04-01T00:00:00Z'),
('pm-008','mach-010','2025-04-01',8,0,760,5,0.6,0.63,'2025-04-01T00:00:00Z');

-- ── BONS DE COMMANDE (+ lignes) ──────────────────────────────
insert into purchase_orders (id, "poNumber", "supplierId", "sparePartId", quantity, "unitCost", "totalAmount",
  status, "orderDate", "expectedDelivery", "receivedDate", "receivedQty", "createdAt", "approvalStatus") values
('po-001','PO-2025-001','sup-001','sp-001',20,85,1700,'réceptionnée','2025-01-05T00:00:00Z','2025-01-10T00:00:00Z','2025-01-09T00:00:00Z',20,'2025-01-05T00:00:00Z','non requis'),
('po-002','PO-2025-002','sup-002','sp-003',15,145,2175,'envoyée','2025-04-20T00:00:00Z','2025-05-02T00:00:00Z',null,null,'2025-04-20T00:00:00Z','non requis'),
('po-003','PO-2025-003','sup-003','sp-009',8,290,2320,'partielle','2025-05-12T00:00:00Z','2025-05-15T00:00:00Z',null,4,'2025-05-12T00:00:00Z','non requis'),
('po-004','PO-2025-004','sup-004','sp-011',12,95,1140,'brouillon','2025-05-18T00:00:00Z','2025-06-02T00:00:00Z',null,null,'2025-05-18T00:00:00Z','non requis');

insert into purchase_order_lines (id, "poId", "sparePartId", quantity, "unitCost", "receivedQty", "createdAt") values
('pol-po-001','po-001','sp-001',20,85,20,'2025-01-05T00:00:00Z'),
('pol-po-002','po-002','sp-003',15,145,0,'2025-04-20T00:00:00Z'),
('pol-po-003','po-003','sp-009',8,290,4,'2025-05-12T00:00:00Z'),
('pol-po-004','po-004','sp-011',12,95,0,'2025-05-18T00:00:00Z');

-- ── PERSONNEL (30 opérateurs de production) ──────────────────
insert into personnel (id, nom, role, specialite, telephone, email, statut) values
('op-001','Karim Benjelloun','operateur','Réception','+212 6 60 10 01 01','karim.b@lcprod.ma','actif'),
('op-002','Rachid Alaoui','operateur','Réception','+212 6 60 10 02 02','rachid.a@lcprod.ma','actif'),
('op-003','Mehdi Saidi','operateur','Réception','+212 6 60 10 03 03','mehdi.s@lcprod.ma','actif'),
('op-004','Hassan El Mourabiti','operateur','Préparation','+212 6 60 10 04 04','hassan.m@lcprod.ma','actif'),
('op-005','Younes Berrada','operateur','Préparation','+212 6 60 10 05 05','younes.b@lcprod.ma','actif'),
('op-006','Khalid Naciri','operateur','Préparation','+212 6 60 10 06 06','khalid.n@lcprod.ma','actif'),
('op-007','Said Ouazzani','operateur','Préparation','+212 6 60 10 07 07','said.o@lcprod.ma','inactif'),
('op-008','Brahim Lahlou','operateur','Production','+212 6 60 10 08 08','brahim.l@lcprod.ma','actif'),
('op-009','Mustapha Chraibi','operateur','Production','+212 6 60 10 09 09','mustapha.c@lcprod.ma','actif'),
('op-010','Abdellah Sbai','operateur','Production','+212 6 60 10 10 10','abdellah.s@lcprod.ma','actif'),
('op-011','Tarik El Ghazi','operateur','Production','+212 6 60 10 11 11','tarik.e@lcprod.ma','actif'),
('op-012','Nabil Hamdi','operateur','Production','+212 6 60 10 12 12','nabil.h@lcprod.ma','actif'),
('op-013','Fatima Zahra','operateur','Remplissage','+212 6 60 10 13 13','fatima.z@lcprod.ma','actif'),
('op-014','Amine Belkadi','operateur','Remplissage','+212 6 60 10 14 14','amine.b@lcprod.ma','actif'),
('op-015','Soufiane Rami','operateur','Remplissage','+212 6 60 10 15 15','soufiane.r@lcprod.ma','actif'),
('op-016','Driss El Khattabi','operateur','Remplissage','+212 6 60 10 16 16','driss.e@lcprod.ma','actif'),
('op-017','Othmane Filali','operateur','Remplissage','+212 6 60 10 17 17','othmane.f@lcprod.ma','actif'),
('op-018','Salma Bouazza','operateur','Conditionnement','+212 6 60 10 18 18','salma.b@lcprod.ma','actif'),
('op-019','Imane Tahiri','operateur','Conditionnement','+212 6 60 10 19 19','imane.t@lcprod.ma','actif'),
('op-020','Zineb El Amrani','operateur','Conditionnement','+212 6 60 10 20 20','zineb.e@lcprod.ma','actif'),
('op-021','Hamza Sekkat','operateur','Conditionnement','+212 6 60 10 21 21','hamza.s@lcprod.ma','actif'),
('op-022','Yassir Benkirane','operateur','Conditionnement','+212 6 60 10 22 22','yassir.b@lcprod.ma','actif'),
('op-023','Rim Lazrak','operateur','Conditionnement','+212 6 60 10 23 23','rim.l@lcprod.ma','actif'),
('op-024','Kawtar Mansouri','operateur','Conditionnement','+212 6 60 10 24 24','kawtar.m@lcprod.ma','inactif'),
('op-025','Nadia Cherkaoui','operateur','Expédition','+212 6 60 10 25 25','nadia.c@lcprod.ma','actif'),
('op-026','Adil Bennani','operateur','Expédition','+212 6 60 10 26 26','adil.b@lcprod.ma','actif'),
('op-027','Jamal Riffi','operateur','Expédition','+212 6 60 10 27 27','jamal.r@lcprod.ma','actif'),
('op-028','Mohamed Drissi','operateur','Utilités','+212 6 60 10 28 28','mohamed.d@lcprod.ma','actif'),
('op-029','Anas El Yacoubi','operateur','Utilités','+212 6 60 10 29 29','anas.e@lcprod.ma','actif'),
('op-030','Walid Charkaoui','operateur','Utilités','+212 6 60 10 30 30','walid.c@lcprod.ma','actif');

-- ── PLANS DE MAINTENANCE PRÉVENTIVE ──────────────────────────
insert into maintenance_plans (id, "machineId", title, "interventionType", "frequencyDays", "lastDoneDate", "nextDueDate", active, notes) values
('mp-001','mach-001','Graissage pompe & contrôle d''étanchéité','préventive',30,(current_date - 20),(current_date + 10),true,'Pompe de transfert — contrôle mensuel'),
('mp-002','mach-012','Contrôle réglementaire chaudière & soupape','conditionnelle',90,(current_date - 95),(current_date - 5),true,'Chaudière — inspection trimestrielle (en retard)'),
('mp-003','mach-011','Vidange & remplacement filtre compresseur','préventive',45,(current_date - 45),current_date,true,'Compresseur air — entretien à échéance');

-- ── CONSOMMABLES ─────────────────────────────────────────────
insert into consumables (id, name, atelier, "totalHours", "usedHours", icon) values
('cons-001','Huile lubrifiante machines','Tous ateliers',1000,450,'🛢️'),
('cons-002','Cartouches filtrantes alimentaires','Traitement',300,264,'🧴'),
('cons-003','Graisse alimentaire NSF H1','Tous ateliers',800,210,'🧴'),
('cons-004','Rouleaux d''étiquettes','Conditionnement',2000,1240,'🏷️'),
('cons-005','Film d''emballage rétractable','Emballage',1500,980,'📦')
on conflict (id) do nothing;

commit;

-- ── Verify ────────────────────────────────────────────────────
select 'machines' as t, count(*) from machines
union all select 'technicians', count(*) from technicians
union all select 'spare_parts', count(*) from spare_parts
union all select 'interventions', count(*) from interventions
union all select 'purchase_orders', count(*) from purchase_orders
union all select 'maintenance_plans', count(*) from maintenance_plans
union all select 'personnel', count(*) from personnel
union all select 'consumables', count(*) from consumables;
