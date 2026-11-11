# Cabix.io — Facturation, essai 30 jours et codes d'accès

## Modèle retenu

**Le cabinet paie, pas l'installé.** Un seul abonnement par cabinet, par palier de
membres. Tous les associés, salariés et secrétaires du cabinet sont inclus —
c'est ce qui garantit que toute l'équipe rejoint la plateforme.

| Palier | Membres | Mensuel | Annuel |
|---|---|---|---|
| Solo | 1–2 | 4,90 € | 39 € |
| Cabinet | 3–6 | 14,90 € | 119 € |
| Groupe | 7–15 | 29,90 € | 239 € |
| Structure | 16–50 | 59,90 € | 479 € |

- **Essai gratuit de 30 jours** créé automatiquement à la création du cabinet
  (trigger SQL `trg_cabinet_trial`).
- À l'expiration de l'essai sans abonnement : `cabix_cabinet_access` renvoie
  `access=false` et l'application redirige vers `paiement.html` (porte
  `cabixBillingGate()` dans `app.v5.js`, fail-open en cas d'erreur).
- **Codes d'accès** : `promo_codes` (types `full_access` = accès gratuit,
  `months_free` = mois offerts, `percent_off` = réduction), 1 utilisation par
  cabinet et par code, quota global optionnel (`max_uses`).

## Fichiers

- `supabase-abonnement.sql` — tables `cabinet_subscriptions`, `promo_codes`,
  `promo_redemptions`, `payment_events`, triggers et fonctions
  `cabix_cabinet_access` / `cabix_activate_promo`.
- `paiement.html` — page d'abonnement (statut d'essai avec décompte, paliers,
  code promo, redirection Stripe Checkout).
- `api/create-checkout.js` — crée la session Stripe Checkout (vérifie que
  l'appelant est membre du cabinet ; gère les codes promo).
- `api/stripe-webhook.js` — active / renouvelle / clôt l'abonnement
  (signature Stripe vérifiée, idempotent via `payment_events`).
- `landing.html` — section Tarifs (paliers, essai 30 jours).

## Mise en production

1. **Supabase** : exécuter `supabase-abonnement.sql` dans l'éditeur SQL.
2. **Stripe** : récupérer la clé secrète (Dashboard → Developers → API keys) et
   créer un endpoint webhook (Developers → Webhooks → Add endpoint) pointant
   vers `https://<votre-domaine>/api/stripe-webhook` avec les événements :
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`.
3. **Variables d'environnement Vercel** :
   - `STRIPE_SECRET_KEY` — clé secrète Stripe
   - `STRIPE_WEBHOOK_SECRET` — secret du endpoint webhook (`whsec_…`)
   - `SUPABASE_SERVICE_ROLE_KEY` — clé service Supabase (jamais côté client)
   - `SUPABASE_URL` — défaut : le projet actuel
   - `SITE_URL` — défaut : `https://cabix.io`
4. **Codes gratuits** : insérer dans Supabase, ex. :
   ```sql
   INSERT INTO promo_codes (code, label, type, value, max_uses)
   VALUES ('CABIX-PARTENAIRE', 'Accès offert réseau', 'full_access', NULL, 100);
   ```
   `value = NULL` → gratuité illimitée ; `value = 6` → 6 mois offerts.

## Notes de conception

- Le webhook écrit avec la clé service (RLS ignorée) : aucune politique
  d'écriture client sur `cabinet_subscriptions` — impossible de s'activer
  soi-même depuis le navigateur.
- `payment_events.stripe_event_id` est `UNIQUE` : un événement rejoué par
  Stripe est ignoré (idempotence).
- L'annuel est privilégié (~ -33 %) : à 1,99 €/mois par installé, les frais
  Stripe (1,5 % + 0,25 €) mangeraient ~14 % du revenu ; sur 119 €/an, ~1,7 %.
- Les cabinets créés avant le déploiement (sans ligne d'abonnement) restent
  accessibles (`reason = 'no_subscription'`) — la migration ne verrouille
  personne rétroactivement.
