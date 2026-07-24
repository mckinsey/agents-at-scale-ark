# sessions-broker-postgres-xreplica

Verifies that a Postgres-backed sessions store is genuinely shared across broker replicas, not just consistent within a single process: events for three queries in one session, posted through alternating replicas of a self-installed 2-replica broker, aggregate identically no matter which replica's pod answers the read afterwards.

## What it tests
- Self-installs a 2-replica `ark-broker` in the test's own namespace, backed by the shared `ark-storage-dev` Postgres instance (`backends.message=postgres`, `backends.event=postgres`, `backends.sessions=postgres`)
- Three `POST /events` calls, targeting each replica pod directly (bypassing the Service) so which pod handles which write is explicit: two queries share one conversation (one posted via replica A, one via replica B), the third starts a second conversation with an error, posted via replica A
- `GET /sessions/:id` from both replica A and replica B returns the same query count (3), conversation count (2), participant set (`agent-a`, `agent-b`, `tool-c`), and error count (1)
- Proves the incrementally-maintained session header (conversations/participants/error_count) is correct when built from writes scattered across independent connections/processes, not just within one

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (this test connects to the shared `ark-storage-dev` instance directly rather than provisioning its own).
