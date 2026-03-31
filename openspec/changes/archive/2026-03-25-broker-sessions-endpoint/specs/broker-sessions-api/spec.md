## ADDED Requirements

### Requirement: Full store retrieval
The broker sessions endpoint SHALL return the complete sessions store as a JSON object when called without query parameters.

#### Scenario: Empty store
- **WHEN** `GET /v1/broker/sessions` is called and no queries have run
- **THEN** the response is `200` with body `{ "sessions": {} }`

#### Scenario: Populated store
- **WHEN** `GET /v1/broker/sessions` is called after queries have run
- **THEN** the response is `200` with body containing all sessions and their queries

---

### Requirement: Session object lifecycle
The sessions store object SHALL reflect the real-time state of all sessions and queries. The object evolves as events flow through the broker.

**Early stage** — first event arrives for a new query:

```json
{
  "sessions": {
    "session-123": {
      "sessionId": "session-123",
      "name": "session-session-",
      "queries": {
        "openai-query-abc123": {
          "name": "openai-query-abc123",
          "phase": "running",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "lastActivity": "2026-03-23T10:00:00.100Z"
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:00.100Z"
    }
  }
}
```

**Mid stage** — `conversationId` arrives, second query starts:

```json
{
  "sessions": {
    "session-123": {
      "sessionId": "session-123",
      "name": "session-session-",
      "queries": {
        "openai-query-abc123": {
          "name": "openai-query-abc123",
          "conversationId": "conv-9f3a21bc",
          "agent": "default/noah",
          "phase": "done",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "completedAt": "2026-03-23T10:00:04.300Z",
          "lastActivity": "2026-03-23T10:00:04.300Z"
        },
        "openai-query-def456": {
          "name": "openai-query-def456",
          "conversationId": "conv-9f3a21bc",
          "phase": "running",
          "createdAt": "2026-03-23T10:00:12.000Z",
          "lastActivity": "2026-03-23T10:00:12.500Z"
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:12.500Z"
    }
  }
}
```

**Late stage** — all queries done:

```json
{
  "sessions": {
    "session-123": {
      "sessionId": "session-123",
      "name": "session-session-",
      "queries": {
        "openai-query-abc123": {
          "name": "openai-query-abc123",
          "conversationId": "conv-9f3a21bc",
          "agent": "default/noah",
          "phase": "done",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "completedAt": "2026-03-23T10:00:04.300Z",
          "lastActivity": "2026-03-23T10:00:04.300Z"
        },
        "openai-query-def456": {
          "name": "openai-query-def456",
          "conversationId": "conv-9f3a21bc",
          "agent": "default/planner",
          "phase": "done",
          "createdAt": "2026-03-23T10:00:12.000Z",
          "completedAt": "2026-03-23T10:00:18.900Z",
          "lastActivity": "2026-03-23T10:00:18.900Z"
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:18.900Z"
    }
  }
}
```

#### Scenario: Query phase tracking
- **WHEN** a query is running
- **THEN** the query `phase` SHALL be `"running"`

#### Scenario: Query completion
- **WHEN** a query completes
- **THEN** the query `phase` SHALL be `"done"` and `completedAt` SHALL be set

#### Scenario: ConversationId attached from messages
- **WHEN** `POST /messages` arrives with a `conversation_id` and `query_id` matching a known query
- **THEN** the query's `conversationId` field SHALL be set

---

### Requirement: Side-effect ingestion from existing streams
The sessions store SHALL be enriched as a side effect of data arriving on the existing `/events` and `/messages` broker routes. No new ingestion path is required.

- `POST /events` → calls `sessions.ingestEvent(event.data)` to create/update sessions and queries
- `POST /messages` → calls `sessions.ingestMessage(conversationId, queryId)` to attach `conversationId`

Events provide: `sessionId`, query `name`, `agent`, `phase`, `error`. Messages provide: `conversationId`.

**Event reason → session mutation mapping:**

