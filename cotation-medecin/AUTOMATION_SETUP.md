# Configuration de l'automatisation PDF et Email

## Résumé

Chaque 1er du mois, automatiquement :
1. **1h00** — `generate-monthly-pdf` génère la feuille d'honoraires du **mois précédent** (ex. le 1er novembre → mois d'octobre), **un PDF par médecin** (passages filtrés par `user_id`, enregistré dans `comptabilite`)
2. **3h00** — `send-monthly-email` envoie chaque PDF :
   - à **l'adresse de comptabilité** (`ACCOUNTING_EMAIL`)
   - en **copie au médecin** sur l'email de son compte (celui enregistré à l'inscription, table `profiles`)

Chaque médecin ne reçoit que **sa** feuille — jamais celle d'un autre (isolation par `user_id`).

## Prérequis

1. **Compte Resend** (gratuit, 100 emails/mois) — https://resend.com → récupérer l'API Key
2. **L'email de la comptabilité** (destinataire principal)

## Installation

### 1. Déployer les Edge Functions

```bash
supabase login
supabase functions deploy generate-monthly-pdf
supabase functions deploy send-monthly-email
```

### 2. Configurer les secrets

Dashboard Supabase → **Settings > Edge Functions > SECRETS** :
- `RESEND_API_KEY` = votre clé API Resend
- `ACCOUNTING_EMAIL` = email de la comptabilité

### 3. Activer les tâches cron

Exécuter `supabase/cron-setup.sql` dans le SQL Editor (les blocs sont commentés : remplacer l'URL du projet et la `SERVICE_ROLE_KEY`, puis décommenter les deux `SELECT cron.schedule(...)`).

> ⚠️ L'en-tête `Authorization: Bearer <service_role_key>` est **obligatoire** : sans lui les fonctions rejettent l'appel (401). Ne jamais exposer cette clé côté client.

## Test manuel

```sql
SELECT net.http_post(
  url:='https://VOTRE-PROJET.supabase.co/functions/v1/generate-monthly-pdf',
  headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
);
-- puis
SELECT net.http_post(
  url:='https://VOTRE-PROJET.supabase.co/functions/v1/send-monthly-email',
  headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb
);
```

## Format du PDF

3 pages :
- **Page 1** : Résumé Médecin/SSR (par acte)
- **Page 2** : Résumé EHPAD (par lieu et par acte)
- **Page 3** : Liste complète des patients vus dans le mois

## Dépannage

- **Fonctions non exécutées** : vérifier les secrets, et les logs dans Dashboard Supabase > Functions > Logs
- **Emails non reçus** : vérifier la clé Resend, le dossier spam ; Resend utilise `onboarding@resend.dev` par défaut (domaine de test — pour la production, configurer un domaine vérifié dans Resend)
- **Erreur 401 au cron** : l'en-tête `Authorization` avec la service_role_key est manquant
- **Vérifier les exécutions** : `SELECT * FROM cron.job_run ORDER BY start_time DESC LIMIT 10;`
