-- Tables pour la gestion des offres de remplacement et candidatures

-- Table des offres de remplacement
CREATE TABLE IF NOT EXISTS offres_remplacement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    titre TEXT NOT NULL,
    description TEXT,
    date_debut DATE NOT NULL,
    date_fin DATE,
    lieu TEXT NOT NULL,
    adresse_cabinet TEXT,
    description_cabinet TEXT,
    description_activite TEXT,
    specialite TEXT,
    retrocession NUMERIC(5,2) DEFAULT 70,
    tarif_journalier NUMERIC(10,2),
    statut TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des candidatures
CREATE TABLE IF NOT EXISTS candidatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offre_id UUID REFERENCES offres_remplacement(id),
    remplacant_id UUID REFERENCES remplacants(id),
    message TEXT,
    statut TEXT DEFAULT 'en_attente',
    date_reponse DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table de l'historique des remplacements
CREATE TABLE IF NOT EXISTS historique_remplacements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    remplacant_id UUID REFERENCES remplacants(id),
    contrat_id UUID REFERENCES contrats_remplacement(id),
    date_debut DATE NOT NULL,
    date_fin DATE,
    retrocession NUMERIC(5,2),
    tarif_journalier NUMERIC(10,2),
    total_jour INTEGER,
    montant_total NUMERIC(10,2),
    notes TEXT,
    eval_note INTEGER,
    eval_commentaire TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE offres_remplacement ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE historique_remplacements ENABLE ROW LEVEL SECURITY;

-- Policies pour offres_remplacement
DROP POLICY IF EXISTS "Users can view own offres" ON offres_remplacement;
DROP POLICY IF EXISTS "Users can insert own offres" ON offres_remplacement;
DROP POLICY IF EXISTS "Users can update own offres" ON offres_remplacement;
DROP POLICY IF EXISTS "Users can delete own offres" ON offres_remplacement;

CREATE POLICY "Users can view own offres" ON offres_remplacement
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own offres" ON offres_remplacement
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own offres" ON offres_remplacement
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own offres" ON offres_remplacement
    FOR DELETE USING (auth.uid() = user_id);

-- Policies pour candidatures
DROP POLICY IF EXISTS "Users can view own candidatures" ON candidatures;
DROP POLICY IF EXISTS "Users can insert own candidatures" ON candidatures;
DROP POLICY IF EXISTS "Users can update own candidatures" ON candidatures;

CREATE POLICY "Users can view own candidatures" ON candidatures
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM offres_remplacement WHERE id = offre_id
        )
    );

CREATE POLICY "Users can insert own candidatures" ON candidatures
    FOR INSERT WITH CHECK (auth.uid() = auth.uid());

CREATE POLICY "Users can update own candidatures" ON candidatures
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM offres_remplacement WHERE id = offre_id
        )
    );

-- Policies pour historique_remplacements
DROP POLICY IF EXISTS "Users can view own historique" ON historique_remplacements;
DROP POLICY IF EXISTS "Users can insert own historique" ON historique_remplacements;
DROP POLICY IF EXISTS "Users can update own historique" ON historique_remplacements;

CREATE POLICY "Users can view own historique" ON historique_remplacements
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own historique" ON historique_remplacements
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own historique" ON historique_remplacements
    FOR UPDATE USING (auth.uid() = user_id);