-- Add new columns to existing documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS annotation TEXT;