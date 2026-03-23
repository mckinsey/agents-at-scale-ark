## Why

Ark processes queries in real time, emitting events, chunks, traces, and messages to the broker's append-only streams. These streams are the raw record — but to answer "what is happening right now?" or "what happened in session X?" a consumer currently has to join and filter four separate streams. The `/sessions` endpoint solves this by maintaining a **live, event-sourced materialized index** of sessions, conversations, and queries. It is updated continuously as events flow in. There is only ever one session record per session — it is simply kept up to date. SSE consumers receive the full session object each time it changes.

A sessions record looks like this:

```json
{
  "sessionId": "session-1773840591429",   // stable identifier set by the caller
  "name": "session-session-",             // auto-generated display name (TBC)
  "conversations": {
    "conv-9f3a21bc": {                    // keyed by conversationId once known
      "conversationId": "conv-9f3a21bc",  // → filter /messages?conversation_id=conv-9f3a21bc
      "status": "running",               // derived from query statuses below
      "queries": {
        "openai-query-abc123": {          // → filter /events?query_id=openai-query-abc123
          "status": "done",              //   or /stream/openai-query-abc123 for live chunks
          "completedAt": "2026-03-23T10:00:04.300Z"
        },
        "openai-query-def456": {          // second turn in the same conversation (TBC)
          "status": "running"
        }
      }
    }
  }
}
```

It's an index — `conversationId` tells you where to find messages, `queryName` tells you where to find events and chunks.

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
