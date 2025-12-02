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

### Current Implementation (HTTP Transport)

```mermaid
graph TB
    subgraph "Event Sources"
        Controllers[Ark Controllers]
        Watchers[Event Watchers]
        K8s[Kubernetes Events]
        Argo[Argo Workflows]
    end

    subgraph "Ark Event Manager"
        API[POST /events<br/>API Endpoint]
        Consumer[HTTPEventConsumer<br/>Internal Queue]
        Processor[EventProcessor<br/>Deserialize & Route]
        EventStorage[EventStorage<br/>Persist Events]
        MemoryStorage[MemoryStorage<br/>Store Messages]
    end

    subgraph "Storage"
        EventsTable[(events table<br/>SQLite/PostgreSQL)]
        MessagesTable[(messages table<br/>SQLite/PostgreSQL)]
    end

    subgraph "Message API"
        MessageAPI[POST /messages<br/>MemoryInterface]
    end

    Controllers -->|Protobuf Events| API
    Watchers -->|Protobuf Events| API
    K8s -->|Protobuf Events| API
    Argo -->|Protobuf Events| API

    API -->|enqueue| Consumer
    Consumer -->|consume_batch| Processor
    Processor --> EventStorage
    EventStorage --> EventsTable

    MessageAPI --> MemoryStorage
    MemoryStorage --> MessagesTable

    style Controllers fill:#e1f5ff
    style Watchers fill:#e1f5ff
    style K8s fill:#e1f5ff
    style Argo fill:#e1f5ff
    style API fill:#fff4e1
    style Consumer fill:#fff4e1
    style Processor fill:#fff4e1
    style EventStorage fill:#e8f5e9
    style MemoryStorage fill:#e8f5e9
    style EventsTable fill:#f3e5f5
    style MessagesTable fill:#f3e5f5
    style MessageAPI fill:#fff4e1
```

### Future: Kafka Transport

With Kafka, the entry point would be **Kafka topics**, not POST `/events`:

```mermaid
graph TB
    subgraph "Event Sources"
        Controllers[Ark Controllers]
        Watchers[Event Watchers]
        K8s[Kubernetes Events]
        Argo[Argo Workflows]
    end

    subgraph "Transport Layer"
        Kafka[Kafka Topics<br/>ark-events]
    end

    subgraph "Ark Event Manager"
        Consumer[KafkaEventConsumer<br/>Subscribe to Topics]
        Processor[EventProcessor<br/>Deserialize & Route]
        EventStorage[EventStorage<br/>Persist Events]
        MemoryStorage[MemoryStorage<br/>Store Messages]
    end

    subgraph "Storage"
        EventsTable[(events table<br/>SQLite/PostgreSQL)]
        MessagesTable[(messages table<br/>SQLite/PostgreSQL)]
    end

    subgraph "Message API"
        MessageAPI[POST /messages<br/>MemoryInterface]
    end

    Controllers -->|Protobuf Events| Kafka
    Watchers -->|Protobuf Events| Kafka
    K8s -->|Protobuf Events| Kafka
    Argo -->|Protobuf Events| Kafka

    Kafka -->|consume_batch| Consumer
    Consumer --> Processor
    Processor --> EventStorage
    EventStorage --> EventsTable

    MessageAPI --> MemoryStorage
    MemoryStorage --> MessagesTable

    style Controllers fill:#e1f5ff
    style Watchers fill:#e1f5ff
    style K8s fill:#e1f5ff
    style Argo fill:#e1f5ff
    style Kafka fill:#ffe1f5
    style Consumer fill:#fff4e1
    style Processor fill:#fff4e1
    style EventStorage fill:#e8f5e9
    style MemoryStorage fill:#e8f5e9
    style EventsTable fill:#f3e5f5
    style MessagesTable fill:#f3e5f5
    style MessageAPI fill:#fff4e1
```

**Note**: POST `/events` could optionally remain as a bridge endpoint that publishes to Kafka, but it would not be the primary entry point.

## Component Architecture

