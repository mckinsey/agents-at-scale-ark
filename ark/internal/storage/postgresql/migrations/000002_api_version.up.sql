ALTER TABLE resources ADD COLUMN IF NOT EXISTS api_version TEXT NOT NULL DEFAULT '';
UPDATE resources SET api_version = '' WHERE api_version IS NULL;
