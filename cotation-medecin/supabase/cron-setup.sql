-- ============================================================
-- AUTOMATISATION PDF & EMAIL - CONFIGURATION CRON
-- ============================================================

-- Cette configuration crée des tâches automatiques qui s'exécutent:
-- - generate-monthly-pdf: 1er du mois à 1h00
-- - send-monthly-email: 1er du mois à 3h00

-- Pour activer, exécuter ce script dans le SQL Editor de Supabase
-- OU utiliser l'interface pg_cron

-- ============================================================
-- ÉTAPE 1: Activer l'extension pg_cron (si pas encore fait)
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- ÉTAPE 2: Configurer les variables d'environnement
-- ============================================================
-- Aller dans Settings > Edge Functions > SECRETS et ajouter:
-- - RESEND_API_KEY: votre clé API Resend (obtenue sur resend.com)
-- - ACCOUNTING_EMAIL: email de la comptabilité de l'hôpital

-- ============================================================
-- ÉTAPE 3: Planifier les tâches (décommentez pour activer)
-- ============================================================

-- Tâche 1: Génération du PDF à 1h00 le 1er de chaque mois
-- SELECT cron.schedule(
--   'generate-monthly-pdf',
--   '0 1 1 * *',
--   $$
--   SELECT net.http_post(
--     url:=(SELECT supabase_url() || '/functions/v1/generate-monthly-pdf'),
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
--   );
--   $$
-- );

-- Tâche 2: Envoi des emails à 3h00 le 1er de chaque mois
-- SELECT cron.schedule(
--   'send-monthly-email',
--   '0 3 1 * *',
--   $$
--   SELECT net.http_post(
--     url:=(SELECT supabase_url() || '/functions/v1/send-monthly-email'),
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
--   );
--   $$
-- );

-- ============================================================
-- VÉRIFICATION: Voir les tâches planifiées
-- ============================================================
-- SELECT * FROM cron.job;

-- ============================================================
-- TEST: Exécuter manuellement les fonctions
-- ============================================================
-- Pour tester, faire un POST vers:
-- https://[votre-projet].supabase.co/functions/v1/generate-monthly-pdf
-- https://[votre-projet].supabase.co/functions/v1/send-monthly-email

-- ============================================================
-- DÉSACTIVER les tâches (si besoin)
-- ============================================================
-- SELECT cron.unschedule('generate-monthly-pdf');
-- SELECT cron.unschedule('send-monthly-email');