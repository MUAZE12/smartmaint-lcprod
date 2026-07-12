// ============================================
// SmartMaint — L.C PROD
// Données fictives — Usine d'huiles alimentaires (Maroc)
// ============================================

import { Machine, Technician, Intervention, SparePart, ProductionMetric, Supplier, PurchaseOrder } from './types';

// ============================================
// MACHINES — ligne de production huile alimentaire
// ============================================
export const machines: Machine[] = [
    {
        id: 'mach-001', code: 'POM-001', name: 'Pompe de transfert huile',
        type: 'Réception', workshop: 'Réception MP', location: 'Zone réception',
        installationDate: '2019-03-15', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 420, importanceLevel: 8,
        createdAt: '2019-03-15T08:00:00Z',
        manufacturer: 'Grundfos', model: 'NB 65-200', serialNumber: 'GRF-2019-44821',
        voltage: 400, power: 11, amperage: 22, airPressure: 0, waterConsumption: 0,
        length: 1200, width: 600, height: 700, weight: 320, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-002', code: 'FIL-001', name: 'Filtre industriel',
        type: 'Préparation', workshop: 'Traitement', location: 'Préparation',
        installationDate: '2018-06-20', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 380, importanceLevel: 7,
        createdAt: '2018-06-20T08:00:00Z',
        manufacturer: 'Alfa Laval', model: 'AF 200', serialNumber: 'ALF-2018-33102',
        voltage: 400, power: 7.5, amperage: 16, airPressure: 4, waterConsumption: 2,
        length: 2000, width: 1100, height: 1800, weight: 850, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-003', code: 'MEL-001', name: 'Cuve de mélange',
        type: 'Production', workshop: 'Production', location: 'Ligne 1',
        installationDate: '2020-01-10', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 560, importanceLevel: 9,
        createdAt: '2020-01-10T08:00:00Z',
        manufacturer: 'INOXPA', model: 'MX-3000', serialNumber: 'INX-2020-10293',
        voltage: 400, power: 18.5, amperage: 34, airPressure: 6, waterConsumption: 8,
        length: 2400, width: 2400, height: 3200, weight: 2100, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-004', code: 'ECH-001', name: 'Échangeur thermique',
        type: 'Production', workshop: 'Production', location: 'Ligne 1',
        installationDate: '2021-05-05', status: 'en maintenance',
        criticalityScore: 0, hourlyDowntimeCost: 510, importanceLevel: 8,
        createdAt: '2021-05-05T08:00:00Z',
        manufacturer: 'Alfa Laval', model: 'M10-BFG', serialNumber: 'ALF-2021-55410',
        voltage: 400, power: 22, amperage: 40, airPressure: 0, waterConsumption: 30,
        length: 1600, width: 800, height: 1900, weight: 1250, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-005', code: 'CNV-001', name: 'Convoyeur bouteilles',
        type: 'Conditionnement', workshop: 'Conditionnement', location: 'Ligne 1',
        installationDate: '2020-09-12', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 240, importanceLevel: 6,
        createdAt: '2020-09-12T08:00:00Z',
        manufacturer: 'Sidel', model: 'CV-Flex', serialNumber: 'SID-2020-78923',
        voltage: 230, power: 4, amperage: 9, airPressure: 6, waterConsumption: 0,
        length: 12000, width: 600, height: 1000, weight: 1400, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-006', code: 'REM-001', name: 'Remplisseuse automatique',
        type: 'Remplissage', workshop: 'Remplissage', location: 'Ligne 1',
        installationDate: '2021-02-18', status: 'en panne',
        criticalityScore: 0, hourlyDowntimeCost: 680, importanceLevel: 10,
        createdAt: '2021-02-18T08:00:00Z',
        manufacturer: 'KRONES', model: 'Sensometic VPR', serialNumber: 'KRO-2021-66120',
        voltage: 400, power: 15, amperage: 28, airPressure: 7, waterConsumption: 4,
        length: 4500, width: 2600, height: 2400, weight: 3800, mainCounterUnit: 'cycles',
    },
    {
        id: 'mach-007', code: 'BOU-001', name: 'Bouchonneuse automatique',
        type: 'Conditionnement', workshop: 'Conditionnement', location: 'Ligne 1',
        installationDate: '2021-02-18', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 360, importanceLevel: 7,
        createdAt: '2021-02-18T08:00:00Z',
        manufacturer: 'Arol', model: 'EURO 3T', serialNumber: 'ARO-2021-66121',
        voltage: 400, power: 6, amperage: 13, airPressure: 6, waterConsumption: 0,
        length: 2200, width: 1800, height: 2300, weight: 1600, mainCounterUnit: 'cycles',
    },
    {
        id: 'mach-008', code: 'ETQ-001', name: 'Étiqueteuse automatique',
        type: 'Conditionnement', workshop: 'Conditionnement', location: 'Ligne 1',
        installationDate: '2021-02-18', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 300, importanceLevel: 6,
        createdAt: '2021-02-18T08:00:00Z',
        manufacturer: 'P.E. Labellers', model: 'Modular', serialNumber: 'PEL-2021-66122',
        voltage: 230, power: 3, amperage: 8, airPressure: 5, waterConsumption: 0,
        length: 2600, width: 1600, height: 2000, weight: 1100, mainCounterUnit: 'cycles',
    },
    {
        id: 'mach-009', code: 'EMB-001', name: "Machine d'emballage",
        type: 'Conditionnement', workshop: 'Emballage', location: 'Ligne 1',
        installationDate: '2022-04-03', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 280, importanceLevel: 6,
        createdAt: '2022-04-03T08:00:00Z',
        manufacturer: 'SMI', model: 'LSK 25F', serialNumber: 'SMI-2022-90011',
        voltage: 400, power: 9, amperage: 18, airPressure: 7, waterConsumption: 0,
        length: 5000, width: 2400, height: 2300, weight: 2900, mainCounterUnit: 'cycles',
    },
    {
        id: 'mach-010', code: 'PAL-001', name: 'Palettiseur',
        type: 'Expédition', workshop: 'Expédition', location: 'Fin de ligne',
        installationDate: '2022-04-03', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 320, importanceLevel: 7,
        createdAt: '2022-04-03T08:00:00Z',
        manufacturer: 'Fanuc', model: 'M-410iC', serialNumber: 'FAN-2022-90012',
        voltage: 400, power: 12, amperage: 24, airPressure: 6, waterConsumption: 0,
        length: 3500, width: 3500, height: 2800, weight: 4200, mainCounterUnit: 'cycles',
    },
    {
        id: 'mach-011', code: 'CMP-001', name: 'Compresseur air',
        type: 'Utilités', workshop: 'Utilités', location: 'Salle des utilités',
        installationDate: '2018-11-22', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 600, importanceLevel: 9,
        createdAt: '2018-11-22T08:00:00Z',
        manufacturer: 'Atlas Copco', model: 'GA 30 VSD', serialNumber: 'ATC-2018-22014',
        voltage: 400, power: 30, amperage: 55, airPressure: 8, waterConsumption: 0,
        length: 1900, width: 1100, height: 1700, weight: 980, mainCounterUnit: 'heures',
    },
    {
        id: 'mach-012', code: 'CHD-001', name: 'Chaudière industrielle',
        type: 'Utilités', workshop: 'Utilités', location: 'Salle des utilités',
        installationDate: '2017-08-30', status: 'opérationnelle',
        criticalityScore: 0, hourlyDowntimeCost: 720, importanceLevel: 10,
        createdAt: '2017-08-30T08:00:00Z',
        manufacturer: 'Bosch', model: 'UL-S 4000', serialNumber: 'BSC-2017-30015',
        voltage: 400, power: 45, amperage: 72, airPressure: 0, waterConsumption: 120,
        length: 4000, width: 2000, height: 2600, weight: 6500, mainCounterUnit: 'heures',
    },
];

