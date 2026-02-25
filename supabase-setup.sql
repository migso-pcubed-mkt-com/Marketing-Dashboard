-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Marketing Dashboard - Supabase Setup SQL                                ║
-- ║  Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New)     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- 1. Create the main data table (stores all app data as JSON)
CREATE TABLE IF NOT EXISTS app_data (
    id TEXT PRIMARY KEY DEFAULT 'default',
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security (required for Supabase)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- 3. Create a permissive policy for anonymous access (single-user mode)
-- This allows anyone with the anon key to read and write data
-- For multi-user mode, you'll want to restrict this later
CREATE POLICY "Allow anonymous access" ON app_data
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Enable Realtime for the app_data table (for live sync)
ALTER PUBLICATION supabase_realtime ADD TABLE app_data;

-- 5. Create an auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_data_updated_at
    BEFORE UPDATE ON app_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ✅ Setup complete! Your table is ready for the Marketing Dashboard.
-- Now go back to the index.html and replace:
--   SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co'
--   SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'
-- with your actual Supabase project credentials.
