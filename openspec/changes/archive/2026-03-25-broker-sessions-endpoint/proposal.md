## Why

Ark processes queries in real time, emitting events, chunks, traces, and messages to the broker's append-only streams. These streams are the raw record — but to answer "what is happening right now?" or "what happened in session X?" a consumer currently has to join and filter four separate streams. The `/sessions` endpoint solves this by maintaining a **live, event-sourced materialized index** of sessions and queries. It is updated continuously as events flow in. There is only ever one session record per session — it is simply kept up to date. SSE consumers receive the full session object each time it changes.

A sessions record looks like this:

```json
{
  "sessionId": "session-1773840591429",
  "name": "session-session-",
  "queries": {
    "openai-query-abc123": {
      "name": "openai-query-abc123",
      "conversationId": "conv-9f3a21bc",
      "agent": "default/noah",
      "phase": "done",
      "createdAt": "2026-03-23T10:00:00.000Z",
      "completedAt": "2026-03-23T10:00:04.300Z"
    },
    "openai-query-def456": {
      "name": "openai-query-def456",
      "conversationId": "conv-9f3a21bc",
      "phase": "running",
      "createdAt": "2026-03-23T10:00:12.000Z"
    }
  }
}
```

Sessions contain queries. `name` (matches CRD metadata.name) is the primary key. `conversationId` arrives later and links queries that share the same chat thread. Multiple queries with the same `conversationId` are turns in the same conversation. `conversationId` tells you where to find messages, `name` tells you where to find events and chunks.

### How data flows in

The sessions store is enriched as a side effect of data arriving on existing broker streams. No new ingestion path is needed — the existing `/events` and `/messages` routes call into the sessions broker:

```
  Controller                    Broker
  ─────────                    ──────
       │                          │
       ├─── POST /events ────────►│──► events stream (append)
       │                          │──► sessions.ingestEvent()  ─┐
       │                          │                             │
       ├─── POST /messages ──────►│──► messages stream (append) │
       │                          │──► sessions.ingestMessage() │
       │                          │                             │
       │                          │   ┌─────────────────────────┘
       │                          │   ▼
       │                          │  /sessions store (mutate in place)
       │                          │   │
       │                          │   ├──► SSE subscribers
       │                          │   └──► GET /sessions
```

Events provide: `sessionId`, `queryName`, `agent`, `phase`, `error`. Messages provide: `conversationId`. Together they build up the session record.

This serves two use cases: **real-time** (subscribe via SSE and watch the record mutate as a session progresses) and **post-hoc** (poll or GET to reconstruct what happened in any past session). A formal specification is needed so consumers can integrate against a stable contract rather than the current implementation.

## What Changes

- Add `broker-sessions-api` spec documenting all `/sessions` endpoints
- Document the mutable-object SSE pattern (distinct from append-only stream pattern used by `/events`, `/messages`, `/traces`, `/chunks`)
- Include data model with lifecycle examples showing how the sessions object evolves from query start to completion

## Capabilities

### New Capabilities
- `broker-sessions-api`: REST and SSE API specification for the `/sessions` endpoint, including data model, lifecycle examples, and SSE delta-update semantics

### Modified Capabilities

## Impact

This is essentially a new stream. Changes to the broker are minor — a new `SessionsBroker` class, a new `/sessions` route, and small hooks into the existing events and messages routes to ingest data. The four existing broker streams are unchanged.

- `services/ark-broker/` — minor additions only
- `openspec/specs/broker-sessions-api/spec.md` — new spec file