// ============================================
// TECHNICIENS — équipe maintenance L.C PROD
// ============================================
export const technicians: Technician[] = [
    { id: 'tech-001', fullName: 'Ahmed El Amrani', specialty: 'Mécanique industrielle', phone: '+212 6 12 34 56 78', email: 'ahmed.elamrani@lcprod.ma', availability: 'disponible', createdAt: '2019-01-10T08:00:00Z' },
    { id: 'tech-002', fullName: 'Yassine Bennis', specialty: 'Électricité industrielle', phone: '+212 6 23 45 67 89', email: 'yassine.bennis@lcprod.ma', availability: 'en intervention', createdAt: '2019-03-15T08:00:00Z' },
    { id: 'tech-003', fullName: 'Sara Idrissi', specialty: 'Automatisme & instrumentation', phone: '+212 6 34 56 78 90', email: 'sara.idrissi@lcprod.ma', availability: 'disponible', createdAt: '2020-02-01T08:00:00Z' },
    { id: 'tech-004', fullName: 'Omar El Fassi', specialty: 'Froid & thermique', phone: '+212 6 45 67 89 01', email: 'omar.elfassi@lcprod.ma', availability: 'disponible', createdAt: '2020-06-15T08:00:00Z' },
    { id: 'tech-005', fullName: 'Hicham Tazi', specialty: 'Maintenance générale', phone: '+212 6 56 78 90 12', email: 'hicham.tazi@lcprod.ma', availability: 'disponible', createdAt: '2021-09-01T08:00:00Z' },
];

