-- Apprentissage partagé des catégorisations de relevés bancaires
-- Chaque ligne associe un libellé normalisé à une catégorie choisie par un utilisateur.
-- Le poids augmente à chaque confirmation; tous les cabinets en bénéficient.

CREATE TABLE IF NOT EXISTS releve_learning (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle_norm TEXT NOT NULL,
    category TEXT NOT NULL,
    is_depense BOOLEAN NOT NULL DEFAULT false,
    weight INT NOT NULL DEFAULT 1,
    cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (libelle_norm, category, is_depense)
);

ALTER TABLE releve_learning ENABLE ROW LEVEL SECURITY;

-- Lecture partagée : tous les cabinets profitent de l'apprentissage
DROP POLICY IF EXISTS "Lecture partagee releve_learning" ON releve_learning;
CREATE POLICY "Lecture partagee releve_learning" ON releve_learning
    FOR SELECT USING (true);

-- Écriture : utilisateurs connectés uniquement
DROP POLICY IF EXISTS "Insert pour utilisateurs connectes" ON releve_learning;
CREATE POLICY "Insert pour utilisateurs connectes" ON releve_learning
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Update par createur" ON releve_learning;
CREATE POLICY "Update par createur" ON releve_learning
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Index de recherche
CREATE INDEX IF NOT EXISTS idx_releve_learning_libelle ON releve_learning (libelle_norm);

-- Fonction d'apprentissage : upsert + incrément du poids
CREATE OR REPLACE FUNCTION learn_releve_categorisation(p_rows releve_learning[])
RETURNS VOID AS $$
BEGIN
    FOR i IN 1..array_length(p_rows, 1) LOOP
        INSERT INTO releve_learning (libelle_norm, category, is_depense, weight, cabinet_id, user_id)
        VALUES (p_rows[i].libelle_norm, p_rows[i].category, p_rows[i].is_depense, 1, p_rows[i].cabinet_id, p_rows[i].user_id)
        ON CONFLICT (libelle_norm, category, is_depense)
        DO UPDATE SET weight = releve_learning.weight + 1, updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_releve_weights(p_rows releve_learning[])
RETURNS VOID AS $$
BEGIN
    FOR i IN 1..array_length(p_rows, 1) LOOP
        UPDATE releve_learning
        SET weight = weight + 1, updated_at = NOW()
        WHERE libelle_norm = p_rows[i].libelle_norm
          AND category = p_rows[i].category
          AND is_depense = p_rows[i].is_depense;
        IF NOT FOUND THEN
            INSERT INTO releve_learning (libelle_norm, category, is_depense, weight, cabinet_id, user_id)
            VALUES (p_rows[i].libelle_norm, p_rows[i].category, p_rows[i].is_depense, 1, p_rows[i].cabinet_id, p_rows[i].user_id);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
