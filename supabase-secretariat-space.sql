-- ============================================================
-- ESPACE SECRETAIRE
-- 1) Validation des inscriptions secretaire par un associe du cabinet
-- 2) Gestionnaire de taches du cabinet
-- ============================================================

-- ------------------------------------------------------------
-- Demandes d'acces au cabinet (secretaires)
-- status : 'pending' | 'approved' | 'rejected'
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cabinet_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requester_name TEXT,
    requester_email TEXT,
    role TEXT NOT NULL DEFAULT 'secretaire',
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cabinet_join_requests ENABLE ROW LEVEL SECURITY;

-- Un membre du cabinet voit les demandes de son cabinet
DROP POLICY IF EXISTS "Membres lisent les demandes de leur cabinet" ON cabinet_join_requests;
CREATE POLICY "Membres lisent les demandes de leur cabinet"
    ON cabinet_join_requests FOR SELECT USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );

-- Seuls les medecins associes (medecin_installe) gerent les demandes
DROP POLICY IF EXISTS "Associes gerent les demandes de leur cabinet" ON cabinet_join_requests;
CREATE POLICY "Associes gerent les demandes de leur cabinet"
    ON cabinet_join_requests FOR UPDATE USING (
        cabinet_id IN (
            SELECT cabinet_id FROM profiles
            WHERE id = auth.uid() AND role = 'medecin_installe'
        )
    ) WITH CHECK (
        cabinet_id IN (
            SELECT cabinet_id FROM profiles
            WHERE id = auth.uid() AND role = 'medecin_installe'
        )
    );

-- Un utilisateur non encore membre peut creer sa propre demande
DROP POLICY IF EXISTS "Nouvel inscrit cree sa demande" ON cabinet_join_requests;
CREATE POLICY "Nouvel inscrit cree sa demande"
    ON cabinet_join_requests FOR INSERT WITH CHECK (
        requester_id = auth.uid()
    );

-- Le demandeur peut suivre sa propre demande (statut)
DROP POLICY IF EXISTS "Demandeur lit sa demande" ON cabinet_join_requests;
CREATE POLICY "Demandeur lit sa demande"
    ON cabinet_join_requests FOR SELECT USING (
        requester_id = auth.uid()
    );

-- ------------------------------------------------------------
-- Taches du cabinet (attribuees par les medecins, vue par tous)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cabinet_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,
    due_date DATE,
    priority TEXT DEFAULT 'normale',
    status TEXT NOT NULL DEFAULT 'todo',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cabinet_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membres lisent les taches de leur cabinet" ON cabinet_tasks;
CREATE POLICY "Membres lisent les taches de leur cabinet"
    ON cabinet_tasks FOR SELECT USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Membres creent des taches de leur cabinet" ON cabinet_tasks;