| Event reason | Mutation |
|---|---|
| `QueryExecutionStart` | Create session (if new `sessionId`), create query with `phase: "running"` |
| `AgentExecutionStart` | Set `agent` field on query (e.g. `"default/noah"`) |
| `LLMCallStart`, `ToolCallStart`, `MemoryGetMessagesStart` | Update `lastActivity` |
| `LLMCallComplete`, `ToolCallComplete`, `MemoryGetMessagesComplete` | Update `lastActivity` |
| `MemoryAddMessagesComplete` | Set `conversationId` on query (only event that carries it) |
| `QueryExecutionComplete` (no error) | Set `phase: "done"`, set `completedAt` |
| `QueryExecutionComplete` (with error) | Set `phase: "error"`, set `error` message |
| Any reason containing `Error` | Set `phase: "error"`, set `error` message |

**Message ingestion:**

| Route | Mutation |
|---|---|
| `POST /messages` with `conversation_id` + `query_id` | Set `conversationId` on matching query, update `lastActivity` |

#### Scenario: Event creates session and query
- **WHEN** a `QueryExecutionStart` event arrives with a new `sessionId`
- **THEN** a new session SHALL be created containing a new query with `phase: "running"`

#### Scenario: Agent execution populates agent field
- **WHEN** an `AgentExecutionStart` event arrives with an `agent` field
- **THEN** the query's `agent` field SHALL be set (e.g. `"default/noah"`)

#### Scenario: Event updates query phase
- **WHEN** a `QueryExecutionComplete` event arrives for an existing query
- **THEN** the query `phase` SHALL be updated to `"done"` (no error) or `"error"` (with error)

#### Scenario: Message attaches conversationId
- **WHEN** `POST /messages` arrives with `conversation_id` and `query_id`
- **THEN** the matching query's `conversationId` field SHALL be set

#### Scenario: Existing streams unchanged
- **WHEN** events or messages are posted to the broker
- **THEN** the existing `/events` and `/messages` append-only streams SHALL continue to function unchanged

---

### Requirement: SSE delta stream
The sessions endpoint SHALL support `?watch=true` to stream session changes via Server-Sent Events. Each SSE event carries only the changed session object, not the full store.

**SSE event format:**

```
: connected

data: {"sessionId":"session-123","session":{...full SessionEntry...}}

: heartbeat

data: {"sessionId":"session-123","session":{...updated SessionEntry...}}
```

**Why delta, not full store:** The sessions object grows as the system runs. Sending the full store on every change would be O(sessions) per event. Sending only the changed session is O(1) and lets clients do a simple replace: `localSessions[event.sessionId] = event.session`.

**Why no cursor (unlike `/events`, `/messages`, `/traces`, `/chunks`):** Sessions is a mutable object, not an append-only stream. There is no sequence number because a session mutates in-place rather than appending new records. On reconnect, the full current state is replayed as individual session events, so clients converge to correct state without tracking a position.

#### Scenario: Initial replay on connect
- **WHEN** a client connects to `GET /v1/broker/sessions?watch=true`
- **THEN** each existing session SHALL be sent as a separate SSE event immediately
- **THEN** subsequent events SHALL fire only when a session changes

#### Scenario: Delta on session change
- **WHEN** a new event updates a session
- **THEN** exactly one SSE event SHALL be sent containing only that session's updated object

#### Scenario: Filtered stream
- **WHEN** a client connects to `GET /v1/broker/sessions?watch=true&session_id=X`
- **THEN** only events for session X SHALL be sent

#### Scenario: Client reconnect convergence
- **WHEN** a client disconnects and reconnects
- **THEN** the full current state SHALL be replayed, giving the client accurate state with no gaps

---

### Requirement: Single session retrieval
The endpoint SHALL support retrieving a single session by ID.

#### Scenario: Session exists
- **WHEN** `GET /v1/broker/sessions/:session_id` is called for an existing session
- **THEN** the response is `200` with the full `SessionEntry` object

#### Scenario: Session not found
- **WHEN** `GET /v1/broker/sessions/:session_id` is called for an unknown session
- **THEN** the response is `404` with `{ "error": "Session not found" }`

---

### Requirement: Store purge
The endpoint SHALL support purging all session data.

#### Scenario: Successful purge
- **WHEN** `DELETE /v1/broker/sessions` is called
- **THEN** the response is `200` and all sessions data is cleared
- **THEN** subsequent `GET /v1/broker/sessions` returns `{ "sessions": {} }`
