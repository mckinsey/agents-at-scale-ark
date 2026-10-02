# sessions-broker-postgres-xreplica

Verifies that a Postgres-backed sessions store is genuinely shared across broker replicas, not just consistent within a single process: events for three queries in one session, posted through alternating replicas of a self-installed 2-replica broker, aggregate identically no matter which replica's pod answers the read afterwards.

## What it tests
- Self-installs a 2-replica `ark-broker` in the test's own namespace, backed by the shared `ark-storage-dev` Postgres instance (`backends.message=postgres`, `backends.event=postgres`, `backends.sessions=postgres`)
- Three `POST /events` calls, targeting each replica pod directly (bypassing the Service) so which pod handles which write is explicit: two queries share one conversation (one posted via replica A, one via replica B), the third starts a second conversation with an error, posted via replica A
- `GET /sessions/:id` from both replica A and replica B returns the same query count (3), conversation count (2), error count (1), and participants - and the two responses are compared to each other, not just each checked in isolation
- Session-level participants are one per conversation, named after that conversation's first agent, so they are `agent-a` and `tool-c`; `agent-b` appears inside `conv-1`'s own participant list, which the test asserts separately
- Proves the session header (conversations and error_count, with participants derived from them on read) is correct when built from writes scattered across independent connections and processes, not just within one

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (this test connects to the shared `ark-storage-dev` instance directly rather than provisioning its own).
