-- session_queries.name always held the same value as query_id, and the header's
-- participants are derived from conversations on read, so neither is written
-- any more. They are relaxed rather than dropped: the migration runs from a
-- per-pod init container, so during a rolling update a replica on the previous
-- image is still writing both. Dropping them belongs to a later release, once
-- no such replica can exist.
ALTER TABLE session_queries ALTER COLUMN name DROP NOT NULL;

-- paginate can sort by name.
CREATE INDEX IF NOT EXISTS sessions_name_idx ON sessions (name);
