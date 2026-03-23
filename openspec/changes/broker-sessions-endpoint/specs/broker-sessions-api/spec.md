## ADDED Requirements

### Requirement: Full store retrieval
The broker sessions endpoint SHALL return the complete sessions store as a JSON object when called without query parameters.

#### Scenario: Empty store
- **WHEN** `GET /v1/broker/sessions` is called and no queries have run
- **THEN** the response is `200` with body `{ "sessions": {} }`

#### Scenario: Populated store
- **WHEN** `GET /v1/broker/sessions` is called after queries have run
- **THEN** the response is `200` with body containing all sessions and their conversations

---

### Requirement: Session object lifecycle
The sessions store object SHALL reflect the real-time state of all sessions, conversations, and queries. The object evolves as events flow through the broker.

**Early stage** — first event arrives for a new query (no `conversationId` yet):

```json
{
  "sessions": {
    "session-1773840591429": {
      "sessionId": "session-1773840591429",
      "name": "session-session-",
      "conversations": {
        "openai-query-abc123": {
          "conversationId": "openai-query-abc123",
          "name": "noah (openai-query-abc123)",
          "agent": "default/noah",
          "targetType": "agent",
          "status": "running",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "lastActivity": "2026-03-23T10:00:00.100Z",
          "queries": {
            "openai-query-abc123": {
              "queryName": "openai-query-abc123",
              "queryNamespace": "default",
              "status": "running",
              "startedAt": "2026-03-23T10:00:00.000Z"
            }
          }
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:00.100Z"
    }
  }
}
```

**Mid stage** — `MemoryAddMessagesComplete` event arrives, attaching the real `conversationId`. A second query starts in the same conversation:

```json
{
  "sessions": {
    "session-1773840591429": {
      "sessionId": "session-1773840591429",
      "name": "session-session-",
      "conversations": {
        "conv-9f3a21bc": {
          "conversationId": "conv-9f3a21bc",
          "name": "noah (openai-query-abc123)",
          "agent": "default/noah",
          "targetType": "agent",
          "status": "running",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "lastActivity": "2026-03-23T10:00:12.500Z",
          "queries": {
            "openai-query-abc123": {
              "queryName": "openai-query-abc123",
              "queryNamespace": "default",
              "status": "done",
              "startedAt": "2026-03-23T10:00:00.000Z",
              "completedAt": "2026-03-23T10:00:04.300Z"
            },
            "openai-query-def456": {
              "queryName": "openai-query-def456",
              "queryNamespace": "default",
              "status": "running",
              "startedAt": "2026-03-23T10:00:12.000Z"
            }
          }
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:12.500Z"
    }
  }
}
```

**Late stage** — all queries done, conversation complete:

```json
{
  "sessions": {
    "session-1773840591429": {
      "sessionId": "session-1773840591429",
      "name": "session-session-",
      "conversations": {
        "conv-9f3a21bc": {
          "conversationId": "conv-9f3a21bc",
          "name": "noah (openai-query-abc123)",
          "agent": "default/noah",
          "targetType": "agent",
          "status": "done",
          "createdAt": "2026-03-23T10:00:00.000Z",
          "lastActivity": "2026-03-23T10:00:18.900Z",
          "queries": {
            "openai-query-abc123": {
              "queryName": "openai-query-abc123",
              "queryNamespace": "default",
              "status": "done",
              "startedAt": "2026-03-23T10:00:00.000Z",
              "completedAt": "2026-03-23T10:00:04.300Z"
            },
            "openai-query-def456": {
              "queryName": "openai-query-def456",
              "queryNamespace": "default",
              "status": "done",
              "startedAt": "2026-03-23T10:00:12.000Z",
              "completedAt": "2026-03-23T10:00:18.900Z"
            }
          }
        }
      },
      "createdAt": "2026-03-23T10:00:00.000Z",
      "lastActivity": "2026-03-23T10:00:18.900Z"
    }
  }
}
```

#### Scenario: Conversation status derives from query statuses
- **WHEN** any query in a conversation has `status: "running"`
- **THEN** the conversation `status` SHALL be `"running"`

#### Scenario: Conversation completes when all queries complete
- **WHEN** all queries in a conversation have `status: "done"` or `"error"`
- **THEN** the conversation `status` SHALL reflect the latest query's status

#### Scenario: ConversationId attached from events
- **WHEN** a `MemoryAddMessagesComplete` event arrives for a query
- **THEN** the conversation SHALL be re-keyed from the temporary `queryName` key to the real `conversationId`

---

### Requirement: SSE delta stream
The sessions endpoint SHALL support `?watch=true` to stream session changes via Server-Sent Events. Each SSE event carries only the changed session object, not the full store.

**SSE event format:**

```
: connected

data: {"sessionId":"session-1773840591429","session":{...full SessionEntry...}}

: heartbeat

data: {"sessionId":"session-1773840591429","session":{...updated SessionEntry...}}
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
- **WHEN** `GET /v1/broker/sessions/sessions/:session_id` is called for an existing session
- **THEN** the response is `200` with the full `SessionEntry` object

#### Scenario: Session not found
- **WHEN** `GET /v1/broker/sessions/sessions/:session_id` is called for an unknown session
- **THEN** the response is `404` with `{ "error": "Session not found" }`

---

### Requirement: Conversation retrieval
The endpoint SHALL support finding a conversation by its `conversationId` across all sessions.

#### Scenario: Conversation found
- **WHEN** `GET /v1/broker/sessions/conversations/:conversation_id` is called
- **THEN** the response is `200` with the `ConversationEntry` plus `sessionId` field

#### Scenario: Conversation not found
- **WHEN** the `conversationId` does not exist in any session
- **THEN** the response is `404` with `{ "error": "Conversation not found" }`

---

### Requirement: Store purge
The endpoint SHALL support purging all session data.

#### Scenario: Successful purge
- **WHEN** `DELETE /v1/broker/sessions` is called
- **THEN** the response is `200` and all sessions data is cleared
- **THEN** subsequent `GET /v1/broker/sessions` returns `{ "sessions": {} }`
