-- ============================================================
-- MARKETPLACE REMPLACEMENTS (mise en relation type "bon coin")
-- Medecins installes <-> Remplacants <-> Docteurs juniors
-- Offres (ponctuel / regulier / collaboration / assistantat / junior),
-- disponibilites, mises en relation et notifications.
-- ============================================================

-- ---------- OFFRES DE REMPLACEMENT PUBLIEES PAR LES CABINETS ----------
CREATE TABLE IF NOT EXISTS mp_offres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auteur_id UUID NOT NULL REFERENCES auth.users(id),
    type TEXT NOT NULL DEFAULT 'ponctuel',        -- ponctuel | regulier | collaboration | assistantat | junior
    titre TEXT NOT NULL,
    description TEXT,
    date_debut DATE NOT NULL,
    date_fin DATE,
    regularite TEXT,                              -- ex: "1 semaine/mois", "tous les mardis"
    lieu TEXT NOT NULL,                           -- ville
    code_postal TEXT,
    adresse_cabinet TEXT,
    specialite TEXT,
    tarif_journalier NUMERIC(10,2),
    retrocession NUMERIC(5,2) DEFAULT 70,
    accepte_junior BOOLEAN DEFAULT false,
    statut TEXT NOT NULL DEFAULT 'active',        -- active | pourvue | fermee
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- DISPONIBILITES PUBLIEES PAR LES REMPLACANTS / JUNIORS ----------
CREATE TABLE IF NOT EXISTS mp_dispos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medecin_id UUID NOT NULL REFERENCES auth.users(id),
    profil TEXT NOT NULL DEFAULT 'remplacant',    -- remplacant | junior
    titre TEXT NOT NULL,
    description TEXT,
    date_debut DATE NOT NULL,
    date_fin DATE,
    regularite TEXT,                              -- ex: "1 semaine/mois", "vacances scolaires"
    zones TEXT,                                   -- villes / rayon recherche
    code_postal TEXT,
    specialite TEXT,
    rpps TEXT,
    telephone TEXT,
    email_contact TEXT,
    statut TEXT NOT NULL DEFAULT 'active',        -- active | fermee
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- MISES EN RELATION (candidatures dans les 2 sens) ----------
CREATE TABLE IF NOT EXISTS mp_candidatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sens TEXT NOT NULL,                           -- offre : remplacant postule | dispo : cabinet sollicite
    offre_id UUID REFERENCES mp_offres(id),
    dispo_id UUID REFERENCES mp_dispos(id),
    candidat_id UUID NOT NULL REFERENCES auth.users(id),
    cible_id UUID NOT NULL REFERENCES auth.users(id),
    message TEXT,
    statut TEXT NOT NULL DEFAULT 'en_attente',    -- en_attente | acceptee | refusee | annulee
    contrat_id UUID,                              -- contrat genere apres acceptation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- NOTIFICATIONS ----------
CREATE TABLE IF NOT EXISTS mp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    type TEXT NOT NULL,                           -- candidature | acceptation | refus | invitation | contrat | info
    titre TEXT NOT NULL,
    message TEXT,
    vue TEXT DEFAULT 'remplacement',
    lue BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_offres_statut ON mp_offres(statut, lieu);
CREATE INDEX IF NOT EXISTS idx_mp_dispos_statut ON mp_dispos(statut, zones);
CREATE INDEX IF NOT EXISTS idx_mp_cand_cible ON mp_candidatures(cible_id, statut);
CREATE INDEX IF NOT EXISTS idx_mp_cand_candidat ON mp_candidatures(candidat_id, statut);
CREATE INDEX IF NOT EXISTS idx_mp_notif_user ON mp_notifications(user_id, lue);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE mp_offres ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_dispos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_candidatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_notifications ENABLE ROW LEVEL SECURITY;

-- ---------- OFFRES ----------
DROP POLICY IF EXISTS "Mp offres lecture publique actives" ON mp_offres;
CREATE POLICY "Mp offres lecture publique actives" ON mp_offres
    FOR SELECT USING (statut = 'active' OR auteur_id = auth.uid());

DROP POLICY IF EXISTS "Mp offres auteur ecrit" ON mp_offres;
CREATE POLICY "Mp offres auteur ecrit" ON mp_offres
    FOR ALL USING (auteur_id = auth.uid()) WITH CHECK (auteur_id = auth.uid());

-- ---------- DISPONIBILITES ----------
DROP POLICY IF EXISTS "Mp dispos lecture publique actives" ON mp_dispos;
CREATE POLICY "Mp dispos lecture publiques actives" ON mp_dispos
    FOR SELECT USING (statut = 'active' OR medecin_id = auth.uid());

DROP POLICY IF EXISTS "Mp dispos auteur ecrit" ON mp_dispos;
CREATE POLICY "Mp dispos auteur ecrit" ON mp_dispos
    FOR ALL USING (medecin_id = auth.uid()) WITH CHECK (medecin_id = auth.uid());

-- ---------- CANDIDATURES ----------
DROP POLICY IF EXISTS "Mp candidatures parties lisent" ON mp_candidatures;
CREATE POLICY "Mp candidatures parties lisent" ON mp_candidatures
    FOR SELECT USING (candidat_id = auth.uid() OR cible_id = auth.uid());

DROP POLICY IF EXISTS "Mp candidatures candidat insere" ON mp_candidatures;
CREATE POLICY "Mp candidatures candidat insere" ON mp_candidatures
    FOR INSERT WITH CHECK (candidat_id = auth.uid());

DROP POLICY IF EXISTS "Mp candidatures parties modifient" ON mp_candidatures;
CREATE POLICY "Mp candidatures parties modifient" ON mp_candidatures
    FOR UPDATE USING (candidat_id = auth.uid() OR cible_id = auth.uid());

-- ---------- NOTIFICATIONS ----------
DROP POLICY IF EXISTS "Mp notifs proprietaire lit" ON mp_notifications;
CREATE POLICY "Mp notifs proprietaire lit" ON mp_notifications
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Mp notifs proprietaire ecrit" ON mp_notifications;
CREATE POLICY "Mp notifs proprietaire ecrit" ON mp_notifications
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Notifications inserees par un autre utilisateur (ex: candidat notifie le cible)
DROP POLICY IF EXISTS "Mp notifs insertion croisee" ON mp_notifications;
CREATE POLICY "Mp notifs insertion croisee" ON mp_notifications
    FOR INSERT WITH CHECK (true);
