-- ============================================================
-- SCRIPT CONSOLIDE A EXECUTER DANS L'EDITEUR SQL DE SUPABASE
-- ============================================================
-- 1. Formatage uniforme des noms : prenom avec majuscule initiale,
--    nom de famille en MAJUSCULES (ex. « le hetet » -> « Le Hetet » /
--    « LE HETET »). Corrige les donnees existantes ET les ecritures
--    futures via trigger.
-- 2. RPC publique : lister les associes d'un cabinet pendant
--    l'inscription (le visiteur n'est pas connecte).
-- 3. Policies UPDATE pour l'admin (rattachement, roles, adresse).
-- Executez ce script d'un bloc dans le SQL Editor Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) FONCTION DE FORMATAGE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.format_prenom(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p IS NULL OR p = '' THEN ''
        ELSE (SELECT string_agg(
            CASE WHEN lower(w) IN ('de','du','del','le','la','von','van')
                 THEN lower(w)
                 ELSE upper(left(w,1)) || lower(substring(w, 2)) END, ' ')
            FROM unnest(string_to_array(btrim(p), ' ')) AS w)
        END
$$;

CREATE OR REPLACE FUNCTION public.format_nom(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p IS NULL OR p = '' THEN ''
        ELSE upper(btrim(p)) END
$$;

-- 1a) CORRECTION DES DONNEES EXISTANTES (a executer une fois)
UPDATE profiles
SET first_name = public.format_prenom(first_name),
    last_name  = public.format_nom(last_name);

-- 1b) TRIGGER : formate automatiquement toute future ecriture
--     (inscription via trigger serveur, modification de profil, admin)
CREATE OR REPLACE FUNCTION public.format_profile_names()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.first_name = public.format_prenom(NEW.first_name);
    NEW.last_name  = public.format_nom(NEW.last_name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_format_profile_names ON profiles;
CREATE TRIGGER trg_format_profile_names
    BEFORE INSERT OR UPDATE OF first_name, last_name ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.format_profile_names();

-- ------------------------------------------------------------
-- 2) RPC PUBLIQUE : associes d'un cabinet (pour la modale
--    d'inscription, visiteur non connecte)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cabinet_associes_public(p_cabinet_id UUID)
RETURNS TABLE(first_name TEXT, last_name TEXT, role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT pr.first_name::TEXT, pr.last_name::TEXT, pr.role::TEXT
    FROM profiles pr
    WHERE pr.cabinet_id = p_cabinet_id
      AND pr.role IN ('medecin_installe', 'admin')
    ORDER BY pr.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.cabinet_associes_public(UUID) TO authenticated, anon;

-- ------------------------------------------------------------
-- 3) POLICIES UPDATE POUR L'ADMIN (rattachement, role, adresse)
--    Reutilisent la fonction is_admin() (supabase-admin.sql) :
--    aucune auto-reference a profiles, pas de recursion.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins gerent tous les profils" ON profiles;
CREATE POLICY "Admins gerent tous les profils" ON profiles
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins gerent tous les cabinets" ON cabinets;
CREATE POLICY "Admins gerent tous les cabinets" ON cabinets
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 4) VERIFICATION (executez pour controler le resultat)
-- ------------------------------------------------------------
-- SELECT first_name, last_name, role FROM profiles ORDER BY created_at;
