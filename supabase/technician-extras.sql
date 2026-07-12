-- ============================================================
-- SmartMaint — L.C PROD  ·  Outils techniciens
-- ------------------------------------------------------------
--   1. interventions.attachments   — JSONB column for photos
--      and videos taken on site (base64 data URLs).
--   2. knowledge_articles          — short procedures / fiches
--      de dépannage, searchable by the technician.
--   3. checklist_templates seed    — a "Démarrage de poste"
--      daily safety + HACCP check the tech runs before work.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. INTERVENTIONS.ATTACHMENTS ─────────────────────────────
alter table interventions
  add column if not exists attachments jsonb default '[]'::jsonb;

-- ── 2. KNOWLEDGE ARTICLES ────────────────────────────────────
create table if not exists knowledge_articles (
  id            text primary key,
  title         text not null,
  content       text not null,
  "machineType" text,                                  -- one of the 7 stages, or null
  category      text default 'procédure',              -- procédure | dépannage | sécurité | étalonnage
  tags          text default '',                       -- comma-separated tags
  "createdAt"   timestamptz default now()
);
create index if not exists knowledge_articles_cat_idx on knowledge_articles (category);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table knowledge_articles';
  exception when duplicate_object then null;
  end;
  execute 'alter table knowledge_articles enable row level security';
  execute 'grant select, insert, update, delete on public.knowledge_articles to authenticated';
  execute 'drop policy if exists "auth read"   on knowledge_articles';
  execute 'drop policy if exists "auth insert" on knowledge_articles';
  execute 'drop policy if exists "auth update" on knowledge_articles';
  execute 'drop policy if exists "auth delete" on knowledge_articles';
  execute 'create policy "auth read"   on knowledge_articles for select to authenticated using (true)';
  execute 'create policy "auth insert" on knowledge_articles for insert to authenticated with check (true)';
  execute 'create policy "auth update" on knowledge_articles for update to authenticated using (true) with check (true)';
  execute 'create policy "auth delete" on knowledge_articles for delete to authenticated using (true)';
end $$;

insert into knowledge_articles (id, title, content, "machineType", category, tags) values
('kb-001',
 'Changer une cartouche filtrante FIL-001',
 E'**Préparation**\n1. Arrêter la pompe d''alimentation en amont.\n2. Fermer la vanne d''entrée puis la vanne de sortie.\n3. Ouvrir le purgeur pour décompresser le carter.\n\n**Démontage**\n4. Dévisser le carter à l''aide de la clé fournie (sens antihoraire).\n5. Retirer la cartouche usagée et la mettre au rebut DAS.\n\n**Remontage**\n6. Nettoyer le carter à l''eau chaude + détergent alimentaire.\n7. Vérifier l''état du joint torique — remplacer si besoin.\n8. Installer la nouvelle cartouche, revisser le carter à la main + 1/8 de tour.\n9. Rouvrir vanne d''entrée, contrôler étanchéité, puis vanne de sortie.\n\n**Durée moyenne :** 25 min · **EPI :** gants nitrile, lunettes.',
 'Préparation','procédure','filtre,cartouche,FIL-001,alimentaire'),
('kb-002',
 'Démarrage chaudière vapeur CHD-001 — sécurité',
 E'**Avant tout démarrage**\n1. Vérifier le niveau d''eau dans le réservoir (mini 60 %).\n2. Contrôler la pression de gaz d''alimentation (min 30 mbar).\n3. Inspecter visuellement les soupapes de sécurité — absence de corrosion.\n\n**Séquence de démarrage**\n4. Ouvrir la vanne gaz, mettre en service la pompe d''alimentation.\n5. Sélectionner le mode "Automatique" sur l''armoire.\n6. Attendre la montée en pression progressive (~25 min jusqu''à 8 bar).\n7. Contrôler le manomètre toutes les 5 min pendant la montée.\n\n**⚠ Sécurité**\n- Ne JAMAIS ouvrir le regard de visite sous pression.\n- En cas de fuite, fermer la vanne gaz et appeler le responsable maintenance.',
 'Utilités','sécurité','chaudière,vapeur,CHD-001,démarrage,LOTO'),
('kb-003',
 'Étalonnage sonde de température PT100 — 5 points',
 E'**Matériel requis :** bain thermostaté + thermomètre étalon ± 0,1 °C.\n\n1. Points de référence : 0 °C, 25 °C, 50 °C, 80 °C, 120 °C.\n2. Plonger la sonde et le thermomètre étalon dans le bain pour chaque palier.\n3. Attendre la stabilisation 5 min, relever T_sonde et T_étalon.\n4. Calculer l''écart à chaque palier — tolérance ± 0,3 °C.\n5. Si dépassement → ajuster l''offset dans l''API ou remplacer la sonde.\n6. Enregistrer dans le registre d''étalonnage avec n° de certificat.',
 'Production','étalonnage','PT100,température,métrologie,HACCP'),
('kb-004',
 'Nettoyage CIP cuve de mélange MEL-001',
 E'**Cycle CIP standard (Cleaning In Place)**\n1. Rinçage initial à l''eau claire 5 min — récupérer en bac de purge.\n2. Soude caustique (NaOH 2 %) à 75 °C — circulation 20 min.\n3. Rinçage intermédiaire à l''eau adoucie 8 min.\n4. Acide nitrique (HNO₃ 1 %) à 65 °C — circulation 15 min.\n5. Rinçage final à l''eau adoucie jusqu''à pH neutre (test pH-mètre).\n6. Désinfection finale à l''eau chaude > 85 °C, 10 min.\n\n**Contrôle qualité :** prélèvement final pour analyse microbiologique.',
 'Production','procédure','CIP,nettoyage,MEL-001,HACCP,soude'),
