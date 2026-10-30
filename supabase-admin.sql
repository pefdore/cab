-- ============================================================
-- ESPACE ADMINISTRATEUR — VERSION CORRIGEE (anti-recursion)
-- ============================================================
-- L'ancienne version creait une policy SUR profiles qui interrogeait
-- profiles elle-meme ("Admins lisent tous les profils") => erreur
-- "infinite recursion detected in policy for relation profiles" =>
-- TOUTES les lectures du profil echouaient (nom, prenom, cabinet,
-- demandes en attente, admin) pour TOUS les utilisateurs.
--
-- La correction : une fonction SECURITY DEFINER is_admin() qui
-- verifie le role SANS passer par RLS, puis des policies qui l'appellent.
--
-- A EXECUTER DANS L'EDITEUR SQL DE SUPABASE (remplace l'ancien script).
-- ============================================================

-- 1) Fonction de test du role admin (casse la recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 2) Supprimer les policies fautive et anciennes
DROP POLICY IF EXISTS "Admins lisent tous les profils" ON profiles;
DROP POLICY IF EXISTS "Admins lisent tous les cabinets" ON cabinets;
DROP POLICY IF EXISTS "Admins lisent toutes les demandes de rattachement" ON cabinet_join_requests;
DROP POLICY IF EXISTS "Associes gerent les demandes de leur cabinet" ON cabinet_join_requests;
DROP POLICY IF EXISTS "Membres lisent les demandes de leur cabinet" ON cabinet_join_requests;

-- 3) Cabinets : lecture globale pour les administrateurs
CREATE POLICY "Admins lisent tous les cabinets" ON cabinets
    FOR SELECT USING (public.is_admin());

-- 4) Profils : lecture globale pour les administrateurs
--    (via is_admin() : plus aucune auto-reference a profiles)
CREATE POLICY "Admins lisent tous les profils" ON profiles
    FOR SELECT USING (public.is_admin());

-- 5) Demandes de rattachement : lecture + gestion
CREATE POLICY "Membres lisent les demandes de leur cabinet" ON cabinet_join_requests
    FOR SELECT USING (
        requester_id = auth.uid()
        OR cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Associes gerent les demandes de leur cabinet" ON cabinet_join_requests
    FOR UPDATE USING (
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

-- 6) Donner le role admin a ton compte (a executer aussi) :
-- UPDATE profiles SET role = 'admin' WHERE id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b';
