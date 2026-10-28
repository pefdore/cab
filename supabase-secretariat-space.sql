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