// ============================================
// INTERVENTIONS
// ============================================
export const interventions: Intervention[] = [
    { id: 'int-001', machineId: 'mach-001', technicianId: 'tech-001', interventionType: 'corrective', description: 'Fuite au niveau de la garniture mécanique de la pompe', probableCause: 'Usure de la garniture', actionDone: 'Remplacement de la garniture mécanique et contrôle alignement', startDate: '2025-01-12T08:00:00Z', endDate: '2025-01-12T12:00:00Z', downtimeHours: 4, laborCost: 600, partsCost: 850, downtimeCost: 1680, totalCost: 3130, status: 'terminée', createdAt: '2025-01-12T08:00:00Z' },
    { id: 'int-002', machineId: 'mach-001', technicianId: 'tech-002', interventionType: 'préventive', description: 'Contrôle mensuel pompe — graissage et vérification', probableCause: 'Programme préventif', actionDone: 'Graissage roulements, contrôle débit et étanchéité', startDate: '2025-02-15T09:00:00Z', endDate: '2025-02-15T11:00:00Z', downtimeHours: 2, laborCost: 350, partsCost: 120, downtimeCost: 840, totalCost: 1310, status: 'terminée', createdAt: '2025-02-15T09:00:00Z' },
    { id: 'int-003', machineId: 'mach-002', technicianId: 'tech-005', interventionType: 'préventive', description: 'Remplacement cartouches filtrantes', probableCause: 'Colmatage des cartouches', actionDone: 'Remplacement des cartouches et nettoyage du carter', startDate: '2025-03-05T08:00:00Z', endDate: '2025-03-05T10:30:00Z', downtimeHours: 2.5, laborCost: 300, partsCost: 450, downtimeCost: 950, totalCost: 1700, status: 'terminée', createdAt: '2025-03-05T08:00:00Z' },
    { id: 'int-004', machineId: 'mach-003', technicianId: 'tech-001', interventionType: 'corrective', description: 'Vibration anormale de l\'agitateur de la cuve de mélange', probableCause: 'Désalignement de l\'arbre d\'agitation', actionDone: 'Réalignement de l\'arbre et remplacement des paliers', startDate: '2025-03-20T07:00:00Z', endDate: '2025-03-20T15:00:00Z', downtimeHours: 8, laborCost: 1000, partsCost: 1600, downtimeCost: 4480, totalCost: 7080, status: 'terminée', createdAt: '2025-03-20T07:00:00Z' },
    { id: 'int-005', machineId: 'mach-004', technicianId: 'tech-004', interventionType: 'corrective', description: 'Baisse de rendement thermique de l\'échangeur', probableCause: 'Encrassement des plaques', actionDone: 'Démontage et nettoyage chimique des plaques (en cours)', startDate: '2025-05-18T08:00:00Z', endDate: null, downtimeHours: 6, laborCost: 800, partsCost: 300, downtimeCost: 3060, totalCost: 4160, status: 'en cours', createdAt: '2025-05-18T08:00:00Z' },
    { id: 'int-006', machineId: 'mach-006', technicianId: 'tech-002', interventionType: 'corrective', description: 'Arrêt remplisseuse — défaut de dosage sur 4 becs', probableCause: 'Buses de remplissage encrassées / électrovanne défectueuse', actionDone: 'Diagnostic en cours', startDate: '2025-05-20T07:30:00Z', endDate: null, downtimeHours: 9, laborCost: 900, partsCost: 600, downtimeCost: 6120, totalCost: 7620, status: 'en cours', createdAt: '2025-05-20T07:30:00Z' },
    { id: 'int-007', machineId: 'mach-005', technicianId: 'tech-005', interventionType: 'corrective', description: 'Blocage du convoyeur bouteilles en sortie remplissage', probableCause: 'Galet de convoyeur grippé', actionDone: 'Remplacement du galet et lubrification de la chaîne', startDate: '2025-04-10T10:00:00Z', endDate: '2025-04-10T12:30:00Z', downtimeHours: 2.5, laborCost: 350, partsCost: 280, downtimeCost: 600, totalCost: 1230, status: 'terminée', createdAt: '2025-04-10T10:00:00Z' },
    { id: 'int-008', machineId: 'mach-007', technicianId: 'tech-003', interventionType: 'préventive', description: 'Réglage et contrôle de la bouchonneuse', probableCause: 'Programme préventif', actionDone: 'Réglage couple de serrage, contrôle mâchoires', startDate: '2025-04-22T09:00:00Z', endDate: '2025-04-22T11:00:00Z', downtimeHours: 2, laborCost: 300, partsCost: 90, downtimeCost: 720, totalCost: 1110, status: 'terminée', createdAt: '2025-04-22T09:00:00Z' },
    { id: 'int-009', machineId: 'mach-008', technicianId: 'tech-003', interventionType: 'corrective', description: 'Étiquettes mal positionnées sur les bouteilles', probableCause: 'Dérive du capteur de position', actionDone: 'Recalibrage du capteur et nettoyage des rouleaux', startDate: '2025-04-28T08:00:00Z', endDate: '2025-04-28T10:00:00Z', downtimeHours: 2, laborCost: 300, partsCost: 150, downtimeCost: 600, totalCost: 1050, status: 'terminée', createdAt: '2025-04-28T08:00:00Z' },
    { id: 'int-010', machineId: 'mach-011', technicianId: 'tech-002', interventionType: 'préventive', description: 'Maintenance préventive compresseur — filtre & huile', probableCause: 'Programme préventif', actionDone: 'Remplacement filtre à air et vidange huile', startDate: '2025-03-28T08:00:00Z', endDate: '2025-03-28T11:00:00Z', downtimeHours: 3, laborCost: 450, partsCost: 700, downtimeCost: 1800, totalCost: 2950, status: 'terminée', createdAt: '2025-03-28T08:00:00Z' },
    { id: 'int-011', machineId: 'mach-012', technicianId: 'tech-004', interventionType: 'conditionnelle', description: 'Contrôle de la soupape de sécurité de la chaudière', probableCause: 'Surveillance réglementaire', actionDone: 'Test et étalonnage de la soupape de sécurité', startDate: '2025-05-02T08:00:00Z', endDate: '2025-05-02T12:00:00Z', downtimeHours: 4, laborCost: 700, partsCost: 400, downtimeCost: 2880, totalCost: 3980, status: 'terminée', createdAt: '2025-05-02T08:00:00Z' },
    { id: 'int-012', machineId: 'mach-010', technicianId: 'tech-001', interventionType: 'améliorative', description: 'Installation d\'un capteur de surveillance du palettiseur', probableCause: 'Amélioration continue', actionDone: 'Installation capteur vibratoire et configuration alarme', startDate: '2025-04-15T08:00:00Z', endDate: '2025-04-16T16:00:00Z', downtimeHours: 12, laborCost: 1500, partsCost: 2200, downtimeCost: 3840, totalCost: 7540, status: 'terminée', createdAt: '2025-04-15T08:00:00Z' },
];

