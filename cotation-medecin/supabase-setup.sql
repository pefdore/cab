-- ============================================================
-- MIGRATION DES DONNEES VERS L'UTILISATEUR
-- ============================================================

-- UUID de l'utilisateur (Dr DORE)
-- fa155f5d-8dbb-4f76-885a-39a1095e1e8b

-- 1. Ajouter user_id aux tables si pas encore fait
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE passages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE comptabilite ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Migrer les donnees existantes vers Dr DORE
UPDATE patients SET user_id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b' WHERE user_id IS NULL;
UPDATE passages SET user_id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b' WHERE user_id IS NULL;
UPDATE comptabilite SET user_id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b' WHERE user_id IS NULL;

-- 3. Mettre a jour le profil avec les infos du medecin
UPDATE profiles 
SET first_name = 'Pierre-François', last_name = 'DORE', role = 'medecin_installe'
WHERE id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b';

-- 4. Verifier
-- SELECT 'patients' as table_name, COUNT(*) as count FROM patients WHERE user_id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b';
-- SELECT 'passages' as table_name, COUNT(*) as count FROM passages WHERE user_id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b';