-- ============================================================
-- SmartMaint — L.C PROD  ·  Outillage de maintenance
-- ------------------------------------------------------------
-- A shared inventory of the maintenance team's tools. Each tool
-- knows where it is stored and whether it is currently checked
-- out by a technician — so a tech can verify availability before
-- starting an intervention instead of walking to the shop.
--
-- Idempotent — safe to re-run in the Supabase SQL Editor.
-- ============================================================

create table if not exists tools (
  id              text primary key,
  name            text not null,
  category        text default 'mécanique',  -- mécanique | électrique | mesure | sécurité
  location        text default 'Atelier maintenance',
  status          text default 'disponible', -- disponible | utilisé | en maintenance
  "assignedTo"    text,                       -- free-text technician name (no FK)
  "lastCheckoutAt" timestamptz,
  notes           text default '',
  "createdAt"     timestamptz default now()
);

-- ── Realtime + RLS + grants ──────────────────────────────────
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table tools';
  exception when duplicate_object then null;
  end;
  execute 'alter table tools enable row level security';
  execute 'grant select, insert, update, delete on public.tools to authenticated';
  execute 'drop policy if exists "auth read"   on tools';
  execute 'drop policy if exists "auth insert" on tools';
  execute 'drop policy if exists "auth update" on tools';
  execute 'drop policy if exists "auth delete" on tools';
  execute 'create policy "auth read"   on tools for select to authenticated using (true)';
  execute 'create policy "auth insert" on tools for insert to authenticated with check (true)';
  execute 'create policy "auth update" on tools for update to authenticated using (true) with check (true)';
  execute 'create policy "auth delete" on tools for delete to authenticated using (true)';
end $$;

-- ── Seed — typical L.C PROD maintenance toolkit ──────────────
insert into tools (id, name, category, location, status, "assignedTo", "lastCheckoutAt", notes) values
('tool-001','Caisse à outils mécanicien','mécanique','Atelier maintenance','disponible',null,null,'Jeu complet : clés mixtes, douilles, tournevis, marteau'),
('tool-002','Caisse à outils électricien','électrique','Atelier maintenance','disponible',null,null,'Pinces, tournevis isolés 1000 V, dénude-fils'),
('tool-003','Clé dynamométrique 10-100 Nm','mécanique','Atelier maintenance','utilisé','Ahmed El Amrani',(now() - interval '2 hours'),'Étalonnée le mois dernier — précision ±3 %'),
('tool-004','Multimètre Fluke 117','électrique','Atelier maintenance','disponible',null,null,'TRMS, catégorie CAT III 600 V'),
('tool-005','Pistolet thermique IR FLIR TG56','mesure','Atelier maintenance','disponible',null,null,'Détection points chauds — moteurs et roulements'),
('tool-006','Manomètre vapeur 0-16 bar','mesure','Atelier maintenance','en maintenance',null,null,'Envoyé en métrologie — retour prévu le 28/05'),
('tool-007','Pompe à graisse NSF H1','sécurité','Magasin alimentaire','disponible',null,null,'Graisse de qualité alimentaire pour zones produit'),
('tool-008','Pince à sertir cosses faston','électrique','Atelier maintenance','disponible',null,null,''),
('tool-009','Endoscope industriel','mesure','Bureau maintenance','utilisé','Hicham Tazi',(now() - interval '1 day'),'Inspection interne tuyauteries et cuves'),
('tool-010','EPI complet (casque + gants + chaussures S3)','sécurité','Vestiaires','disponible',null,null,'1 jeu par technicien — récupérer aux vestiaires'),
('tool-011','Détecteur de fuite ultrasonique','mesure','Atelier maintenance','disponible',null,null,'Pour fuites air comprimé et vapeur'),
('tool-012','Lampe d''inspection LED rechargeable','mesure','Atelier maintenance','disponible',null,null,'Magnétique, autonomie 8 h'),
('tool-013','Pompe à vide manuelle','mécanique','Atelier maintenance','disponible',null,null,'Pour test étanchéité circuits'),
('tool-014','Tachymètre laser','mesure','Atelier maintenance','disponible',null,null,'Mesure vitesse rotation moteurs (rpm)')
on conflict (id) do nothing;

-- ── Verify ────────────────────────────────────────────────────
select 'tools' as t, count(*) from tools;
