-- ============================================================
-- Add consumable-type items as SPARE PARTS so they can trigger the
-- auto-réapprovisionnement flow (which only handles spare_parts, not
-- the "wear tracker" consumables table). Run this in Supabase SQL Editor.
--
-- These items are typical for the L.C PROD edible-oil plant and mirror
-- the entries in the Consommables tracker so both views agree.
-- ============================================================

insert into spare_parts (id, name, reference, quantity, "minimumStock", "machineId", "unitCost", "createdAt") values
    ('sp-c-001', 'Huile lubrifiante machines (fût 20L)',       'HUIL-LUB-20L', 3, 5, null, 480, now()),
    ('sp-c-002', 'Cartouches filtrantes alimentaires 10µm',    'CART-FILT-10', 4, 6, null, 210, now()),
    ('sp-c-003', 'Graisse alimentaire NSF H1 (cartouche 400g)','GRSE-NSFH1',  12, 15, null, 95, now()),
    ('sp-c-004', 'Rouleaux d''étiquettes autocollantes',       'ROUL-ETIQ',   2, 4, null, 65, now()),
    ('sp-c-005', 'Film d''emballage rétractable (rouleau 500m)','FILM-RETRAC',3, 5, null, 320, now()),
    ('sp-c-006', 'Huile hydraulique 46 (fût 20L)',             'HUIL-HYD-46', 2, 4, null, 450, now()),
    ('sp-c-007', 'Solvant CIP alcalin (5L)',                   'CIP-ALCA-5L', 5, 8, null, 180, now()),
    ('sp-c-008', 'Solvant CIP acide (5L)',                     'CIP-ACID-5L', 4, 6, null, 175, now()),
    ('sp-c-009', 'Détergent désinfectant HACCP',               'DET-HACCP',   6, 10, null, 220, now()),
    ('sp-c-010', 'Chiffons industriels (paquet 100)',          'CHIF-IND-100', 8, 12, null, 55, now())
on conflict (id) do nothing;

-- Sanity check
select id, name, quantity, "minimumStock",
    case when quantity <= "minimumStock" then '⚠️ à commander' else 'ok' end as statut
from spare_parts
where id like 'sp-c-%'
order by id;
