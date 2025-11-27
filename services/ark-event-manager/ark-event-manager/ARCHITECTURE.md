# Ark Event Manager - Architecture

## Events vs Messages: Conceptual Overview

### Events (System Telemetry)

**Purpose**: Track what happened in the system for observability, debugging, and analytics.

**Characteristics**:
- Structured schema with metadata (severity, type, subtype, source_type, source)
- Represent system state changes and operations
- Examples:
  - `type="query"`, `subtype="execution_start"` - Query execution began
  - `type="workflow"`, `subtype="succeeded"` - Workflow completed successfully
  - `type="pod"`, `subtype="log"` - Pod log entry
  - `type="error"`, `subtype="model_timeout"` - Error occurred

**Source**:
- Protobuf Event messages from Ark controllers
- Kubernetes events (via watchers)
- Argo Workflow events
- System services

**Storage**:
- `events` table (SQLModel `Event`)
- All events are persisted for querying and analysis
- Can be queried by correlation_id, type, timestamp, etc.

**API**:
- `POST /events` - Ingest events (protobuf format)
- Events flow through the event processor pipeline

### Messages (Conversation Content)

**Purpose**: Store conversation/chat history for agent context and memory.

**Characteristics**:
- Simple schema: session_id, query_id, message_data
- Represent user-assistant conversation turns
- Examples:
  - `{"role": "user", "content": "What is the weather?"}`
  - `{"role": "assistant", "content": "The weather is sunny."}`

**Source**:
- **Direct API**: `POST /messages` (MemoryInterface)

**Storage**:
- `messages` table (SQLModel `Message`)
- Organized by session_id and query_id
- Used for conversation context retrieval

**API**:
- `GET /messages?session_id=<id>` - Get conversation history
- `POST /messages` - Add conversation messages

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Event Sources                        │
│  (Controllers, Watchers, K8s, Argo)                    │
└───────────────────┬─────────────────────────────────────┘
                    │ Protobuf Events
                    ▼
            ┌───────────────┐
            │ POST /events  │
            └───────┬───────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   EventProcessor      │
        │  (Deserialize & Route)│
        └───────┬───────────────┘
                │
                ▼
        ┌───────────────┐
        │  Events       │
        │  Storage       │
        │                │
        │ (All events)   │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │  events       │
        │  table        │
        └───────────────┘

┌─────────────────────────────────────────────────────────┐
│              Direct Message API                         │
│  POST /messages (MemoryInterface)                      │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Messages     │
            │  Storage      │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  messages     │
            │  table        │
            └───────────────┘
```

## Key Design Decisions

1. **Separation of Concerns**: Events (observability) and Messages (conversation) are stored separately
2. **Single Entry Point**: Messages arrive via direct HTTP API only (simpler, clearer separation)
3. **Event-Driven**: System telemetry flows through the event system
4. **Backward Compatible**: Direct message API maintains compatibility with ark-cluster-memory

