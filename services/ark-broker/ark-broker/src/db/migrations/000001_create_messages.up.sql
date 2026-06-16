CREATE SEQUENCE IF NOT EXISTS messages_seq AS BIGINT START WITH 1;

CREATE TABLE IF NOT EXISTS messages (
  sequence_number BIGINT      PRIMARY KEY DEFAULT nextval('messages_seq'),
  conversation_id TEXT        NOT NULL,
  query_id        TEXT        NOT NULL,
  message         JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

ALTER SEQUENCE messages_seq OWNED BY messages.sequence_number;

CREATE INDEX messages_conversation_idx ON messages (conversation_id, sequence_number);
CREATE INDEX messages_query_idx        ON messages (query_id, sequence_number);
CREATE INDEX messages_expires_at_idx   ON messages (expires_at);