// ============================================
// PIÈCES DE RECHANGE
// ============================================
export const spareParts: SparePart[] = [
    { id: 'sp-001', name: 'Roulement à billes SKF 6205', reference: 'SKF-6205-2RS', quantity: 14, minimumStock: 6, machineId: 'mach-001', unitCost: 85, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-002', name: 'Garniture mécanique de pompe', reference: 'GAR-MEC-32', quantity: 5, minimumStock: 3, machineId: 'mach-001', unitCost: 320, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-003', name: 'Cartouche filtrante alimentaire', reference: 'CAR-FIL-10', quantity: 9, minimumStock: 4, machineId: 'mach-002', unitCost: 145, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-004', name: 'Joint d\'étanchéité alimentaire EPDM', reference: 'JNT-ALIM-50', quantity: 24, minimumStock: 12, machineId: 'mach-003', unitCost: 22, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-005', name: 'Palier d\'agitateur de cuve', reference: 'PAL-AGI-40', quantity: 3, minimumStock: 2, machineId: 'mach-003', unitCost: 540, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-006', name: 'Résistance chauffante 3 kW', reference: 'RES-CH-3KW', quantity: 4, minimumStock: 2, machineId: 'mach-004', unitCost: 380, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-007', name: 'Sonde de température PT100', reference: 'PT100-TEMP', quantity: 6, minimumStock: 3, machineId: 'mach-004', unitCost: 165, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-008', name: 'Galet de convoyeur', reference: 'GAL-CNV-80', quantity: 10, minimumStock: 6, machineId: 'mach-005', unitCost: 60, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-009', name: 'Buse de remplissage inox', reference: 'BUS-REM-INX', quantity: 2, minimumStock: 4, machineId: 'mach-006', unitCost: 290, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-010', name: 'Électrovanne pneumatique', reference: 'EV-PNEU-14', quantity: 7, minimumStock: 4, machineId: 'mach-006', unitCost: 210, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-011', name: 'Filtre à air compresseur', reference: 'FLT-AIR-100', quantity: 8, minimumStock: 4, machineId: 'mach-011', unitCost: 95, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-012', name: 'Soupape de sécurité chaudière 8 bar', reference: 'SOUP-SEC-8B', quantity: 1, minimumStock: 1, machineId: 'mach-012', unitCost: 1250, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-013', name: 'Courroie de transmission HTD', reference: 'HTD-5M-450', quantity: 6, minimumStock: 4, machineId: null, unitCost: 120, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sp-014', name: 'Graisse alimentaire NSF H1', reference: 'GRS-NSF-1KG', quantity: 5, minimumStock: 3, machineId: null, unitCost: 95, createdAt: '2024-01-01T00:00:00Z' },
];

// ============================================
// MÉTRIQUES DE PRODUCTION (pour calcul TRS)
// ============================================
export const productionMetrics: ProductionMetric[] = [
    { id: 'pm-001', machineId: 'mach-006', date: '2025-04-01', plannedTime: 8, downtime: 0.5, producedQuantity: 9200, rejectedQuantity: 140, theoreticalCycleTime: 0.05, realCycleTime: 0.055, createdAt: '2025-04-01T00:00:00Z' },
    { id: 'pm-002', machineId: 'mach-006', date: '2025-04-02', plannedTime: 8, downtime: 1.5, producedQuantity: 8100, rejectedQuantity: 210, theoreticalCycleTime: 0.05, realCycleTime: 0.06, createdAt: '2025-04-02T00:00:00Z' },
    { id: 'pm-003', machineId: 'mach-007', date: '2025-04-01', plannedTime: 8, downtime: 0, producedQuantity: 9400, rejectedQuantity: 80, theoreticalCycleTime: 0.05, realCycleTime: 0.051, createdAt: '2025-04-01T00:00:00Z' },
    { id: 'pm-004', machineId: 'mach-007', date: '2025-04-02', plannedTime: 8, downtime: 0.5, producedQuantity: 9000, rejectedQuantity: 95, theoreticalCycleTime: 0.05, realCycleTime: 0.053, createdAt: '2025-04-02T00:00:00Z' },
    { id: 'pm-005', machineId: 'mach-003', date: '2025-04-01', plannedTime: 8, downtime: 0, producedQuantity: 240, rejectedQuantity: 4, theoreticalCycleTime: 2.0, realCycleTime: 2.1, createdAt: '2025-04-01T00:00:00Z' },
    { id: 'pm-006', machineId: 'mach-003', date: '2025-04-02', plannedTime: 8, downtime: 1, producedQuantity: 210, rejectedQuantity: 6, theoreticalCycleTime: 2.0, realCycleTime: 2.25, createdAt: '2025-04-02T00:00:00Z' },
    { id: 'pm-007', machineId: 'mach-008', date: '2025-04-01', plannedTime: 8, downtime: 0.5, producedQuantity: 9100, rejectedQuantity: 120, theoreticalCycleTime: 0.05, realCycleTime: 0.054, createdAt: '2025-04-01T00:00:00Z' },
    { id: 'pm-008', machineId: 'mach-010', date: '2025-04-01', plannedTime: 8, downtime: 0, producedQuantity: 760, rejectedQuantity: 5, theoreticalCycleTime: 0.6, realCycleTime: 0.63, createdAt: '2025-04-01T00:00:00Z' },
];

// ============================================
// FOURNISSEURS
// ============================================
export const suppliers: Supplier[] = [
    { id: 'sup-001', name: 'SKF Maroc', contactName: 'Rachid Bennani', email: 'r.bennani@skf.ma', phone: '+212 5 22 33 44 55', avgDeliveryDays: 5, reliability: 95, createdAt: '2023-01-15T00:00:00Z' },
    { id: 'sup-002', name: 'Alfa Laval Maroc', contactName: 'Pierre Dupont', email: 'contact@alfalaval.ma', phone: '+212 5 22 66 77 88', avgDeliveryDays: 12, reliability: 90, createdAt: '2023-02-20T00:00:00Z' },
    { id: 'sup-003', name: 'Électro-Mécanique du Gharb', contactName: 'Abdelkader Slaoui', email: 'a.slaoui@emg.ma', phone: '+212 5 37 22 11 00', avgDeliveryDays: 3, reliability: 92, createdAt: '2023-03-10T00:00:00Z' },
    { id: 'sup-004', name: 'Atlas Copco Maroc', contactName: 'James Wilson', email: 'service@atlascopco.ma', phone: '+212 5 22 99 00 11', avgDeliveryDays: 15, reliability: 97, createdAt: '2023-04-05T00:00:00Z' },
];

// ============================================
// BONS DE COMMANDE
// ============================================
export const purchaseOrders: PurchaseOrder[] = [
    { id: 'po-001', poNumber: 'PO-2025-001', supplierId: 'sup-001', sparePartId: 'sp-001', quantity: 20, unitCost: 85, totalAmount: 1700, status: 'réceptionnée', orderDate: '2025-01-05T00:00:00Z', expectedDelivery: '2025-01-10T00:00:00Z', receivedDate: '2025-01-09T00:00:00Z', receivedQty: 20, createdAt: '2025-01-05T00:00:00Z' },
    { id: 'po-002', poNumber: 'PO-2025-002', supplierId: 'sup-002', sparePartId: 'sp-003', quantity: 15, unitCost: 145, totalAmount: 2175, status: 'envoyée', orderDate: '2025-04-20T00:00:00Z', expectedDelivery: '2025-05-02T00:00:00Z', createdAt: '2025-04-20T00:00:00Z' },
    { id: 'po-003', poNumber: 'PO-2025-003', supplierId: 'sup-003', sparePartId: 'sp-009', quantity: 8, unitCost: 290, totalAmount: 2320, status: 'partielle', orderDate: '2025-05-12T00:00:00Z', expectedDelivery: '2025-05-15T00:00:00Z', receivedQty: 4, createdAt: '2025-05-12T00:00:00Z' },
    { id: 'po-004', poNumber: 'PO-2025-004', supplierId: 'sup-004', sparePartId: 'sp-011', quantity: 12, unitCost: 95, totalAmount: 1140, status: 'brouillon', orderDate: '2025-05-18T00:00:00Z', expectedDelivery: '2025-06-02T00:00:00Z', createdAt: '2025-05-18T00:00:00Z' },
];

// ============================================
// Helpers — lookup functions
// ============================================
export function getMachineById(id: string): Machine | undefined {
    return machines.find(m => m.id === id);
}
export function getTechnicianById(id: string): Technician | undefined {
    return technicians.find(t => t.id === id);
}
export function getInterventionsByMachine(machineId: string): Intervention[] {
    return interventions.filter(i => i.machineId === machineId);
}
export function getInterventionsByTechnician(technicianId: string): Intervention[] {
    return interventions.filter(i => i.technicianId === technicianId);
}
export function getSparePartsByMachine(machineId: string): SparePart[] {
    return spareParts.filter(sp => sp.machineId === machineId);
}
export function getProductionMetricsByMachine(machineId: string): ProductionMetric[] {
    return productionMetrics.filter(pm => pm.machineId === machineId);
}
export function getSupplierById(id: string): Supplier | undefined {
    return suppliers.find(s => s.id === id);
}
export function getPurchaseOrdersByPart(partId: string): PurchaseOrder[] {
    return purchaseOrders.filter(po => po.sparePartId === partId);
}