```mermaid
graph LR
    subgraph "Transport Layer"
        HTTP[HTTP Transport<br/>EventPublisher/Consumer]
    end

    subgraph "API Layer"
        EventsAPI[Events API<br/>/events]
        MemoryAPI[Memory API<br/>/messages]
        StreamAPI[Stream API<br/>/stream]
    end

    subgraph "Core Processing"
        Processor[EventProcessor<br/>Deserialize & Route]
        Models[Event/Message Models<br/>SQLModel + Protobuf]
    end

    subgraph "Storage Interfaces"
        EventStorageI[EventStorageInterface]
        MemoryI[MemoryInterface]
        StreamI[StreamInterface]
    end

    subgraph "Storage Implementations"
        DatabaseStorage[DatabaseStorage<br/>SQLite/PostgreSQL]
        MemoryStorage[MemoryStorage<br/>In-Memory]
        StreamStorage[StreamStorage<br/>Query Events]
    end

    HTTP --> EventsAPI
    EventsAPI --> Processor
    MemoryAPI --> MemoryI
    StreamAPI --> StreamI

    Processor --> Models
    Processor --> EventStorageI
    Processor --> StreamI

    EventStorageI --> DatabaseStorage
    MemoryI --> MemoryStorage
    StreamI --> StreamStorage

    style HTTP fill:#e1f5ff
    style EventsAPI fill:#fff4e1
    style MemoryAPI fill:#fff4e1
    style StreamAPI fill:#fff4e1
    style Processor fill:#e8f5e9
    style Models fill:#e8f5e9
    style EventStorageI fill:#f3e5f5
    style MemoryI fill:#f3e5f5
    style StreamI fill:#f3e5f5
    style DatabaseStorage fill:#ffe0b2
    style MemoryStorage fill:#ffe0b2
    style StreamStorage fill:#ffe0b2
```

## Integration Test Flow

```mermaid
sequenceDiagram
    participant Test as Integration Test
    participant Fixture as Test Fixture
    participant Service as Event Manager
    participant Publisher as Mock Publisher
    participant Storage as Event Storage

    Test->>Fixture: Start service_process fixture
    Fixture->>Service: Start service (if not running)
    Service-->>Fixture: Health check ready
    Fixture-->>Test: Service URL

    Test->>Publisher: Create MockEventPublisher
    Test->>Publisher: Create test event
    Publisher->>Publisher: Convert to protobuf
    Publisher->>Service: POST /events (protobuf)
    Service->>Service: EventProcessor.deserialize
    Service->>Storage: persist_event()
    Storage-->>Service: Event stored
    Service-->>Publisher: 202 Accepted
    Publisher-->>Test: Response

    Test->>Service: Verify event processing
    Service-->>Test: Events processed

    Test->>Fixture: Test complete
    Fixture->>Service: Stop service (if started)
```

## Sessions and Correlation IDs

### Session Context

Events can be grouped together using **correlation IDs** (stored in the `correlation_id` field) to link related queries, API calls, and operations across the system. This enables:

- **Query Analysis**: Link all events from a single query execution
- **Workflow Tracking**: Track events across multiple related queries in a workflow
- **Telemetry**: Group events for observability and debugging

### Session ID vs Correlation ID vs Conversation ID

- **Session ID**: Ark-generated identifier that accumulates context across queries (MCP sessions, A2A contexts, conversation IDs). Managed by the Ark controller.
- **Correlation ID**: Used in events to link related operations. Can be set to a session ID, query ID, or any identifier that groups related events.
- **Conversation ID**: Separate from session IDs - used for conversation/message context. A session can have many conversations.

### Event Correlation

Events include a `correlation_id` field that can be used to:
- Link events from the same query execution
- Group events by session ID
- Track events across related operations

Example event correlation:
```python
# Events from the same query execution
Event(correlation_id="query-123", type="query", subtype="execution_start")
Event(correlation_id="query-123", type="query", subtype="execution_complete")
Event(correlation_id="query-123", type="workflow", subtype="succeeded")

# Events from the same session
Event(correlation_id="session-456", type="query", subtype="execution_start")
Event(correlation_id="session-456", type="mcp", subtype="call_complete")
Event(correlation_id="session-456", type="a2a", subtype="task_started")
```

### Streaming Events

Events can be streamed to clients for real-time monitoring:
- **HTTP/SSE Streaming**: Compatible with K8s WATCH protocol
- **Query-based Filtering**: Stream events by correlation_id, type, or other filters
- **Replay Capability**: Stream events from a specific timestamp

For more details on sessions and streaming design, see the [Sessions and Streaming Design Document](../../../docs/designs/sessions-and-streaming.md) (PR #446).

## Key Design Decisions

1. **Separation of Concerns**: Events (observability) and Messages (conversation) are stored separately
2. **Single Entry Point**: Messages arrive via direct HTTP API only (simpler, clearer separation)
3. **Event-Driven**: System telemetry flows through the event system
4. **Backward Compatible**: Direct message API maintains compatibility with ark-cluster-memory
5. **Correlation Support**: Events support correlation_id for linking related operations
6. **Streaming Ready**: Architecture supports event streaming for real-time monitoring

