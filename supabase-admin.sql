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
