CREATE TABLE IF NOT EXISTS releve_imports (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
cabinet_id UUID,
month TEXT NOT NULL,
file_name TEXT,
transactions_count INT DEFAULT 0,
created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE releve_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "releve_imports_select" ON releve_imports;
CREATE POLICY "releve_imports_select" ON releve_imports
FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "releve_imports_insert" ON releve_imports;
CREATE POLICY "releve_imports_insert" ON releve_imports
FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "releve_imports_delete" ON releve_imports;
CREATE POLICY "releve_imports_delete" ON releve_imports
FOR DELETE USING (auth.uid() = user_id);
ALTER TABLE cabinet_depenses ADD COLUMN IF NOT EXISTS releve_libelle TEXT;
ALTER TABLE cabinet_depenses ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE cabinet_recettes ADD COLUMN IF NOT EXISTS releve_libelle TEXT;
ALTER TABLE cabinet_recettes ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE cabinet_depenses ADD COLUMN IF NOT EXISTS sous_categorie TEXT;
ALTER TABLE cabinet_recettes ADD COLUMN IF NOT EXISTS sous_categorie TEXT;
