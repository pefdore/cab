-- Stock du cabinet (produits, commandes, réceptions) partagé entre appareils/sessions
CREATE TABLE IF NOT EXISTS cabinet_stock_data (
    cabinet_id UUID PRIMARY KEY REFERENCES cabinets(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cabinet_stock_data ENABLE ROW LEVEL SECURITY;

-- Un membre du cabinet peut lire les données de stock de son cabinet
DROP POLICY IF EXISTS "Membres lisent le stock de leur cabinet" ON cabinet_stock_data;
CREATE POLICY "Membres lisent le stock de leur cabinet" ON cabinet_stock_data
    FOR SELECT USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );

-- Un membre du cabinet peut écrire les données de stock de son cabinet
DROP POLICY IF EXISTS "Membres ecrivent le stock de leur cabinet" ON cabinet_stock_data;
CREATE POLICY "Membres ecrivent le stock de leur cabinet" ON cabinet_stock_data
    FOR ALL USING (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    ) WITH CHECK (
        cabinet_id IN (SELECT cabinet_id FROM profiles WHERE id = auth.uid())
    );
