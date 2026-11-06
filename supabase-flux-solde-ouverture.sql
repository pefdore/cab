-- Solde bancaire d'ouverture du cabinet : montant au 31 décembre de l'année
-- précédente, saisi une fois par an sur la page Flux. Sert de point de départ
-- pour calculer le solde bancaire de fin de chaque mois (vérification contre
-- le solde affiché sur les relevés bancaires).

CREATE TABLE IF NOT EXISTS cabinet_opening_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID REFERENCES cabinets(id),
    user_id UUID REFERENCES auth.users(id),
    annee INTEGER NOT NULL,
    montant NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cabinet_id, annee)
);

-- Helper: membres du cabinet
CREATE OR REPLACE FUNCTION flux_same_cabinet(target_cabinet_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.cabinet_id = target_cabinet_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE cabinet_opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cabinet members view opening balances" ON cabinet_opening_balances;
DROP POLICY IF EXISTS "Cabinet members insert opening balances" ON cabinet_opening_balances;
DROP POLICY IF EXISTS "Cabinet members update opening balances" ON cabinet_opening_balances;

CREATE POLICY "Cabinet members view opening balances" ON cabinet_opening_balances
    FOR SELECT USING (flux_same_cabinet(cabinet_id));

CREATE POLICY "Cabinet members insert opening balances" ON cabinet_opening_balances
    FOR INSERT WITH CHECK (flux_same_cabinet(cabinet_id));

CREATE POLICY "Cabinet members update opening balances" ON cabinet_opening_balances
    FOR UPDATE USING (flux_same_cabinet(cabinet_id));

-- Recharge le cache de schéma PostgREST (nécessaire après création de table)
NOTIFY pgrst, 'reload schema';
