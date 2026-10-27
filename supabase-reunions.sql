-- Réunions de cabinet : fixer une date, ordres du jour, votes, comptes rendus
-- Accessible à tous les associés du même cabinet (cabinet_id sur profiles)

-- Réunions (une réunion fixée, ODJ généré 24h avant, contenu du CR/ODJ)
CREATE TABLE IF NOT EXISTS reunions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID REFERENCES cabinets(id),
    user_id UUID REFERENCES auth.users(id),
    date_reunion DATE NOT NULL,
    heure_reunion TIME DEFAULT '18:00',
    statut TEXT DEFAULT 'fixee',
    odj_genere BOOLEAN DEFAULT FALSE,
    odj_contenu TEXT,
    cr_contenu TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Propositions de dates par les associés (pour se mettre d'accord)
CREATE TABLE IF NOT EXISTS reunion_date_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID REFERENCES cabinets(id),
    user_id UUID REFERENCES auth.users(id),
    date_proposee DATE NOT NULL,
    heure_proposee TIME DEFAULT '18:00',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sujets ajoutés à l'ordre du jour avant la réunion
CREATE TABLE IF NOT EXISTS reunion_sujets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reunion_id UUID REFERENCES reunions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    titre TEXT NOT NULL,
    probleme TEXT,
    proposition TEXT,
    analyse_ia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Votes sur les intitulés, le jour de la réunion
CREATE TABLE IF NOT EXISTS reunion_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sujet_id UUID REFERENCES reunion_sujets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    vote INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sujet_id, user_id)
);

-- Enable RLS
ALTER TABLE reunions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_date_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_sujets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_votes ENABLE ROW LEVEL SECURITY;

-- Helper: membres du cabinet
CREATE OR REPLACE FUNCTION reunion_same_cabinet(target_cabinet_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.cabinet_id = target_cabinet_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policies reunions : lecture par les membres du cabinet, écriture par les membres
DROP POLICY IF EXISTS "Cabinet members view reunions" ON reunions;
DROP POLICY IF EXISTS "Cabinet members insert reunions" ON reunions;
DROP POLICY IF EXISTS "Cabinet members update reunions" ON reunions;

CREATE POLICY "Cabinet members view reunions" ON reunions
    FOR SELECT USING (reunion_same_cabinet(cabinet_id));

CREATE POLICY "Cabinet members insert reunions" ON reunions
    FOR INSERT WITH CHECK (reunion_same_cabinet(cabinet_id));

CREATE POLICY "Cabinet members update reunions" ON reunions
    FOR UPDATE USING (reunion_same_cabinet(cabinet_id));

-- Policies reunion_date_proposals
DROP POLICY IF EXISTS "Cabinet members view date proposals" ON reunion_date_proposals;
DROP POLICY IF EXISTS "Members insert own date proposals" ON reunion_date_proposals;

CREATE POLICY "Cabinet members view date proposals" ON reunion_date_proposals
    FOR SELECT USING (reunion_same_cabinet(cabinet_id));

CREATE POLICY "Members insert own date proposals" ON reunion_date_proposals
    FOR INSERT WITH CHECK (auth.uid() = user_id AND reunion_same_cabinet(cabinet_id));

-- Policies reunion_sujets
DROP POLICY IF EXISTS "Cabinet members view sujets" ON reunion_sujets;
DROP POLICY IF EXISTS "Members insert own sujets" ON reunion_sujets;

CREATE POLICY "Cabinet members view sujets" ON reunion_sujets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reunions r
            WHERE r.id = reunion_id AND reunion_same_cabinet(r.cabinet_id)
        )
    );

CREATE POLICY "Members insert own sujets" ON reunion_sujets
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND EXISTS (
            SELECT 1 FROM reunions r
            WHERE r.id = reunion_id AND reunion_same_cabinet(r.cabinet_id)
        )
    );

-- Policies reunion_votes
DROP POLICY IF EXISTS "Cabinet members view votes" ON reunion_votes;
DROP POLICY IF EXISTS "Members manage own votes" ON reunion_votes;

CREATE POLICY "Cabinet members view votes" ON reunion_votes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reunion_sujets s
            JOIN reunions r ON r.id = s.reunion_id
            WHERE s.id = sujet_id AND reunion_same_cabinet(r.cabinet_id)
        )
    );

CREATE POLICY "Members manage own votes" ON reunion_votes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members update own votes" ON reunion_votes;
CREATE POLICY "Members update own votes" ON reunion_votes
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members delete own votes" ON reunion_votes;
CREATE POLICY "Members delete own votes" ON reunion_votes
    FOR DELETE USING (auth.uid() = user_id);

-- Migration v2 : votes sur les dates proposées + votes signés sur les sujets

-- Votes des associés sur les dates proposées (1 = pour, -1 = contre, 0 = abstention)
CREATE TABLE IF NOT EXISTS reunion_date_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES reunion_date_proposals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    vote INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (proposal_id, user_id)
);

ALTER TABLE reunion_date_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cabinet members view date votes" ON reunion_date_votes;
DROP POLICY IF EXISTS "Members manage own date votes" ON reunion_date_votes;
DROP POLICY IF EXISTS "Members update own date votes" ON reunion_date_votes;
DROP POLICY IF EXISTS "Members delete own date votes" ON reunion_date_votes;

CREATE POLICY "Cabinet members view date votes" ON reunion_date_votes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reunion_date_proposals p
            WHERE p.id = proposal_id AND reunion_same_cabinet(p.cabinet_id)
        )
    );

CREATE POLICY "Members manage own date votes" ON reunion_date_votes
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND EXISTS (
            SELECT 1 FROM reunion_date_proposals p
            WHERE p.id = proposal_id AND reunion_same_cabinet(p.cabinet_id)
        )
    );

CREATE POLICY "Members update own date votes" ON reunion_date_votes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Members delete own date votes" ON reunion_date_votes
    FOR DELETE USING (auth.uid() = user_id);

-- Migration v3 : édition des sujets par tout associé, suppression par le créateur uniquement

DROP POLICY IF EXISTS "Members update own sujets" ON reunion_sujets;
DROP POLICY IF EXISTS "Members delete own sujets" ON reunion_sujets;
DROP POLICY IF EXISTS "Cabinet members update sujets" ON reunion_sujets;
DROP POLICY IF EXISTS "Creator deletes own sujet" ON reunion_sujets;

-- Tout membre du cabinet peut modifier un sujet (updated_by facultatif pour tracer)
ALTER TABLE reunion_sujets ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

CREATE POLICY "Cabinet members update sujets" ON reunion_sujets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM reunions r
            WHERE r.id = reunion_id AND reunion_same_cabinet(r.cabinet_id)
        )
    );

-- Seul le créateur du sujet peut le supprimer
CREATE POLICY "Creator deletes own sujet" ON reunion_sujets
    FOR DELETE USING (auth.uid() = user_id);
