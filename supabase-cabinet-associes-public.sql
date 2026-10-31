-- ============================================================
-- RPC PUBLIQUE : medecins installes d'un cabinet
-- ============================================================
-- Pendant l'inscription, le visiteur n'est PAS connecte : la lecture
-- directe de profiles est bloquee par RLS, et le fallback affichait le
-- nom fige du fondateur (cabinets.name) au lieu des associes reels.
-- Cette fonction SECURITY DEFINER expose uniquement les noms des
-- associes (medecin_installe / admin) d'un cabinet, pour la modale
-- "rejoindre un cabinet". Aucune donnee sensible (email, id) exposee.
--
-- A EXECUTER DANS L'EDITEUR SQL DE SUPABASE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cabinet_associes_public(p_cabinet_id UUID)
RETURNS TABLE(first_name TEXT, last_name TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.first_name::TEXT, p.last_name::TEXT, p.role::TEXT
    FROM profiles p
    WHERE p.cabinet_id = p_cabinet_id
      AND p.role IN ('medecin_installe', 'admin')
    ORDER BY p.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.cabinet_associes_public(UUID) TO authenticated, anon;
