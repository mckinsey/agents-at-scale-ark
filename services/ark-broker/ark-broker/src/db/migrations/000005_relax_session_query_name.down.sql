DROP INDEX IF EXISTS sessions_name_idx;

UPDATE session_queries SET name = query_id WHERE name IS NULL;
ALTER TABLE session_queries ALTER COLUMN name SET NOT NULL;
