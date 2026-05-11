-- Drop existing table if exists
DROP TABLE IF EXISTS documents;

-- Create storage bucket first
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Documents table for cabinet documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    category TEXT,
    description TEXT,
    doc_type TEXT DEFAULT 'cabinet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own documents
CREATE POLICY "Users can view own documents" ON documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "Public access to documents" ON storage.objects
    FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Allow all uploads to documents" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow all deletes from documents" ON storage.objects
    FOR DELETE USING (bucket_id = 'documents');