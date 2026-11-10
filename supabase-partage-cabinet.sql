-- ============================================================
-- PARTAGE CABINET - REGLES D'ACCES
-- ============================================================
-- 1. Medecins installes / admins d'un meme cabinet : partagent les
--    depenses et recettes (dashboard cabinet, flux). La cotation
--    reste individuelle (tables user_id, aucune policy de partage).
-- 2. Secretaires : AUCUN acces financier. Elles gardent uniquement
--    le stock (lecture + ecriture) et les taches du cabinet.
-- Executez ce script d'un bloc dans le SQL Editor Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1) DEPENSES / RECETTES : lecture limitee aux medecins du cabinet
-- ------------------------------------------------------------

-- Supprimer les policies de lecture existantes (doublons inclus)
DROP POLICY IF EXISTS "Users can see own depenses"         ON cabinet_depenses;
DROP POLICY IF EXISTS "Users can view their own depenses"  ON cabinet_depenses;
DROP POLICY IF EXISTS "Users can view their own recettes"  ON cabinet_recettes;
DROP POLICY IF EXISTS "Cabinet members can view depenses"   ON cabinet_depenses;
DROP POLICY IF EXISTS "Cabinet members can view recettes"   ON cabinet_recettes;
DROP POLICY IF EXISTS "Cabinet access depenses"            ON cabinet_depenses;

CREATE POLICY "own_or_cabinet_doctors_depenses"
ON cabinet_depenses FOR SELECT
USING (
    cabinet_depenses.user_id = auth.uid()
    OR (
        EXISTS (
            SELECT 1 FROM profiles owner
            WHERE owner.id = cabinet_depenses.user_id
              AND owner.role IN ('medecin_installe','admin')
              AND owner.cabinet_id = (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM profiles me
            WHERE me.id = auth.uid()
              AND me.role IN ('medecin_installe','admin')
              AND me.cabinet_id IS NOT NULL
        )
    )
);

CREATE POLICY "own_or_cabinet_doctors_recettes"
ON cabinet_recettes FOR SELECT
USING (
    cabinet_recettes.user_id = auth.uid()
    OR (
        EXISTS (
            SELECT 1 FROM profiles owner
            WHERE owner.id = cabinet_recettes.user_id
              AND owner.role IN ('medecin_installe','admin')
              AND owner.cabinet_id = (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM profiles me
            WHERE me.id = auth.uid()
              AND me.role IN ('medecin_installe','admin')
              AND me.cabinet_id IS NOT NULL
        )
    )
);

-- ------------------------------------------------------------
-- 2) FLUX (soldes d'ouverture) : medecins du cabinet uniquement
--    La fonction flux_same_cabinet autorisait tout membre,
--    secretaires comprises. On restreint aux medecins installes.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flux_same_cabinet(target_cabinet_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.cabinet_id = target_cabinet_id
          AND p.role IN ('medecin_installe','admin')
    );
$$;

-- ------------------------------------------------------------
-- 3) STOCK : inchange, accessible a TOUS les membres du cabinet
--    (medecins ET secretaires) - voir supabase-stock.sql.
--    Rappele ici pour memoire, les policies de supabase-stock.sql
--    sont deja correctes :
--      cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 4) VERIFICATION
-- ------------------------------------------------------------
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename IN ('cabinet_depenses','cabinet_recettes','cabinet_opening_balances','cabinet_stock_data')
ORDER BY tablename, cmd, policyname;

-- Verifier que les 3 medecins du cabinet partagent le meme cabinet_id :
-- SELECT first_name, last_name, role, cabinet_id FROM profiles
-- WHERE role IN ('medecin_installe','admin');

-- ------------------------------------------------------------
-- 5) RPC : ids des medecins installes/admins du cabinet
--    La lecture directe de profiles est bloquee par RLS entre membres :
--    l'app qui charge les depenses/recettes partagees doit passer par
--    une RPC SECURITY DEFINER (meme pattern que cabinet_associes_public).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cabinet_medecins_ids(p_cabinet_id UUID, p_exclude_uid UUID DEFAULT NULL)
RETURNS TABLE(user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id
    FROM profiles p
    WHERE p.cabinet_id = p_cabinet_id
      AND p.role IN ('medecin_installe','admin')
      AND (p_exclude_uid IS NULL OR p.id <> p_exclude_uid);
$$;

GRANT EXECUTE ON FUNCTION public.cabinet_medecins_ids(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6) CORRECTIF RLS : policies via fonction SECURITY DEFINER
--    Les sous-requetes d'une policy restent soumises a la RLS de la
--    table referencee (profiles) : le EXISTS sur le profil du
--    proprietaire de la ligne echouait silencieusement. Une fonction
--    SECURITY DEFINER contourne la RLS de profiles.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "own_or_cabinet_doctors_depenses"  ON cabinet_depenses;
DROP POLICY IF EXISTS "own_or_cabinet_doctors_recettes"  ON cabinet_recettes;
DROP POLICY IF EXISTS "Cabinet access depenses"          ON cabinet_depenses;

CREATE OR REPLACE FUNCTION public.medecin_cabinet_peut_lire(p_owner_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles me
        WHERE me.id = auth.uid()
          AND me.role IN ('medecin_installe','admin')
          AND me.cabinet_id IS NOT NULL
          AND me.cabinet_id = (SELECT p.cabinet_id FROM profiles p WHERE p.id = p_owner_uid)
          AND EXISTS (
              SELECT 1 FROM profiles o
              WHERE o.id = p_owner_uid
                AND o.role IN ('medecin_installe','admin')
          )
    );
$$;

GRANT EXECUTE ON FUNCTION public.medecin_cabinet_peut_lire(UUID) TO authenticated;

CREATE POLICY "own_or_cabinet_doctors_depenses"
ON cabinet_depenses FOR SELECT
USING (
    cabinet_depenses.user_id = auth.uid()
    OR public.medecin_cabinet_peut_lire(cabinet_depenses.user_id)
);

CREATE POLICY "own_or_cabinet_doctors_recettes"
ON cabinet_recettes FOR SELECT
USING (
    cabinet_recettes.user_id = auth.uid()
    OR public.medecin_cabinet_peut_lire(cabinet_recettes.user_id)
);

-- Verification : les deux policies SELECT doivent apparaitre avec la fonction
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('cabinet_depenses','cabinet_recettes') AND cmd = 'SELECT'
ORDER BY tablename;
