## Context

The ark-broker currently has four append-only streams: events, messages, traces, chunks. Each uses `BrokerItemStream<T>` with sequence numbers, cursor-based pagination, and SSE watch. The `/sessions` endpoint is a different pattern — a single mutable JSON object (the sessions store) that is updated in-place as events flow in.

This design formalizes the endpoint for implementation.

## Goals / Non-Goals

**Goals:**
- Stable REST API for querying sessions and queries
- Delta-based SSE so clients can watch individual sessions mutate in real-time
- Data model that cleanly nests queries inside sessions
- File persistence with deferred writes to avoid write amplification

**Non-Goals:**
- Backfilling sessions from historical events (forward-only)
- Full-text search or filtering across sessions
- Authentication or authorization on the endpoint
- Replacing the existing four broker streams

## Decisions

### 1. Single mutable object, not a stream

Sessions is a `Record<sessionId, SessionEntry>` stored in memory and persisted as a single JSON file. This is different from the other broker endpoints which use `BrokerItemStream`.

**Why:** A session mutates over its lifecycle (phase changes, queries added, conversationId attached). An append-only stream would require consumers to replay and reduce events to derive current state. A mutable object gives consumers the current state directly.

**Alternative considered:** Storing session events in a `BrokerItemStream<SessionEvent>` and deriving the view on read. Rejected because it shifts complexity to every consumer and adds latency for reads.

### 2. Delta SSE, not full-store SSE

`?watch=true` sends individual changed session objects (`{ sessionId, session }`), not the full store on every change.

**Why:** As sessions accumulate, sending the full store on every event would be O(sessions) per change. Delta is O(1). Clients replace `localSessions[sessionId] = session` — no merge logic needed.

### 3. No cursor

Other broker endpoints use sequence-number cursors to resume streams. Sessions doesn't need this because:
- On reconnect, the full current state is replayed as individual session events
- There's no "missed events" problem — clients get the latest state, not a history

### 4. name as primary key, conversationId as metadata

Queries are the atoms of the data model, keyed by `name` (matches CRD metadata.name) directly inside the session. `conversationId` is a field on each query that links queries sharing the same chat thread.

**Why:** A query exists from the moment its first event arrives, before any `conversationId` is known. Using `name` as the key means no re-keying or temporary keys are needed. `conversationId` is simply attached as metadata when the `MemoryAddMessagesComplete` event arrives. Multiple queries with the same `conversationId` represent turns in the same conversation.

### 5. Deferred persistence

Writes to disk use a 2-second debounce. Multiple rapid `ingestEvent` calls batch into a single file write.

**Why:** A single query generates 5-15 events in quick succession. Writing on every event would cause unnecessary I/O. The 2-second window batches these into one write.

**Risk:** Up to 2 seconds of data loss on crash. Acceptable for an index that can be rebuilt.

## Risks / Trade-offs

- **No cursor / no history** → If a session is deleted or mutated, the previous state is lost. Clients always see current state only. → Acceptable for an index; the authoritative data is in the four existing streams.

- **Single file persistence** → The entire store is written on each save. Large stores will slow writes. → Mitigated by deferred saves and the fact that sessions are relatively low-cardinality (hundreds, not millions).

- **No TTL / no eviction** → Sessions accumulate indefinitely. → Future work: add max-age or max-sessions configuration.
