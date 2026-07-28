DROP INDEX IF EXISTS sessions_name_idx;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participants JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE session_queries ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE session_queries SET name = query_id WHERE name IS NULL;
ALTER TABLE session_queries ALTER COLUMN name SET NOT NULL;
