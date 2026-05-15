-- Tables pour la gestion des remplaçants et contrats

-- Table des remplaçants
CREATE TABLE IF NOT EXISTS remplacants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    date_naissance DATE,
    rpps TEXT,
    specialite TEXT,
    notes TEXT,
    disponible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des contrats de remplacement
CREATE TABLE IF NOT EXISTS contrats_remplacement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    remplacant_id UUID REFERENCES remplacants(id),
    titre TEXT NOT NULL,
    date_debut DATE NOT NULL,
    date_fin DATE,
    periode_essai DATE,
    tarif_journalier NUMERIC(10,2),
    conditions TEXT,
    statut TEXT DEFAULT 'brouillon',
    signataire_nom TEXT,
    signataire_date DATE,
    signataire_token TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des disponibilités
CREATE TABLE IF NOT EXISTS disponibilites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remplacant_id UUID REFERENCES remplacants(id),
    user_id UUID REFERENCES auth.users(id),
    date DATE NOT NULL,
    periode TEXT,
    disponible BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE remplacants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrats_remplacement ENABLE ROW LEVEL SECURITY;
ALTER TABLE disponibilites ENABLE ROW LEVEL SECURITY;

-- Policies pour remplacants
DROP POLICY IF EXISTS "Users can view own remplacants" ON remplacants;
DROP POLICY IF EXISTS "Users can insert own remplacants" ON remplacants;
DROP POLICY IF EXISTS "Users can update own remplacants" ON remplacants;
DROP POLICY IF EXISTS "Users can delete own remplacants" ON remplacants;

CREATE POLICY "Users can view own remplacants" ON remplacants
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own remplacants" ON remplacants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own remplacants" ON remplacants
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own remplacants" ON remplacants
    FOR DELETE USING (auth.uid() = user_id);

-- Policies pour contrats
DROP POLICY IF EXISTS "Users can view own contrats" ON contrats_remplacement;
DROP POLICY IF EXISTS "Users can insert own contrats" ON contrats_remplacement;
DROP POLICY IF EXISTS "Users can update own contrats" ON contrats_remplacement;
DROP POLICY IF EXISTS "Users can delete own contrats" ON contrats_remplacement;

CREATE POLICY "Users can view own contrats" ON contrats_remplacement
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contrats" ON contrats_remplacement
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contrats" ON contrats_remplacement
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contrats" ON contrats_remplacement
    FOR DELETE USING (auth.uid() = user_id);

-- Policies pour disponibilites
DROP POLICY IF EXISTS "Users can view own disponibilites" ON disponibilites;
DROP POLICY IF EXISTS "Users can insert own disponibilites" ON disponibilites;
DROP POLICY IF EXISTS "Users can update own disponibilites" ON disponibilites;
DROP POLICY IF EXISTS "Users can delete own disponibilites" ON disponibilites;

CREATE POLICY "Users can view own disponibilites" ON disponibilites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own disponibilites" ON disponibilites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own disponibilites" ON disponibilites
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own disponibilites" ON disponibilites
    FOR DELETE USING (auth.uid() = user_id);