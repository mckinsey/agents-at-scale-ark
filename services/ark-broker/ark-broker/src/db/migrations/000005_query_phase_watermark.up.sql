-- last_applied_event_sequence advances on every event, so a non-terminal
-- (running) event arriving with a higher sequence than its own
-- QueryExecutionComplete makes the later-applied terminal event look stale and
-- its done phase is dropped, leaving the query stuck at running. Track the
-- sequence of the last phase-DECIDING (terminal) event separately: only a newer
-- terminal event can suppress a done, a reordered non-terminal event cannot.
ALTER TABLE session_queries
  ADD COLUMN IF NOT EXISTS last_phase_event_sequence BIGINT NOT NULL DEFAULT 0;
