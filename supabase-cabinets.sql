-- Table publique pour les cabinets médicaux
CREATE TABLE IF NOT EXISTS cabinets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer RLS
ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;

-- Politique: tout le monde peut lire les cabinets
CREATE POLICY "Cabinets publics en lecture" ON cabinets
    FOR SELECT USING (true);

-- Politique: seul le créateur peut modifier
CREATE POLICY "Creator can manage cabinet" ON cabinets
    FOR ALL USING (auth.uid() = id);