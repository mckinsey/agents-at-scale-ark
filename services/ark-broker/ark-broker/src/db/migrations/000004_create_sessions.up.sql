CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'idle',
  error_count   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  participants  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  conversations JSONB       NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX sessions_status_idx        ON sessions (status);
CREATE INDEX sessions_last_activity_idx ON sessions (last_activity);
CREATE INDEX sessions_expires_at_idx    ON sessions (expires_at);

-- One row per query, instead of embedding all of a session's queries as a
-- single JSONB blob on the sessions row: an event/message for one query
-- upserts one small row here, instead of locking and rewriting every other
-- query in the same session. See session_queries_query_id_idx for why this
-- needs its own index beyond the composite primary key.
CREATE TABLE IF NOT EXISTS session_queries (
  session_id                    TEXT        NOT NULL REFERENCES sessions (session_id) ON DELETE CASCADE,
  query_id                      TEXT        NOT NULL,
  name                          TEXT        NOT NULL,
  namespace                     TEXT,
  conversation_id               TEXT,
  agent                         TEXT,
  team                          TEXT,
  tool                          TEXT,
  target_type                   TEXT        NOT NULL DEFAULT 'agent',
  phase                         TEXT        NOT NULL,
  error                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at                  TIMESTAMPTZ,
  last_activity                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_applied_event_sequence   BIGINT      NOT NULL DEFAULT 0,
  last_applied_message_sequence BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, query_id)
);

-- applyMessage looks up a query by query_id alone (it doesn't know the
-- session_id upfront) - the composite primary key above is session_id-first,
-- so it can't serve that lookup on its own.
CREATE INDEX session_queries_query_id_idx ON session_queries (query_id);

-- getQueryByConversationId looks up by conversation_id alone.
CREATE INDEX session_queries_conversation_id_idx
  ON session_queries (conversation_id)
  WHERE conversation_id IS NOT NULL;
