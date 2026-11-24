CREATE SEQUENCE IF NOT EXISTS events_seq AS BIGINT START WITH 1;

CREATE TABLE IF NOT EXISTS events (
  sequence_number BIGINT      PRIMARY KEY DEFAULT nextval('events_seq'),
  query_id        TEXT        NOT NULL,
  session_id      TEXT,
  reason          TEXT,
  event           JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

ALTER SEQUENCE events_seq OWNED BY events.sequence_number;

CREATE INDEX events_query_idx      ON events (query_id, sequence_number);
CREATE INDEX events_session_idx    ON events (session_id, sequence_number);
CREATE INDEX events_expires_at_idx ON events (expires_at);
