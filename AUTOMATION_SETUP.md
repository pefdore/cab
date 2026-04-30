# Configuration de l'automatisation PDF et Email

## Résumé

Ce projet contient deux Edge Functions Supabase:
1. `generate-monthly-pdf` - Génère automatiquement le PDF des honoraires
2. `send-monthly-email` - Envoie le PDF par email

## Prérequis

1. **Compte Resend** (gratuit, 100 emails/mois)
   - Aller sur https://resend.com
   - Créer un compte et récupérer l'API Key

2. **Email de la comptabilité**
   - Récupérer l'email de la comptabilité de l'hôpital

## Installation

### 1. Déployer les Edge Functions

```bash
# Se connecter à Supabase CLI
supabase login

# Déployer les fonctions
supabase functions deploy generate-monthly-pdf
supabase functions deploy send-monthly-email
```

### 2. Configurer les secrets

Dans le dashboard Supabase:
- Aller dans **Settings** > **Edge Functions** > **SECRETS**
- Ajouter:
  - `RESEND_API_KEY` = votre clé API Resend
  - `ACCOUNTING_EMAIL` = email de la comptabilité

### 3. Activer les tâches cron

Exécuter le fichier `supabase/cron-setup.sql` dans le SQL Editor de Supabase, ou:

```sql
-- Activer la génération PDF à 1h00
SELECT cron.schedule(
  'generate-monthly-pdf',
  '0 1 1 * *',
  $$
  SELECT net.http_post(
    url:='https://votre-projet.supabase.co/functions/v1/generate-monthly-pdf',
    headers:='{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Activer l'envoi email à 3h00
SELECT cron.schedule(
  'send-monthly-email',
  '0 3 1 * *',
  $$
  SELECT net.http_post(
    url:='https://votre-projet.supabase.co/functions/v1/send-monthly-email',
    headers:='{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

## Test

Pour tester manuellement:

1. Générer le PDF:
```
POST https://[votre-projet].supabase.co/functions/v1/generate-monthly-pdf
```

2. Envoyer les emails:
```
POST https://[votre-projet].supabase.co/functions/v1/send-monthly-email
```

## Format du PDF

Le PDF généré contient 3 pages:
- **Page 1**: Résumé Médecin/SSR (par acte)
- **Page 2**: Résumé EHPAD (par lieu et par acte)
- **Page 3**: Liste complète des patients vus dans le mois

## Dépannage

### Les fonctions ne s'exécutent pas
- Vérifier que les secrets sont configurés
- Vérifier les logs dans Supabase Dashboard > Functions > Logs

### Les emails ne sont pas reçus
- Vérifier la clé Resend
- Vérifier le dossier spam
- Resend utilise "onboarding@resend.dev" par défaut, vérifier qu'il est autorisé

### Erreur de permissions
- S'assurer que le service_role_key est utilisé pour les opérations admin