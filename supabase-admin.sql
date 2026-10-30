-- ============================================================
-- ESPACE ADMINISTRATEUR
-- Donne au role 'admin' (profiles.role = 'admin') une lecture
-- globale sur les cabinets et les profils (tous les inscrits).
-- A executer dans l'editeur SQL de Supabase.
-- ============================================================

-- Cabinets : lecture globale pour les administrateurs
DROP POLICY IF EXISTS "Admins lisent tous les cabinets" ON cabinets;
CREATE POLICY "Admins lisent tous les cabinets" ON cabinets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Profils : lecture globale pour les administrateurs
DROP POLICY IF EXISTS "Admins lisent tous les profils" ON profiles;
CREATE POLICY "Admins lisent tous les profils" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Donner le role admin a un compte existant (remplacer l'UUID) :
-- UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-000000000000';

-- ============================================================
-- ADMIN = aussi un medecin associe pour la gestion des demandes
-- de rattachement (approbation/refus des secretaires et medecins)
-- ============================================================

DROP POLICY IF EXISTS "Associes gerent les demandes de leur cabinet" ON cabinet_join_requests;
CREATE POLICY "Associes gerent les demandes de leur cabinet"
    ON cabinet_join_requests FOR UPDATE USING (
        cabinet_id IN (
            SELECT cabinet_id FROM profiles
            WHERE id = auth.uid() AND role IN ('medecin_installe', 'admin')
        )
    ) WITH CHECK (
        cabinet_id IN (
            SELECT cabinet_id FROM profiles
            WHERE id = auth.uid() AND role IN ('medecin_installe', 'admin')
        )
    );

DROP POLICY IF EXISTS "Membres lisent les demandes de leur cabinet" ON cabinet_join_requests;
CREATE POLICY "Membres lisent les demandes de leur cabinet"
    ON cabinet_join_requests FOR SELECT USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins lisent toutes les demandes de rattachement" ON cabinet_join_requests;
CREATE POLICY "Admins lisent toutes les demandes de rattachement" ON cabinet_join_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );
