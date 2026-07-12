-- ============================================================
-- Add a CallMeBot API key field to alert_subscriptions so each
-- recipient can activate WhatsApp on their own line without any
-- server-side config.
--
-- CallMeBot is a free WhatsApp relay :
--   1. Le destinataire ajoute +34 644 66 33 06 dans ses contacts.
--   2. Il envoie « I allow callmebot to send me messages » à ce
--      contact via WhatsApp.
--   3. Il reçoit sa clé (7 chiffres) et la colle dans le champ
--      « Clé WhatsApp » de son abonnement.
-- Aucun compte Meta, aucun token Vercel — ça marche instantanément.
-- ============================================================

alter table if exists alert_subscriptions
    add column if not exists callmebot_apikey text default null;
