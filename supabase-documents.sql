-- Check if bucket exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
        INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);
    END IF;
END $$;

-- Verify it exists
SELECT id, name, public FROM storage.buckets WHERE id = 'documents';