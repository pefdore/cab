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
