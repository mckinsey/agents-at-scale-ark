-- session_queries.name always held the same value as query_id, and the header's
-- participants are one per conversation, so they are derived from the
-- conversations column on read instead of being stored. Both are dropped here
-- rather than by editing 000004, which databases have already applied.
ALTER TABLE session_queries DROP COLUMN IF EXISTS name;
ALTER TABLE sessions       DROP COLUMN IF EXISTS participants;

-- paginate can sort by name.
CREATE INDEX IF NOT EXISTS sessions_name_idx ON sessions (name);
