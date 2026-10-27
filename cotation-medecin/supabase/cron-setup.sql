-- ============================================================
-- AUTOMATISATION PDF & EMAIL - CONFIGURATION CRON
-- ============================================================
-- Génère le PDF des cotations du mois précédent et l'envoie par email
-- le 1er de chaque mois:
--   - 1h00: generate-monthly-pdf (PDF du mois précédent, par médecin)
--   - 3h00: send-monthly-email (envoi à la comptabilité + copie au médecin)
--
-- Le PDF est bien "par médecin": chaque feuille est générée depuis les
-- passages filtrés par user_id, et chaque médecin ne reçoit que la sienne.

-- ============================================================
-- ÉTAPE 1: Activer les extensions (si pas déjà fait)
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- ÉTAPE 2: Configurer les secrets
-- Dashboard Supabase > Settings > Edge Functions > SECRETS:
-- ============================================================
-- RESEND_API_KEY     = votre clé API Resend (resend.com)
-- ACCOUNTING_EMAIL   = email de la comptabilité (destinataire principal)

-- ============================================================
-- ÉTAPE 3: Planifier les tâches (décommentez les deux blocs)
-- ============================================================

-- Tâche 1: Génération des PDFs à 1h00 le 1er de chaque mois
-- SELECT cron.schedule(
--   'generate-monthly-pdf',
--   '0 1 1 * *',
--   $$
--   SELECT net.http_post(
--     url:='https://VOTRE-PROJET.supabase.co/functions/v1/generate-monthly-pdf',
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
--   );
--   $$
-- );

-- Tâche 2: Envoi des emails à 3h00 le 1er de chaque mois
-- SELECT cron.schedule(
--   'send-monthly-email',
--   '0 3 1 * *',
--   $$
--   SELECT net.http_post(
--     url:='https://VOTRE-PROJET.supabase.co/functions/v1/send-monthly-email',
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
--   );
--   $$
-- );

-- ============================================================
-- VÉRIFICATION: tâches planifiées et dernières exécutions
-- ============================================================
-- SELECT * FROM cron.job;
-- SELECT jobid, status, return_message, start_time
-- FROM cron.job_run ORDER BY start_time DESC LIMIT 10;

-- ============================================================
-- TEST MANUEL (à tout moment)
-- ============================================================
-- Via SQL:
-- SELECT net.http_post(
--   url:='https://VOTRE-PROJET.supabase.co/functions/v1/generate-monthly-pdf',
--   headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
-- );
-- SELECT net.http_post(
--   url:='https://VOTRE-PROJET.supabase.co/functions/v1/send-monthly-email',
--   headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
-- );

-- ============================================================
-- DÉSACTIVER
-- ============================================================
-- SELECT cron.unschedule('generate-monthly-pdf');
-- SELECT cron.unschedule('send-monthly-email');
