# sessions-broker-postgres

Verifies that two queries sharing a `sessionId`/`conversationId` are recorded as two rows in the Postgres `session_queries` table under one `sessions` header row, with `conversations`/`participants`/`error_count` aggregated correctly.

## What it tests
- Two queries, targeting two different agents, both set `spec.sessionId` and `spec.conversationId` to the same values
- Both queries complete with `phase: done`
- The broker's `session_queries` table has one row per query, both `phase='done'`
- The `sessions` header row shows `status=idle`, `error_count=0`, one conversation (both queries share it), two participants (the two agents)
- `GET /sessions/:id` returns the same shape over the broker HTTP API
- Requires the broker running with postgres sessions backend (`postgresql: "true"` label)

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (which configures the broker with `SESSIONS_BACKEND=postgres`, and therefore also `MESSAGE_BACKEND=postgres` and `EVENT_BACKEND=postgres`).
