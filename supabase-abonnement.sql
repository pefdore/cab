-- ============================================================
-- Cabix.io — Abonnements cabinet (paliers), essai 30 jours,
-- codes d'accès gratuit et journal des paiements Stripe.
--
-- Modèle : le CABINET paie (pas l'installé). Tous les membres
-- d'un cabinet actif ont accès. 4 paliers par nombre de membres.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Abonnement d'un cabinet (1 ligne par cabinet)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cabinet_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID NOT NULL UNIQUE REFERENCES cabinets(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'solo'
        CHECK (plan IN ('solo','cabinet','groupe','structure')),
    billing_interval TEXT NOT NULL DEFAULT 'yearly'
        CHECK (billing_interval IN ('monthly','yearly')),
    -- trial | trial_expired | active | past_due | canceled | free
    status TEXT NOT NULL DEFAULT 'trial'
        CHECK (status IN ('trial','trial_expired','active','past_due','canceled','free')),
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    current_period_end TIMESTAMPTZ,
    free_until TIMESTAMPTZ,              -- NULL = accès gratuit permanent
    promo_code_id UUID,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2) Codes d'accès gratuit / réduction
--   type = 'full_access'  : accès gratuit (value = durée en mois, NULL = illimité)
--   type = 'percent_off'  : réduction en % sur le paiement
--   type = 'months_free'  : mois offerts après paiement
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    label TEXT,
    type TEXT NOT NULL CHECK (type IN ('full_access','percent_off','months_free')),
    value NUMERIC(10,2),                 -- mois (full_access/months_free) ou % (percent_off)
    max_uses INTEGER,                    -- NULL = illimité
    times_used INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Utilisation d'un code par cabinet (1 seule fois par cabinet et par code)
CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    cabinet_id UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
    redeemed_by UUID NOT NULL REFERENCES auth.users(id),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (promo_code_id, cabinet_id)
);

-- ------------------------------------------------------------
-- 3) Journal des événements de paiement (webhook Stripe)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT UNIQUE,
    event_type TEXT NOT NULL,
    cabinet_id UUID,
    payload JSONB,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4) Essai 30 jours automatique à la création d'un cabinet
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_cabinet_trial()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cabinet_subscriptions (cabinet_id)
    VALUES (NEW.id)
    ON CONFLICT (cabinet_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cabinet_trial ON cabinets;
CREATE TRIGGER trg_cabinet_trial
    AFTER INSERT ON cabinets
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_cabinet_trial();

-- ------------------------------------------------------------
-- 5) Décompte d'un code promo (incrément à chaque utilisation)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_promo_redemption()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE promo_codes
       SET times_used = times_used + 1
     WHERE id = NEW.promo_code_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_promo_redemption ON promo_redemptions;
CREATE TRIGGER trg_promo_redemption
    AFTER INSERT ON promo_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION handle_promo_redemption();

-- ------------------------------------------------------------
-- 6) Fonction d'accès : le cabinet a-t-il le droit d'utiler
--    la plateforme ? (essai en cours, abonnement actif ou gratuit)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cabix_cabinet_access(p_cabinet_id UUID)
RETURNS JSONB AS $$
DECLARE
    sub cabinet_subscriptions%ROWTYPE;
    days_left INTEGER;
BEGIN
    SELECT * INTO sub FROM cabinet_subscriptions
     WHERE cabinet_id = p_cabinet_id FOR UPDATE;

    -- Cabinet inconnu (antérieur au déploiement) : accès laissé ouvert
    IF NOT FOUND THEN
        RETURN jsonb_build_object('access', true, 'reason', 'no_subscription', 'status', null);
    END IF;

    -- Accès gratuit (code promo full_access) : prioritaire sur tout
    IF sub.status = 'free' THEN
        IF sub.free_until IS NULL OR sub.free_until > NOW() THEN
            RETURN jsonb_build_object('access', true, 'reason', 'free', 'status', 'free',
                                      'free_until', sub.free_until);
        ELSE
            UPDATE cabinet_subscriptions
               SET status = 'trial_expired', updated_at = NOW()
             WHERE id = sub.id;
            RETURN jsonb_build_object('access', false, 'reason', 'free_expired', 'status', 'trial_expired');
        END IF;
    END IF;

    -- Abonnement payant actif
    IF sub.status = 'active' THEN
        IF sub.current_period_end IS NULL OR sub.current_period_end > NOW() THEN
            RETURN jsonb_build_object('access', true, 'reason', 'active', 'status', 'active',
                                      'plan', sub.plan,
                                      'current_period_end', sub.current_period_end);
        ELSE
            UPDATE cabinet_subscriptions
               SET status = 'past_due', updated_at = NOW()
             WHERE id = sub.id;
            RETURN jsonb_build_object('access', false, 'reason', 'payment_required', 'status', 'past_due');
        END IF;
    END IF;

    -- Période d'essai
    IF sub.status = 'trial' THEN
        IF sub.trial_ends_at > NOW() THEN
            days_left := GREATEST(CEIL(EXTRACT(EPOCH FROM (sub.trial_ends_at - NOW())) / 86400)::INTEGER, 0);
            RETURN jsonb_build_object('access', true, 'reason', 'trial', 'status', 'trial',
                                      'trial_days_left', days_left,
                                      'trial_ends_at', sub.trial_ends_at);
        ELSE
            UPDATE cabinet_subscriptions
               SET status = 'trial_expired', updated_at = NOW()
             WHERE id = sub.id;
            RETURN jsonb_build_object('access', false, 'reason', 'trial_expired', 'status', 'trial_expired');
        END IF;
    END IF;

    -- trial_expired / past_due / canceled : paiement requis
    RETURN jsonb_build_object('access', false, 'reason', 'payment_required', 'status', sub.status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 7) RLS
