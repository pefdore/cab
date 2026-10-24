-- ============================================================
-- SYSTEME D'INSCRIPTION, ROLES ET CABINETS
-- Roles : medecin_associe (tout), medecin_remplacant (urgence,
-- parametres, cotation au nom du remplace), secretaire (urgence,
-- stocks, parametres)
-- ============================================================

-- 1. Cabinets : ville d'exercice + createur
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Profils : statut de validation + medecin remplace
-- role : 'medecin_associe' | 'medecin_remplacant' | 'secretaire'
-- (legacy 'medecin_installe' = medecin_associe)
-- status : 'approved' | 'pending' | 'rejected'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remplace_medecin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL;

-- Migration des comptes existants
UPDATE profiles SET role = 'medecin_associe' WHERE role = 'medecin_installe';

-- 3. Demandes d'acces a un cabinet
CREATE TABLE IF NOT EXISTS cabinet_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cabinet_id UUID NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    role TEXT NOT NULL,
    remplace_medecin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cabinet_id, user_id)
);

ALTER TABLE cabinet_join_requests ENABLE ROW LEVEL SECURITY;

-- N'importe qui (non authentifie) peut demander a rejoindre un cabinet
DROP POLICY IF EXISTS "Anyone can request to join" ON cabinet_join_requests;
CREATE POLICY "Anyone can request to join" ON cabinet_join_requests
    FOR INSERT WITH CHECK (true);

-- Le demandeur suit sa propre demande ; les membres valides du
-- cabinet voient toutes les demandes de leur cabinet
DROP POLICY IF EXISTS "Requester or cabinet members can view requests" ON cabinet_join_requests;
CREATE POLICY "Requester or cabinet members can view requests" ON cabinet_join_requests
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.cabinet_id = cabinet_join_requests.cabinet_id
              AND p.status = 'approved'
        )
    );

-- Les medecins associes du cabinet decident des demandes
DROP POLICY IF EXISTS "Associes can decide requests" ON cabinet_join_requests;
CREATE POLICY "Associes can decide requests" ON cabinet_join_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.cabinet_id = cabinet_join_requests.cabinet_id
              AND p.role = 'medecin_associe'
              AND p.status = 'approved'
        )
    );

-- 4. Vue publique : cabinets avec les noms des associes inscrits
-- (utilisee a l'inscription pour choisir un cabinet par ville)
CREATE OR REPLACE VIEW cabinet_medecins_public AS
SELECT
    c.id AS cabinet_id,
    c.name AS cabinet_name,
    c.address,
    c.city,
    p.id AS medecin_id,
    p.first_name,
    p.last_name
FROM cabinets c
LEFT JOIN profiles p
    ON p.cabinet_id = c.id
   AND p.role = 'medecin_associe'
   AND p.status = 'approved';

GRANT SELECT ON cabinet_medecins_public TO anon, authenticated;
GRANT SELECT ON cabinet_join_requests TO anon, authenticated;
GRANT INSERT ON cabinet_join_requests TO anon, authenticated;
GRANT UPDATE ON cabinet_join_requests TO authenticated;
GRANT SELECT ON cabinets TO anon, authenticated;
GRANT INSERT ON cabinets TO authenticated;
