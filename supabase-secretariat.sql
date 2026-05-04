-- ============================================================
-- TABLES SECRÉTARIAT - RH, Planning, Standard
-- ============================================================

-- Table des employés
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    lastname TEXT NOT NULL,
    firstname TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    function TEXT NOT NULL,
    contract_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    hours_per_week INTEGER DEFAULT 35,
    salary DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des plannings hebdomadaires
CREATE TABLE IF NOT EXISTS plannings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    week_number INTEGER NOT NULL,
    week_year INTEGER NOT NULL,
    status TEXT NOT NULL,
    hours INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, employee_id, day, week_number)
);

-- Table des congés
CREATE TABLE IF NOT EXISTS leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'pending',
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des astreintes
CREATE TABLE IF NOT EXISTS astreintes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    employee_name TEXT,
    date DATE NOT NULL,
    type TEXT DEFAULT 'standard',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des appels du standard
CREATE TABLE IF NOT EXISTS standard_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 0,
    wait_time INTEGER DEFAULT 0,
    motif TEXT,
    operator TEXT,
    type TEXT DEFAULT 'answered',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des fichiers importés
CREATE TABLE IF NOT EXISTS imported_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    import_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_plannings_user_week ON plannings(user_id, week_number);
CREATE INDEX IF NOT EXISTS idx_leaves_user_dates ON leaves(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_astreintes_user_date ON astreintes(user_id, date);
CREATE INDEX IF NOT EXISTS idx_standard_calls_user_date ON standard_calls(user_id, date);

-- Politiques RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE astreintes ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_files ENABLE ROW LEVEL SECURITY;

-- Politiques pour les employés
CREATE POLICY "Employés visibles par utilisateur" ON employees
    FOR ALL USING (user_id = auth.uid());

-- Politiques pour les plannings
CREATE POLICY "Plannings visibles par utilisateur" ON plannings
    FOR ALL USING (user_id = auth.uid());

-- Politiques pour les congés
CREATE Policy "Congés visibles par utilisateur" ON leaves
    FOR ALL USING (user_id = auth.uid());

-- Politiques pour les astreintes
CREATE POLICY "Astreintes visibles par utilisateur" ON astreintes
    FOR ALL USING (user_id = auth.uid());

-- Politiques pour les appels standard
CREATE POLICY "Appels standard visibles par utilisateur" ON standard_calls
    FOR ALL USING (user_id = auth.uid());

-- Politiques pour les fichiers importés
CREATE POLICY "Fichiers importés visibles par utilisateur" ON imported_files
    FOR ALL USING (user_id = auth.uid());