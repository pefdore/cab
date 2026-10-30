-- ============================================================
-- POLICY UPDATE POUR L'ADMIN SUR profiles
-- ============================================================
-- Permet au role admin de rattacher (cabinet_id) ou de detacherr
-- n'importe quel inscrit depuis le module Administration.
-- Reutilise la fonction SECURITY DEFINER is_admin() deja en place
-- (supabase-admin.sql) : aucune auto-reference a profiles, pas de
-- recursion.
--
-- A EXECUTER DANS L'EDITEUR SQL DE SUPABASE.
-- ============================================================

DROP POLICY IF EXISTS "Admins gerent tous les profils" ON profiles;

CREATE POLICY "Admins gerent tous les profils" ON profiles
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());