CREATE POLICY "Membres creent des taches de leur cabinet"
    ON cabinet_tasks FOR INSERT WITH CHECK (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Membres modifient les taches de leur cabinet" ON cabinet_tasks;
CREATE POLICY "Membres modifient les taches de leur cabinet"
    ON cabinet_tasks FOR UPDATE USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    ) WITH CHECK (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Medecins suppriment les taches" ON cabinet_tasks;
CREATE POLICY "Medecins suppriment les taches"
    ON cabinet_tasks FOR DELETE USING (
        cabinet_id IN (
            SELECT cabinet_id FROM profiles
            WHERE id = auth.uid() AND role = 'medecin_installe'
        )
    );

CREATE INDEX IF NOT EXISTS idx_cabinet_join_requests_cabinet ON cabinet_join_requests(cabinet_id, status);
CREATE INDEX IF NOT EXISTS idx_cabinet_tasks_cabinet ON cabinet_tasks(cabinet_id, status);

-- ------------------------------------------------------------
-- Un medecin associe peut rattacher une secretaire validee a son cabinet
-- (mise a jour de profiles.cabinet_id lors de l'approbation)
-- ------------------------------------------------------------
-- Note : si la table profiles possede deja des policies restrictives, ajouter :
--
-- DROP POLICY IF EXISTS "Associes valident les secretaires" ON profiles;
-- CREATE POLICY "Associes valident les secretaires" ON profiles
--     FOR UPDATE USING (
--         role = 'medecin_installe'
--         AND id IN (
--             SELECT p2.id FROM profiles p2
--             WHERE p2.id = auth.uid() AND p2.role = 'medecin_installe'
--         )
--     );

-- ============================================================
-- CREATION AUTOMATIQUE DE LA DEMANDE (cote serveur)
-- Trigger : des qu'une secretaire a un cabinet_cible connu dans profiles
-- (cabinet_id OU cabinet_address), la demande pending est creee/mise a jour
-- par le serveur. Plus aucune dependance au client : la demande existe
-- des l'inscription ou la mise a jour du profil.
-- ============================================================

-- Fonction : resoudre le cabinet cible d'une secretaire.
-- Privilege le cabinet qui a deja des membres en cas d'adresses en doublon.
CREATE OR REPLACE FUNCTION sec_resolve_target_cabinet(p_profile record)
RETURNS UUID AS $$
DECLARE
    v_cabinet UUID;
    v_exists BOOLEAN;
BEGIN
    -- 1) cabinet_id direct, seulement s'il pointe vers un cabinet existant.
    -- Dans le trigger de demande, un cabinet_id pose signifie deja rattache :
    -- on ne l'utilise jamais comme cible de demande (le trigger l'exclut avant).
    -- Ici on garde le comportement pour les usages hors trigger.
    IF p_profile.cabinet_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM cabinets c WHERE c.id = p_profile.cabinet_id)
          INTO v_exists;
        IF v_exists THEN
            RETURN p_profile.cabinet_id;
        END IF;
        -- sinon : cabinet_id orphelin (cabinet supprime) -> resolution par adresse
    END IF;

    -- 2) resolution par adresse : cabinet avec des medecins associes d'abord
    IF p_profile.cabinet_address IS NOT NULL THEN
        SELECT c.id INTO v_cabinet
        FROM cabinets c
        WHERE c.address ILIKE '%' || p_profile.cabinet_address || '%'
        ORDER BY (
            SELECT count(*) FROM profiles m
            WHERE m.cabinet_id = c.id AND m.role = 'medecin_installe'
        ) DESC, c.created_at ASC
        LIMIT 1;
        RETURN v_cabinet;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Fonction : creer la demande pending si elle n'existe pas
CREATE OR REPLACE FUNCTION sec_ensure_join_request()
RETURNS TRIGGER AS $$
DECLARE
    v_cabinet UUID;
    v_name TEXT;
    v_email TEXT;
    v_role TEXT;
BEGIN
    v_role := NEW.role;

    -- Process uniforme pour tout membre rejoignant un cabinet :
    -- secretaire ET medecin_installe qui rejoignent un cabinet existant
    -- passent par la validation. Un medecin fondateur (qui cree le cabinet)
    -- est rattache directement par l'app et n'a pas de demande a creer :
    -- il est deja membre, aucune demande ne doit exister pour lui-meme.
    IF v_role NOT IN ('secretaire', 'medecin_installe') THEN
        RETURN NEW;
    END IF;

    v_cabinet := sec_resolve_target_cabinet(NEW);
    IF v_cabinet IS NULL THEN
        RETURN NEW;
    END IF;

    -- Ne pas creer de demande si le profil est deja rattache directement
    -- (fondateur ou membre deja valide/approuve)
    IF NEW.cabinet_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_name := trim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
    v_email := NEW.email;

    INSERT INTO cabinet_join_requests
        (cabinet_id, requester_id, requester_name, requester_email, role, status)
    VALUES
        (v_cabinet, NEW.id, coalesce(nullif(v_name, ''), 'Membre'),
         coalesce(v_email, ''), coalesce(v_role, 'secretaire'), 'pending')
    ON CONFLICT DO NOTHING;

    -- Le trigger ne doit JAMAIS faire echouer l'inscription ou la mise a jour
    -- du profil : toute erreur est avalee et loggee, l'INSERT est au pire saute.
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[sec_ensure_join_request] erreur ignoree: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index unique pour que ON CONFLICT DO NOTHING protege des doublons
CREATE UNIQUE INDEX IF NOT EXISTS uniq_join_request_per_requester_cabinet
    ON cabinet_join_requests (requester_id, cabinet_id);

DROP TRIGGER IF EXISTS trg_sec_ensure_join_request ON profiles;
CREATE TRIGGER trg_sec_ensure_join_request
    AFTER INSERT OR UPDATE OF role, cabinet_id, cabinet_address
    ON profiles
    FOR EACH ROW EXECUTE FUNCTION sec_ensure_join_request();
