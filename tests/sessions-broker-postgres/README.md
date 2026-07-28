# sessions-broker-postgres

Verifies that two queries sharing a `sessionId` are recorded as two rows in the Postgres `session_queries` table under one `sessions` header row, with `conversations` and `error_count` aggregated on it and `participants` derived from those conversations on read.

## What it tests
- Two queries, targeting two different agents in two different conversations, both set `spec.sessionId` to the same value
- Both queries complete with `phase: done`
- The broker's `session_queries` table has one row per query, both `phase='done'`
- The `sessions` header row shows `status=idle`, `error_count=0`, two conversations
- `GET /sessions/:id` returns the same shape over the broker HTTP API, including the two participants derived from those conversations
- Requires the broker running with postgres sessions backend (`postgresql: "true"` label)

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (which configures the broker with `SESSIONS_BACKEND=postgres`, and therefore also `MESSAGE_BACKEND=postgres` and `EVENT_BACKEND=postgres`).