-- ------------------------------------------------------------
ALTER TABLE cabinet_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Abonnement : lisible par les membres du cabinet (via profiles.cabinet_id)
DROP POLICY IF EXISTS "Members can view cabinet subscription" ON cabinet_subscriptions;
CREATE POLICY "Members can view cabinet subscription" ON cabinet_subscriptions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.cabinet_id = cabinet_id)
    );

-- Codes promo : tous les utilisateurs connectés peuvent les consulter
-- (la validité est vérifiée par la fonction cabix_redeem_promo / l'API)
DROP POLICY IF EXISTS "Authenticated can view promo codes" ON promo_codes;
CREATE POLICY "Authenticated can view promo codes" ON promo_codes
    FOR SELECT TO authenticated USING (true);

-- Utilisation d'un code : uniquement par un membre, pour son propre cabinet,
-- code actif, non expiré et pas épuisé
DROP POLICY IF EXISTS "Members can redeem promo for own cabinet" ON promo_redemptions;
CREATE POLICY "Members can redeem promo for own cabinet" ON promo_redemptions
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles p
                 WHERE p.id = auth.uid() AND p.cabinet_id = cabinet_id)
        AND EXISTS (SELECT 1 FROM promo_codes c
                     WHERE c.id = promo_code_id
                       AND c.active = TRUE
                       AND (c.expires_at IS NULL OR c.expires_at > NOW())
                       AND (c.max_uses IS NULL OR c.times_used < c.max_uses))
    );

DROP POLICY IF EXISTS "Members can view own redemptions" ON promo_redemptions;
CREATE POLICY "Members can view own redemptions" ON promo_redemptions
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.cabinet_id = cabinet_id)
    );

-- Journal des paiements : lecture réservée au service (webhook), aucun accès client
-- (écriture uniquement via service_role, qui ignore la RLS)

-- ------------------------------------------------------------
-- 8) Validation et activation d'un code côté base
--    (appelée par l'API paiement pour les codes full_access)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cabix_activate_promo(p_cabinet_id UUID, p_code TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    pc promo_codes%ROWTYPE;
    already_used INTEGER;
    free_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO pc FROM promo_codes
     WHERE UPPER(code) = UPPER(TRIM(p_code)) AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR times_used < max_uses)
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'code_invalide');
    END IF;

    SELECT COUNT(*) INTO already_used
      FROM promo_redemptions
     WHERE promo_code_id = pc.id AND cabinet_id = p_cabinet_id;

    IF already_used > 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'code_deja_utilise');
    END IF;

    IF pc.type = 'full_access' THEN
        IF pc.value IS NULL THEN
            free_until := NULL;  -- illimité
        ELSE
            free_until := NOW() + (pc.value || ' months')::INTERVAL;
        END IF;
        UPDATE cabinet_subscriptions
           SET status = 'free',
               free_until = free_until,
               promo_code_id = pc.id,
               updated_at = NOW()
         WHERE cabinet_id = p_cabinet_id;
        INSERT INTO promo_redemptions (promo_code_id, cabinet_id, redeemed_by)
        VALUES (pc.id, p_cabinet_id, p_user_id);
        RETURN jsonb_build_object('ok', true, 'type', 'full_access', 'free_until', free_until);
    ELSIF pc.type = 'months_free' THEN
        -- mois offerts : prolonge l'essai / la période courante
        UPDATE cabinet_subscriptions
           SET trial_ends_at = GREATEST(trial_ends_at, NOW()) + (pc.value || ' months')::INTERVAL,
               promo_code_id = pc.id,
               updated_at = NOW()
         WHERE cabinet_id = p_cabinet_id;
        INSERT INTO promo_redemptions (promo_code_id, cabinet_id, redeemed_by)
        VALUES (pc.id, p_cabinet_id, p_user_id);
        RETURN jsonb_build_object('ok', true, 'type', 'months_free');
    ELSE
        -- percent_off : rien à activer en base, la réduction est appliquée
        -- au moment du Checkout Stripe (renvoyer le % pour l'affichage)
        RETURN jsonb_build_object('ok', true, 'type', 'percent_off', 'percent', pc.value);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exemple : créer un code d'accès gratuit illimité pour un partenaire
-- INSERT INTO promo_codes (code, label, type, value, max_uses)
-- VALUES ('CABIX-PARTENAIRE', 'Accès offert réseau', 'full_access', NULL, 100);
