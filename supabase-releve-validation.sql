-- ===== Validation explicite des mois de relevé =====
-- Un import de relevé ne valide PLUS le mois (certaines banques éditent
-- 2 relevés par mois, par quinzaine). Le mois n'est validé que par
-- l'action explicite du médecin (bouton "Valider" dans le module
-- "Relevés en attente" ou dialogue en fin d'import).

ALTER TABLE releve_imports
    ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT FALSE;

-- Les imports déjà réalisés avant cette migration restent considérés validés
-- (comportement historique : un import = mois complet)
UPDATE releve_imports SET validated = TRUE;

-- Le médecin peut mettre à jour la validation de ses propres imports
DROP POLICY IF EXISTS "Update de ses imports de releves" ON releve_imports;
CREATE POLICY "Update de ses imports de releves" ON releve_imports
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