('kb-005',
 'Dépannage remplisseuse — sous-remplissage',
 E'**Symptôme :** bouteilles sortant avec moins de volume que requis.\n\n**Causes probables et vérifications**\n1. Pression d''air insuffisante (vérifier manomètre > 6 bar).\n2. Buses encrassées → démonter et nettoyer à l''eau chaude.\n3. Capteur de niveau de cuve tampon défectueux → tester continuité.\n4. Débitmètre déréglé → recalibrer via le menu service.\n5. Joints de buses usés → remplacer en kit complet (REM-001 Kit-J).\n\n**Action immédiate :** mettre la ligne en mode "réglage", isoler 5 bouteilles, mesurer, ajuster.',
 'Remplissage','dépannage','REM-001,remplisseuse,sous-remplissage,buse'),
('kb-006',
 'Remplacement courroie HTD — alignement',
 E'**Procédure**\n1. Couper l''alimentation, consigner (LOTO).\n2. Relâcher la tension via le tendeur excentrique.\n3. Retirer l''ancienne courroie — repérer les dents endommagées.\n4. Inspecter les poulies (usure, ébavurage).\n5. Monter la nouvelle courroie HTD 5M, longueur identique.\n6. Mettre en tension : flèche 8 mm sous 5 kg au centre du brin libre.\n7. Vérifier l''alignement à la règle laser ou règle plate.\n8. Test rotation manuelle complète, puis essai à vide 5 min.',
 'Production','procédure','courroie,HTD,alignement,transmission'),
('kb-007',
 'Lubrification NSF H1 — points et fréquences',
 E'**Pourquoi NSF H1 :** graisse alimentaire autorisée en contact occasionnel avec le produit.\n\n**Plan de graissage L.C PROD**\n- Buses de remplissage REM-001 → toutes les 100 h ou avant chaque CIP.\n- Roulements convoyeur CNV-001 → toutes les 250 h.\n- Cardans bouchonneuse BOU-001 → toutes les 200 h.\n- Réducteur palettiseur PAL-001 → mensuel.\n\n**Bonnes pratiques :** essuyer l''ancien excédent, n''utiliser qu''une seule marque, tenir un carnet de graissage.',
 null,'sécurité','NSF,graisse,lubrification,alimentaire'),
('kb-008',
 'Verrouillage / consignation LOTO — électrique',
 E'**Avant toute intervention électrique sur une machine**\n1. Identifier la source d''énergie (disjoncteur, sectionneur).\n2. Mettre la machine à l''arrêt par l''ordre normal de coupure.\n3. Ouvrir le sectionneur et le verrouiller avec son cadenas personnel.\n4. Apposer l''étiquette "Hors service — ne pas manœuvrer" avec date + nom.\n5. Vérifier l''absence de tension avec un multimètre/VAT certifié.\n6. Décharger les condensateurs si présents.\n\n**Après intervention :** ordre inverse + essai à vide avant remise en production.',
 null,'sécurité','LOTO,sécurité,électrique,consignation'),
('kb-009',
 'Test étanchéité circuit air comprimé',
 E'**Méthode rapide**\n1. Isoler le tronçon à tester (vannes amont + aval fermées).\n2. Mettre sous pression à la valeur de service (7 bar).\n3. Couper l''alimentation et noter la pression.\n4. Attendre 30 min sans utilisation.\n5. Tolérance : chute max 0,3 bar / 30 min sur la zone testée.\n\n**Si chute > 0,3 bar :** localiser la fuite à l''ultrasons ou à l''eau savonneuse sur les raccords.',
 'Utilités','dépannage','air comprimé,étanchéité,fuite,CMP-001'),
('kb-010',
 'Inspection visuelle bouchonneuse BOU-001',
 E'**Check-list hebdomadaire**\n- Mandrin de bouchonnage : usure, propreté.\n- Couple de serrage : test sur 10 bouchons, écart ± 0,5 Nm acceptable.\n- Capteur de présence bouchon : LED verte allumée à vide.\n- Galets d''entraînement : ni glissement ni casse.\n- Niveau de bouchons en trémie : > 50 %.\n- Sortie : pas de bouchons mal vissés (rejet 0 %).\n\n**Action :** si couple hors plage, recalibrer via tableau de bord opérateur.',
 'Conditionnement','procédure','BOU-001,bouchon,inspection,hebdomadaire')
on conflict (id) do nothing;

-- ── 3. Daily-shift checklist template ────────────────────────
insert into checklist_templates (id, "machineId", title, items) values
('clt-daily-shift', null,
  'Démarrage de poste — sécurité & HACCP',
  '["EPI : casque, gants, chaussures S3, lunettes en zone produit","Inspection visuelle des zones de circulation — pas d''obstacles","Vérifier l''absence de fuite huile / eau au sol","Contrôler la propreté CIP des zones contact produit","Vérifier la disponibilité des EPI consommables (gants jetables, masques)","Lampe d''inspection chargée, multimètre et outils requis disponibles","Lire le carnet de quart précédent pour anomalies signalées","Vérifier la présence de l''extincteur et de la trousse de secours"]'::jsonb)
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'knowledge_articles' as t, count(*) from knowledge_articles
union all select 'daily-shift template', count(*) from checklist_templates where id='clt-daily-shift';
