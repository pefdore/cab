-- ============================================================
-- ROW LEVEL SECURITY - TABLES COTATION MÉDECIN
-- Isolation stricte par utilisateur (user_id)
-- ============================================================

-- À exécuter dans le SQL Editor de Supabase

ALTER TABLE passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE comptabilite ENABLE ROW LEVEL SECURITY;

-- ---------- passages ----------
CREATE POLICY "Users can view own passages" ON passages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own passages" ON passages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own passages" ON passages
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own passages" ON passages
  FOR DELETE USING (auth.uid() = user_id);

-- ---------- patients ----------
CREATE POLICY "Users can view own patients" ON patients
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own patients" ON patients
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own patients" ON patients
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own patients" ON patients
  FOR DELETE USING (auth.uid() = user_id);

-- ---------- comptabilite (feuilles de cotation / PDFs) ----------
CREATE POLICY "Users can view own comptabilite" ON comptabilite
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own comptabilite" ON comptabilite
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comptabilite" ON comptabilite
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comptabilite" ON comptabilite
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('passages', 'patients', 'comptabilite');
