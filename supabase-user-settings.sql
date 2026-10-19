-- ============================================================
-- TABLE user_settings (Paramètres : logo, signature, thème, notifications)
-- Schéma clé/valeur : une ligne par paramètre et par utilisateur
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contrainte unique nécessaire pour l'upsert (user_id, key)
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_key_unique
    ON user_settings (user_id, key);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own settings" ON user_settings;
CREATE POLICY "Users can read own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
CREATE POLICY "Users can delete own settings" ON user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Notifications : rappels VL et email mensuel (clés notif_vl / notif_email)
-- (stockées dans user_settings, rien à faire ici)
-- ============================================================
