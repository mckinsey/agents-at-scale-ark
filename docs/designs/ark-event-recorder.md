# Ark Event Recorder - Design Document

## Overview

The Ark Event Recorder (AER) is a high-throughput event collection and streaming system designed to capture, persist, and broadcast events from multiple sources across a Kubernetes-based workflow execution environment. It integrates with Ark's structured eventing system (PR #477) to collect events emitted by Ark controllers, along with events from Argo Workflows, Kubernetes events, and other sources.

**Key Goals:**
- **Replace ark-cluster-memory**: AER provides both streaming and memory functionality, allowing removal of the ark-cluster-memory service
- **Backward Compatible API**: AER implements the same HTTP API spec as ark-cluster-memory, so the Ark controller's `MemoryInterface` and `EventStreamInterface` work unchanged
- **Optional Service**: Cluster remains fully functional without AER (only K8s events, no streaming/memory)
- **Per-Namespace Deployment**: One AER instance per namespace (NS=tenant), sharing a single Kafka cluster
- **Multiple Protocols**: Support HTTP streaming (K8s WATCH compatible) and other protocols for flexibility

The system uses Kafka for reliable buffering, PostgreSQL for persistent storage with rich querying capabilities, and multiple streaming protocols (HTTP/SSE, GraphQL subscriptions) for real-time event delivery to clients.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    External Event Sources                          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Unified Event Watcher Service                            │   │
│  │  (Configurable event sources)                             │   │
│  │                                                            │   │
│  │  • K8s Events (with structured annotations from Ark)     │   │
│  │  • Argo Workflows (workflow state + pod logs)            │   │
│  │  • Custom event sources (configurable)                   │   │
│  │                                                            │   │
│  │  Note: Starts as single service, can split later if      │   │
│  │        needed for scale/deployment simplicity            │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│                         │   Extract/Normalize events            │
│                         │   Generate UUID                       │
│                         │   Filter (K8s+broker vs broker-only)  │
│                               │                                   │
│                    Publish to Kafka Topic                        │
└───────────────────────────────┼───────────────────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │       Kafka           │
                    │  Topic: "events"      │
                    │  Partitions: 3        │
                    │  Key: correlation_id  │
                    │  Retention: 7 days    │
                    └───────────┬───────────┘
                                │
                                │ Consumer Group:
                                │ "ark-event-recorder"
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│              Ark Event Recorder Service                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Kafka Consumer (Background Task)                         │   │
│  │  • Poll batch: max 100 events or 1 second timeout        │   │
│  │  • Manual offset commit (after DB success)               │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Batch Process Events                                     │   │
│  │  1. Deserialize protobuf from Kafka messages            │   │
│  │  2. Validate event schema                                │   │
│  │  3. Route by event type:                                 │   │
│  │     • Persistent events → PostgreSQL                     │   │
│  │     • Ephemeral chunks → In-memory (60min TTL)         │   │
│  │     • Fast mode → Pass-through only (no storage)       │   │
│  │  4. Convert protobuf payload to JSONB for PostgreSQL    │   │
│  │  5. Batch INSERT into PostgreSQL (persistent only)      │   │
│  │  6. Commit Kafka offsets on success                      │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Broadcast to Subscribers                                 │   │
│  │  • In-memory EventPubSub                                 │   │
│  │  • Multiple outbound protocols:                          │   │
│  │    - HTTP/SSE streaming (K8s WATCH compatible)          │   │
│  │    - GraphQL subscriptions (WebSocket)                  │   │
│  │    - Custom protocols (extensible)                      │   │
│  │  • Async queue per subscriber                           │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                            │                                      │
│            ┌───────────────┴───────────────┐                    │
│            │                                │                    │
│  ┌─────────▼─────────┐          ┌──────────▼────────┐          │
│  │  Streaming APIs    │          │  Cleanup Service   │          │
│  │  • HTTP/SSE        │          │  (Background Task) │          │
│  │  • GraphQL Sub     │          │  • Runs every 24h  │          │
│  │  • Memory API      │          │  • DELETE old rows │          │
│  │    (replaces       │          │  • Expire ephemeral │          │
│  │     cluster-memory)│          │    chunks (60min)  │          │
│  └───────────────────┘          └────────────────────┘          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Query & Memory APIs                                      │   │
│  │                                                           │   │
│  │  • Memory HTTP API (implements MemoryInterface)         │   │
│  │    - GET /messages?session_id={sessionId}              │   │
│  │    - POST /messages                                    │   │
│  │  • Streaming HTTP API (implements EventStreamInterface)│   │
│  │    - GET /stream/{queryId} (SSE)                      │   │
│  │    - POST /stream/{queryId} (NDJSON)                   │   │
│  │    - POST /stream/{queryId}/complete                   │   │
│  │  • GraphQL API (events, messages, subscriptions)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   PostgreSQL          │
                    │                       │
                    │   events table        │
                    │   • 10 core fields    │
                    │   • JSONB payload     │
                    │   • Multiple indexes  │
                    │                       │
                    │   messages table      │
                    │   (conversation history)│
                    │   • sessionId         │
                    │   • queryId           │
                    │   • message content   │
                    │   • timestamps        │
                    └───────────────────────┘
```

## Integration with Ark Structured Eventing (PR #477)

Ark controllers emit structured events using the eventing package introduced in PR #477. These events are stored in Kubernetes Event resources with structured data in the `ark.mckinsey.com/event-data` annotation.

### Event Flow from Ark Controllers

1. **Ark Controller** (Query, Agent, Team, Tool, Model, etc.) uses eventing recorders
2. **Eventing Recorder** calls `EmitStructured()` with structured data
3. **Kubernetes Event** is created with:
   - Standard K8s event fields (reason, message, type)
   - Annotation: `ark.mckinsey.com/event-data` containing JSON with:
     - `queryId`, `queryName`, `queryNamespace`
     - `sessionId`
     - `timestamp`, `durationMs`
     - Operation-specific fields (e.g., `toolName`, `agentName`, `promptTokens`, etc.)
4. **Ark-Watcher** watches K8s events, extracts structured data, normalizes to AER schema
5. **Kafka** receives normalized events with `correlation_id = sessionId` (or `queryId` if no session)

### Example: QueryExecutionStart Event

**Kubernetes Event (from PR #477):**
```yaml
apiVersion: v1
kind: Event
metadata:
  annotations:
    ark.mckinsey.com/event-data: |
      {
        "queryId": "550e8400-e29b-41d4-a716-446655440000",
        "queryName": "my-query",
        "queryNamespace": "default",
        "sessionId": "sess-123",
        "timestamp": "2025-01-15T10:30:00.000Z",
        "message": "Executing query my-query"
      }
reason: QueryExecutionStart
type: Normal
involvedObject:
  kind: Query
  name: my-query
  namespace: default
```

**Normalized AER Event (Protobuf):**
```protobuf
Event {
  event_id: "660f9511-f39c-52e5-b827-557766551111"
  correlation_id: "sess-123"
  timestamp: {
    seconds: 1736943000
    nanos: 0
  }
  severity: EVENT_SEVERITY_INFO
  type: "query"
  subtype: "execution_start"
  source_type: EVENT_SOURCE_TYPE_ARK_CONTROLLER
  source: "query-controller"
  version: "v1"
  payload: {
    fields: {
      "queryId": { string_value: "550e8400-e29b-41d4-a716-446655440000" }
      "queryName": { string_value: "my-query" }
      "queryNamespace": { string_value: "default" }
      "sessionId": { string_value: "sess-123" }
    }
  }
}
```

**Note**: Events are serialized as binary protobuf for Kafka transmission, but can be converted to JSON for GraphQL API responses and PostgreSQL storage (as JSONB).

## Event Schema

### Protobuf Schema Definition

All events flowing through the system use Protocol Buffers for efficient serialization and schema evolution. The event schema is defined in `ark/eventing/proto/event.proto`:

```protobuf
syntax = "proto3";

package ark.eventing.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/struct.proto";

enum EventSeverity {
  EVENT_SEVERITY_UNSPECIFIED = 0;
  EVENT_SEVERITY_DEBUG = 1;
  EVENT_SEVERITY_INFO = 2;
  EVENT_SEVERITY_WARNING = 3;
  EVENT_SEVERITY_ERROR = 4;
  EVENT_SEVERITY_CRITICAL = 5;
}

enum EventSourceType {
  EVENT_SOURCE_TYPE_UNSPECIFIED = 0;
  EVENT_SOURCE_TYPE_ARK_CONTROLLER = 1;
  EVENT_SOURCE_TYPE_WATCHER = 2;
  EVENT_SOURCE_TYPE_SERVICE = 3;
  EVENT_SOURCE_TYPE_USER = 4;
}

message Event {
  // Unique identifier for this event (generated by watcher)
  string event_id = 1;  // UUID format
  
  // Groups related events (e.g., session ID, query ID)
  string correlation_id = 2;
  
  // When the event occurred (from source)
  google.protobuf.Timestamp timestamp = 3;
  
  // Event severity level
  EventSeverity severity = 4;
  
  // Event category (e.g., "query", "workflow", "pod", "k8s_event")
  string type = 5;
  
  // Event subcategory (e.g., "execution_start", "execution_complete", "failed", "log")
  string subtype = 6;
  
  // Kind of source
  EventSourceType source_type = 7;
  
  // Specific source identifier (e.g., "query-controller", "argo-watcher")
  string source = 8;
  
  // Schema version (e.g., "v1")
  string version = 9;
  
  // Flexible data specific to event type (JSON-compatible structure)
  google.protobuf.Struct payload = 10;
}
```

### Schema Benefits

Using protobuf provides several advantages:

1. **Performance**: Binary serialization is faster and produces smaller payloads than JSON
2. **Schema Evolution**: Backward/forward compatibility through field numbers and optional fields
3. **Type Safety**: Strong typing prevents schema mismatches
4. **Efficiency**: Smaller Kafka message sizes reduce network and storage overhead
5. **Language Agnostic**: Generated code available for Go, Python, TypeScript, etc.

### Normalized Event Format

All events flowing through the system conform to the protobuf schema above:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_id` | string (UUID) | Yes | Unique identifier for this event (generated by watcher) |
| `correlation_id` | string | Yes | Groups related events (e.g., session ID, query ID) |
| `timestamp` | Timestamp | Yes | When the event occurred (from source) |
| `severity` | EventSeverity enum | Yes | DEBUG, INFO, WARNING, ERROR, CRITICAL |
| `type` | string | Yes | Event category (e.g., "query", "workflow", "pod", "k8s_event") |
| `subtype` | string | Yes | Event subcategory (e.g., "execution_start", "execution_complete", "failed", "log") |
| `source_type` | EventSourceType enum | Yes | Kind of source (e.g., "ark_controller", "watcher", "service", "user") |
| `source` | string | Yes | Specific source identifier (e.g., "query-controller", "argo-watcher") |
| `version` | string | Yes | Schema version (e.g., "v1") |
| `payload` | Struct | Yes | Flexible data specific to event type (JSON-compatible) |

### PostgreSQL Table Definition

```sql
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    correlation_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    severity VARCHAR(50) NOT NULL,
    type VARCHAR(100) NOT NULL,
    subtype VARCHAR(100) NOT NULL,
    source_type VARCHAR(100) NOT NULL,
    source VARCHAR(255) NOT NULL,
    version VARCHAR(10) NOT NULL DEFAULT 'v1',
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core indexes for common query patterns
CREATE INDEX idx_event_id ON events(event_id);
CREATE INDEX idx_correlation_id ON events(correlation_id);
CREATE INDEX idx_timestamp_desc ON events(timestamp DESC);
CREATE INDEX idx_correlation_timestamp ON events(correlation_id, timestamp DESC);
CREATE INDEX idx_source ON events(source);
CREATE INDEX idx_type_subtype ON events(type, subtype);

-- JSONB index for payload querying
CREATE INDEX idx_payload_gin ON events USING GIN (payload);

-- Expression indexes for frequently-queried payload fields
CREATE INDEX idx_query_id ON events ((payload->>'queryId'));
CREATE INDEX idx_session_id ON events ((payload->>'sessionId'));
```

## Component 1: Unified Event Watcher Service

### Purpose
A single, configurable service that watches multiple event sources (Kubernetes Events, Argo Workflows, etc.), normalizes them to the standard event format, and publishes events via the `EventPublisher` interface. **Core part of Ark**

**Note**: Initially implements `HTTPEventPublisher` (direct HTTP to AER). Can be swapped to `FluentdEventPublisher`, `KafkaEventPublisher`, or other implementations via configuration when buffering/replay capabilities are needed.

**Design Philosophy**: Start with a single unified service for deployment simplicity. Can be split into dedicated services later if needed for scale or operational reasons.

### Event Emission from Ark Controller

The Ark controller uses an `EventEmitter` interface abstraction that allows different implementations:

**EventEmitter Interface** (in Ark controller):
```go
type EventEmitter interface {
    EmitEvent(ctx context.Context, eventType, reason string, data EventData)
}
```

**Implementations:**
- **KubernetesEventEmitter**: Emits to K8s Events API (for administrative events)
- **HTTPEventEmitter**: Emits directly to AER via HTTP (for query execution tracking)
- **HybridEventEmitter**: Routes events based on type (K8s + AER, or AER only)

**Event Routing in Controller:**
- **Query execution tracking events** (e.g., `QueryExecutionStart`, `MemoryGetMessagesComplete`, `TeamExecutionStart`): Emit to AER via HTTP/gRPC for persistent storage and streaming
- **Administrative events** (e.g., `ModelProbeFailed`, `ModelNotAvailable`, `StatusChanged`): Emit to K8s Events API for standard K8s observability

This allows the controller to use a unified event model while routing events to appropriate destinations based on their purpose.

### Responsibilities

1. **Configurable Event Sources**: Watch different event types based on configuration:
   - **Kubernetes Events**: Events with `ark.mckinsey.com/event-data` annotation (from Ark controllers)
   - **Standard K8s Events**: Pod, container, resource issues
   - **Argo Workflows**: Workflow state changes and pod logs
   - **Custom Sources**: Extensible for future event sources

2. **Event Filtering**: Route events based on configuration:
   - **K8s + Broker**: Events that go to both K8s events API and event broker (e.g., core query events for backward compatibility)
   - **Broker Only**: Events that skip K8s events API and go directly to event broker (future: granular events to reduce etcd pressure)
   - **Query Execution Tracking**: Structured logs/events from controller stdout (via Fluentd or direct HTTP) for query execution lifecycle
   - **Administrative Events**: Standard K8s events for resource lifecycle (ModelNotAvailable, StatusChanged, etc.)

3. **Event Normalization**: Convert all event types to standardized AER protobuf format

4. **UUID Generation**: Generate `event_id` before publishing

5. **Event Publishing**: Use `EventPublisher` interface to publish normalized events:
   - Serialize events to protobuf binary format
   - Call `publisher.publish(event, correlation_id)`
   - Implementation (HTTP/Fluentd/Kafka/Redis) is configurable
   - **Primary Interface**: HTTP/gRPC endpoints (preferred for programmatic emission)
   - **Alternative**: Filesystem-based forwarding via Fluentd for structured logs (when HTTP not available)

### Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ark-event-watcher-config
  namespace: default
data:
  # Enable/disable event sources
  watchK8sEvents: "true"
  watchArgoWorkflows: "true"
  
  # Event routing
  # "k8s+broker" = emit to K8s events API AND event broker (HTTP/Kafka/etc)
  # "broker-only" = skip K8s events API, go directly to event broker
  
  # Event broker configuration
  eventBroker:
    type: "http"  # Options: "http", "fluentd", "kafka", "redis-streams"
    config:
      # For HTTP: AER service URL (direct connection)
      aerUrl: "http://ark-event-recorder:8080"
      # For Fluentd: (when type=fluentd)
      # fluentdUrl: "http://fluentd:9880/events"
      # For Kafka: (when type=kafka)
      # brokers: ["kafka:9092"]
      # topic: "events"
  eventRouting: |
    query.*: k8s+broker
    agent.*: k8s+broker
    workflow.*: broker-only
    pod.log: broker-only
```

### Event Normalization for Ark Controller Events

**Ark Controller Event (with structured annotation) → Normalized Event:**
- `event_id`: Generate new UUID
- `correlation_id`: Extract from `payload.sessionId` (if present) or `payload.queryId`, fallback to `involvedObject.name`
- `timestamp`: Extract from `payload.timestamp` or use `event.firstTimestamp`
- `type`: Map from `involvedObject.kind` (e.g., "Query" → "query", "Agent" → "agent")
- `subtype`: Map from `reason` (e.g., "QueryExecutionStart" → "execution_start", "QueryExecutionComplete" → "execution_complete")
- `severity`: Map from `type` → "Normal" = INFO, "Warning" = WARNING
- `source_type`: "ark_controller"
- `source`: Extract from `involvedObject.kind` (lowercase) + "-controller" (e.g., "query-controller")
- `payload`: Full structured data from annotation + additional K8s event metadata

### Correlation ID Strategy

The `correlation_id` field is designed to tie related events together and is **not necessarily unique**. Multiple events can (and typically will) share the same correlation_id to enable querying all events related to a particular execution context.

**For Ark events**: `correlation_id = sessionId` (from `payload.sessionId`)
- If `sessionId` is present in the structured event data, use it as `correlation_id`
- Fallback to `queryId` if no `sessionId` is available
- Last resort: Use `involvedObject.name` (typically query/agent/team name)

This allows all events from a query execution (or session) to be queried together.

### Argo Workflow Monitoring

When `watchArgoWorkflows: "true"` is configured, the unified watcher handles:

1. **Workflow State Monitoring**: Watch Argo Workflow resources for phase changes (Pending, Running, Succeeded, Failed, Error)
2. **Pod Log Streaming**: Stream stdout/stderr from workflow pods
3. **Event Normalization**: Convert Argo-specific data to standardized event format
4. **UUID Generation**: Generate `event_id` before publishing to Kafka
5. **Kafka Publishing**: Serialize normalized events to protobuf binary format and send to "events" topic with `correlation_id` as partition key

**Note**: Argo workflow monitoring can be deployed as part of the Argo marketplace entry, but uses the same unified watcher service architecture.

### Event Normalization

**Workflow Phase Mapping:**
- Pending → `type="workflow"`, `subtype="pending"`, `severity="INFO"`
- Running → `type="workflow"`, `subtype="started"`, `severity="INFO"`
- Succeeded → `type="workflow"`, `subtype="succeeded"`, `severity="INFO"`
- Failed → `type="workflow"`, `subtype="failed"`, `severity="ERROR"`
- Error → `type="workflow"`, `subtype="error"`, `severity="ERROR"`

**Pod Log Normalization:**
- `type="pod"`, `subtype="log"`
- `severity` can be parsed from log line (ERROR/WARN keywords) or default to INFO
- `payload` contains: pod_name, container, log_line, stream (stdout/stderr)

### Correlation ID Strategy

**For Argo workflows**: `correlation_id = session_id`
- The correlation_id should map to the **session ID** that initiated or is associated with the workflow
- This allows all events from a workflow execution to be queried by session
- In practice, this is typically stored in workflow metadata or labels (e.g., `workflow.metadata.labels['session-id']`)
- If no session ID is available, fall back to `workflow.metadata.name` as correlation_id

## Component 2: Ark Event Recorder Service

### Purpose
Reliably consume events via the `EventConsumer` interface, persist to PostgreSQL with batch processing, and broadcast to subscribers via multiple protocols. **Core part of Ark**. Replaces ark-cluster-memory service functionality.

**Note**: Initially implements `HTTPEventConsumer` (receives events via HTTP endpoint). Can be swapped to `KafkaEventConsumer` or other implementations via configuration when buffering/replay capabilities are needed.

**Interface Compatibility**: AER implements the same HTTP API endpoints as ark-cluster-memory (`POST /messages`, `GET /messages`, `/stream/{queryId}`), so the Ark controller's `MemoryInterface` (HTTPMemory) and `EventStreamInterface` implementations continue to work without changes. The controller makes HTTP calls to AER instead of ark-cluster-memory, but the API contract remains identical.

### Processing Flow

1. **Consume Events**: Use `EventConsumer` interface to poll for events:
   - Call `consumer.consume_batch(max_events=100, timeout=1.0)`
   - Returns list of (event, correlation_id) tuples
   - Implementation (HTTP/Kafka/Redis) is configurable
2. **Deserialize Protobuf**: Events are already deserialized by consumer (or deserialize if needed)
3. **Validate**: Check event schema compliance and version. Discard malformed events or events with unsupported versions (log warning and continue processing batch)
4. **Route by Event Type**:
   - **Persistent Events**: Query execution, agent operations, workflow state → PostgreSQL
   - **Ephemeral Chunks**: LLM streaming chunks, A2A task chunks → In-memory cache (60min TTL)
   - **Fast Mode**: High-frequency events → Pass-through only (no storage, immediate broadcast)
5. **Convert to JSONB**: Convert protobuf payload to JSONB for PostgreSQL storage (maintains queryability)
6. **Batch Insert**: Write persistent events to PostgreSQL in single transaction using `ON CONFLICT (event_id) DO NOTHING` to handle duplicate deliveries
7. **Commit**: Call `consumer.commit()` after successful database write (for at-least-once delivery semantics)
8. **Broadcast**: Publish events via multiple protocols:
   - HTTP/SSE streaming (K8s WATCH compatible)
   - GraphQL subscriptions (WebSocket)
   - In-memory pub/sub for real-time delivery

### Event Type Routing

Events are categorized and routed differently based on their type:

| Event Type | Storage | TTL | Use Case |
|------------|---------|-----|----------|
| Query execution events | PostgreSQL | Configurable (default 30 days) | Audit, debugging, analysis |
| Agent/Team operations | PostgreSQL | Configurable (default 30 days) | Observability, telemetry |
| Workflow state changes | PostgreSQL | Configurable (default 30 days) | Workflow tracking |
| LLM streaming chunks | In-memory | 60 minutes | Real-time streaming only |
| A2A task chunks | In-memory | 60 minutes | Real-time streaming only |
| High-frequency metrics | Fast mode (no storage) | N/A | Real-time monitoring only |

### Key Design Decisions

1. **Batch Processing**: Fetches up to 100 events at once, reducing database round-trips significantly
2. **Manual Commit**: Only commits after successful database write, ensuring at-least-once delivery (implementation-specific: Kafka offsets, HTTP no-op, etc.)
3. **Ordering**: `correlation_id` is used for ordering (Kafka partition key, HTTP header, etc.), ensuring all events for a session/workflow stay ordered
4. **Error Handling**: On failure, don't commit → broker replays events → eventual consistency (Kafka) or retry logic (HTTP)
5. **Atomicity**: Database insert and pubsub broadcast happen sequentially; if pubsub fails, event is still persisted
6. **Version-Aware Parsing**: Event parser must be version-aware, supporting the current schema version (v1) and gracefully rejecting unsupported versions

## Kafka Configuration

### Topic Configuration
```
Topic: events
Partitions: 3                    # Allows parallel consumption by multiple consumers
Replication Factor: 3            # Durability across broker failures
Retention: 7 days                # Allows event replay for debugging/recovery
Compression: snappy              # Good balance of speed and compression ratio
Min In-Sync Replicas: 2          # Requires 2 replicas to acknowledge write
```

### Producer Configuration (Watchers)
- **acks**: 1 (wait for leader acknowledgment only, not all replicas - balances speed and safety)
- **compression**: snappy (protobuf already compresses well, but snappy adds extra compression)
- **batching**: Small linger time (10ms) for better throughput
- **partition key**: correlation_id (ensures ordering per session/workflow)
- **serializer**: Protobuf binary format (Content-Type: application/x-protobuf)

### Consumer Configuration (Ark Event Recorder)
- **group_id**: "ark-event-recorder"
- **auto_offset_reset**: "earliest" (start from beginning if no offset exists)
- **enable_auto_commit**: false (manual commit after DB write for reliability)
- **max_poll_records**: 100 (batch size)
- **max_poll_interval**: 5 minutes (time allowed to process batch)
- **deserializer**: Protobuf binary format (Content-Type: application/x-protobuf)

### Why Kafka?

1. **Decoupling**: Event ingestion and persistence are independent. Fast ingestion doesn't wait for slow database writes.
2. **Buffering**: Handles traffic spikes. If consumers fall behind, events accumulate safely in Kafka.
3. **Reliability**: Replicated storage across brokers. Service restarts don't lose events.
4. **Replay Capability**: Can reprocess events from any point in time within retention period.
5. **Ordering**: Partition key guarantees ensures events for a session/workflow stay in order.

## Event Broker Interface (Abstraction Layer)

### Design Philosophy

The event broker is abstracted behind a clean interface, allowing the system to start with a simple implementation (direct HTTP) and swap in a more sophisticated broker (Kafka, Redis Streams, etc.) later without changing watcher or AER code.

### Interface Specification

**EventPublisher Interface** (used by watchers):
```python
class EventPublisher:
    async def publish(self, event: Event, correlation_id: str) -> None:
        """
        Publish an event to the broker.
        
        Args:
            event: Protobuf Event object (serialized as binary)
            correlation_id: Used for partitioning/ordering (e.g., session_id, query_id)
        """
        pass
```

**EventConsumer Interface** (used by AER):
```python
class EventConsumer:
    async def consume_batch(
        self, 
        max_events: int = 100, 
        timeout: float = 1.0
    ) -> list[tuple[Event, str]]:
        """
        Consume a batch of events.
        
        Args:
            max_events: Maximum number of events to return
            timeout: Maximum time to wait for events (seconds)
        
        Returns:
            List of (event, correlation_id) tuples
        """
        pass
    
    async def commit(self) -> None:
        """
        Commit processed events (for at-least-once delivery semantics).
        Only called after successful database write.
        """
        pass
```

### Implementation Phases

#### Phase 1: Direct HTTP (Initial Implementation)

Start with the simplest implementation - watchers POST directly to AER:

**HTTPEventPublisher** (in watchers):
```python
class HTTPEventPublisher(EventPublisher):
    def __init__(self, aer_base_url: str):
        self.aer_url = f"{aer_base_url}/events"
    
    async def publish(self, event: Event, correlation_id: str) -> None:
        # Serialize protobuf to binary
        event_bytes = event.SerializeToString()
        # POST to AER with correlation_id header
        await http.post(
            self.aer_url,
            body=event_bytes,
            headers={"X-Correlation-ID": correlation_id},
            content_type="application/x-protobuf"
        )
```

**HTTPEventConsumer** (in AER):
```python
class HTTPEventConsumer(EventConsumer):
    def __init__(self):
        self.queue = asyncio.Queue()
    
    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[Event, str]]:
        # Poll internal in-memory queue
        events = []
        deadline = time.time() + timeout
        while len(events) < max_events and time.time() < deadline:
            try:
                event, correlation_id = await asyncio.wait_for(
                    self.queue.get(), 
                    timeout=min(0.1, deadline - time.time())
                )
                events.append((event, correlation_id))
            except asyncio.TimeoutError:
                break
        return events
    
    async def commit(self) -> None:
        # No-op for HTTP (events already processed)
        pass

# HTTP endpoint receives events and enqueues
@app.post("/events")
async def receive_event(request: Request):
    correlation_id = request.headers.get("X-Correlation-ID")
    event_bytes = await request.body()
    event = Event()
    event.ParseFromString(event_bytes)
    await consumer.queue.put((event, correlation_id))
    return {"status": "accepted"}
```

**Benefits of Phase 1:**
- No external dependencies (no Kafka/Redis to manage)
- Simple to implement and test
- Fast to get started
- Easy to debug (direct HTTP calls)

**Limitations:**
- No buffering (AER must be available)
- No replay capability
- Tight coupling between watchers and AER

#### Phase 2: Swap in Kafka (When Needed)

When you need buffering, replay, or higher reliability, swap implementations:

**KafkaEventPublisher** (in watchers):
```python
class KafkaEventPublisher(EventPublisher):
    def __init__(self, kafka_brokers: list[str], topic: str):
        self.producer = KafkaProducer(
            bootstrap_servers=kafka_brokers,
            value_serializer=lambda v: v.SerializeToString(),
            key_serializer=lambda k: k.encode() if k else None
        )
        self.topic = topic
    
    async def publish(self, event: Event, correlation_id: str) -> None:
        # Publish to Kafka with correlation_id as partition key
        await self.producer.send(
            self.topic,
            value=event,
            key=correlation_id
        )
```

**KafkaEventConsumer** (in AER):
```python
class KafkaEventConsumer(EventConsumer):
    def __init__(self, kafka_brokers: list[str], topic: str, group_id: str):
        self.consumer = KafkaConsumer(
            topic,
            bootstrap_servers=kafka_brokers,
            group_id=group_id,
            value_deserializer=lambda m: Event().ParseFromString(m),
            key_deserializer=lambda k: k.decode() if k else None,
            enable_auto_commit=False,  # Manual commit after DB write
            max_poll_records=100
        )
        self.pending_offsets = []
    
    async def consume_batch(
        self, max_events: int = 100, timeout: float = 1.0
    ) -> list[tuple[Event, str]]:
        # Poll from Kafka
        events = []
        deadline = time.time() + timeout
        while len(events) < max_events and time.time() < deadline:
            records = self.consumer.poll(timeout_ms=int((deadline - time.time()) * 1000))
            for topic_partition, messages in records.items():
                for msg in messages:
                    events.append((msg.value, msg.key))
                    self.pending_offsets.append((topic_partition, msg.offset + 1))
        return events
    
    async def commit(self) -> None:
        # Commit Kafka offsets
        for topic_partition, offset in self.pending_offsets:
            self.consumer.commit({topic_partition: offset})
        self.pending_offsets.clear()
```

**Migration Path:**
1. Watchers and AER use the same interface - no code changes needed
2. Swap implementations via configuration:
   ```yaml
   eventBroker:
     type: "fluentd"  # or "http", "kafka", "redis-streams"
     config:
       fluentdUrl: "http://fluentd:9880/events"
       # Fluentd forwards to AER with buffering
   ```
3. Both implementations can coexist during migration
4. **Progression**: HTTP → Fluentd (when buffering needed) → Kafka (when scale/replay needed)

### Alternative Implementations

#### Fluentd (Lightweight Buffering Alternative)

**FluentdEventPublisher/Consumer** - Use Fluentd as a lightweight buffering layer before jumping to Kafka:

**Benefits:**
- **HTTP IN → Buffering → HTTP OUT**: Fluentd can accept HTTP input, buffer events, and forward to AER via HTTP
- **Filesystem buffering**: Can also buffer to filesystem with PVC for durability
- **Retry logic**: Built-in retry and backpressure handling
- **Less opinionated**: Well-documented in K8s ecosystem
- **OTEL support**: Has OpenTelemetry plugin for integration
- **Lower operational overhead**: Simpler than Kafka for moderate scale

**Use Case:**
- When you need buffering but don't need Kafka's full feature set
- When you want to leverage existing K8s logging infrastructure
- As a stepping stone before Kafka (can migrate later)

**Configuration:**
```yaml
eventBroker:
  type: "fluentd"
  config:
    # Fluentd HTTP input endpoint
    fluentdUrl: "http://fluentd:9880/events"
    # Fluentd forwards to AER
    aerUrl: "http://ark-event-recorder:8080/events"
```

**Note**: Fluentd can also be used for filesystem-based event forwarding (structured JSON logs), but HTTP/gRPC endpoints are preferred for programmatic event emission from controllers and services.

#### Redis Streams

- Similar interface to Kafka
- Simpler operations, less durable
- Good for moderate volume

#### PostgreSQL Queue Table

- Use database as queue
- Simple, but less efficient than dedicated brokers
- Good for low volume or when you want to avoid extra infrastructure

### Benefits of Abstraction

1. **Flexibility**: Start simple, scale up when needed
2. **Testability**: Easy to mock for unit tests
3. **No Lock-in**: Swap implementations without changing business logic
4. **Incremental Complexity**: Add sophisticated features only when needed
5. **Same Protobuf Schema**: Event format doesn't change regardless of transport

## API Endpoints

AER implements the same HTTP API spec as ark-cluster-memory, allowing the Ark controller to continue using the existing `MemoryInterface` without changes. The controller calls AER via HTTP using the same endpoints it currently uses for ark-cluster-memory.

### Memory HTTP API (Implements MemoryInterface for Ark Controller)

**Get Messages** - `GET /messages?session_id={sessionId}`
- Retrieve conversation history for a session
- Returns messages in chronological order
- **Used by**: Ark controller's `MemoryInterface.GetMessages()`
- **Response**: JSON array of message records

**Add Messages** - `POST /messages`
- Content-Type: `application/json`
- Request body: `{ "session_id": "...", "query_id": "...", "messages": [...] }`
- Add new messages to conversation history
- **Used by**: Ark controller's `MemoryInterface.AddMessages()`
- **Response**: 200 OK on success

**Note**: These endpoints maintain backward compatibility with the existing Memory HTTP spec, so the controller's `MemoryInterface` implementation (HTTPMemory) works unchanged with AER.

### HTTP/SSE Streaming API (Replaces ark-cluster-memory streaming)

**Read Stream** - `GET /stream/{queryId}`
- Server-Sent Events (SSE) for real-time streaming
- K8s WATCH compatible (HTTP streaming)
- Query parameters:
  - `from-beginning=true`: Send all existing messages first, then stream new ones
  - `wait-for-query=<timeout>`: Wait for query execution to start
- **Used by**: Clients consuming streaming responses

**Write Stream** - `POST /stream/{queryId}`
- Content-Type: `application/x-ndjson`
- Newline-delimited JSON chunks in OpenAI format
- Used by Query Controller to write streaming chunks
- **Note**: HTTP API uses NDJSON format, but internally events are stored/transmitted as protobuf via Kafka
- **Used by**: Ark controller's EventStreamInterface implementation

**Complete Stream** - `POST /stream/{queryId}/complete`
- Marks query execution as complete
- Closes connections to consumers
- **Used by**: Ark controller to signal stream completion

### GraphQL API

```graphql
scalar DateTime
scalar JSON
scalar UUID

type Event {
  id: ID!
  eventId: UUID!
  correlationId: String!
  timestamp: DateTime!
  severity: String!
  type: String!
  subtype: String!
  sourceType: String!
  source: String!
  version: String!
  payload: JSON!
  createdAt: DateTime!
}

type Message {
  id: ID!
  sessionId: String!
  queryId: String
  role: String!
  content: String!
  timestamp: DateTime!
}

type Query {
  # Get events for a specific correlation ID (session ID, query ID, etc.)
  events(correlationId: String!): [Event!]!

  # Get single event by event_id
  event(eventId: UUID!): Event

  # Query events with filters
  eventsByType(type: String!, subtype: String, limit: Int, offset: Int): [Event!]!
  
  # Query events by time range
  eventsByTimeRange(startTime: DateTime!, endTime: DateTime!, correlationId: String): [Event!]!
  
  # Get conversation messages
  messages(sessionId: String!): [Message!]!
  messagesByQuery(queryId: String!): [Message!]!
}

type Subscription {
  # Subscribe to all events (no filtering in initial version)
  events: Event!
  
  # Subscribe to events for a specific correlation ID
  eventsByCorrelation(correlationId: String!): Event!
}
```

### Query Examples

**Get all events for a session:**
```graphql
query GetSessionEvents {
  events(correlationId: "sess-123") {
    eventId
    timestamp
    severity
    type
    subtype
    payload
  }
}
```

**Get conversation messages:**
```graphql
query GetConversation {
  messages(sessionId: "sess-123") {
    id
    role
    content
    timestamp
  }
}
```

**Subscribe to query execution events:**
```graphql
subscription StreamQueryEvents {
  eventsByCorrelation(correlationId: "sess-123") {
    eventId
    correlationId
    timestamp
    severity
    type
    subtype
    source
    payload
  }
}
```

**HTTP/SSE Streaming Example:**
```bash
# Stream query execution chunks
curl -N "http://ark-event-recorder.default.svc.cluster.local/stream/query-123"

# Stream with replay from beginning
curl -N "http://ark-event-recorder.default.svc.cluster.local/stream/query-123?from-beginning=true"
```

## Event Retention & Expiration

### Overview
Events in PostgreSQL are automatically expired based on a configurable retention period. This prevents unbounded database growth while maintaining recent event history for debugging and analysis.

### Configuration

**Environment Variable**: `EVENT_RETENTION_DAYS`

- **Default**: 30 days
- **Minimum**: 1 day
- **Recommended**: 7-90 days depending on use case

**Examples:**
```bash
EVENT_RETENTION_DAYS=7    # Keep 1 week of events
EVENT_RETENTION_DAYS=30   # Keep 1 month of events (default)
EVENT_RETENTION_DAYS=90   # Keep 3 months of events
```

### Cleanup Mechanism

**Background Task**:
- Runs every 24 hours (configurable via `EVENT_CLEANUP_INTERVAL_HOURS`, default: 24)
- Deletes events where `timestamp < (NOW() - INTERVAL '$EVENT_RETENTION_DAYS days')`
- Uses batched deletion to avoid long-running transactions
- Logs number of events deleted for monitoring

**Deletion Query:**
```sql
DELETE FROM events
WHERE timestamp < NOW() - INTERVAL '$EVENT_RETENTION_DAYS days'
```

## Deployment Architecture

### Service Components

**1. Ark Event Recorder (Per-Namespace)**
- FastAPI service with multiple API endpoints:
  - GraphQL (queries, subscriptions)
  - HTTP REST (memory API, streaming API)
  - HTTP/SSE streaming (K8s WATCH compatible)
- Background Kafka consumer task
- Background cleanup task for event expiration
- In-memory cache for ephemeral chunks (60min TTL)
- No Kubernetes RBAC needed (doesn't watch K8s directly)
- **Deployment**: 1 replica per namespace (NS=tenant)
- **Kafka**: Shared single Kafka cluster across all namespaces

**2. Unified Event Watcher (Per-Namespace)**
- Minimal service (health check endpoint only)
- Background tasks: Configurable event watchers
  - Kubernetes event watcher
  - Argo workflow watcher (if enabled)
  - Custom event sources (extensible)
- Requires K8s RBAC: read events, workflows, pods, logs (based on configuration)
- **Deployment**: 1 replica per namespace
- **Note**: In the future, Ark controllers may publish directly to Kafka to avoid etcd/event pressure

### Optional Service Behavior

**If AER is NOT installed:**
- ✅ Cluster remains fully functional
- ✅ Only K8s events available (ephemeral, via `kubectl get events`)
- ❌ No conversation memory
- ❌ No LLM streaming
- ❌ No persistent event history

**If AER is installed:**
- ✅ Full event persistence and querying
- ✅ Conversation memory (replaces ark-cluster-memory)
- ✅ LLM streaming (replaces ark-cluster-memory streaming)
- ✅ Multiple streaming protocols
- ✅ Rich event history and analysis

**4. Kafka**
- Use off-the-shelf Helm chart (Bitnami or the like)
- Helm chart should be configurable for:
  - **Local development**: Single broker, minimal resources, no persistence
  - **Production**: 3 brokers, replication factor 3, persistent volumes for durability
- Configuration via Helm values file to switch between environments

**5. PostgreSQL**
- StatefulSet with persistent volume
- Database: `ark_events`

## Protobuf Schema Management

### Schema Registry

For production deployments, consider using a Schema Registry (e.g., Confluent Schema Registry) to:
- Manage protobuf schema versions
- Ensure compatibility between producers and consumers
- Enable schema evolution without breaking changes
- Provide schema validation

### Schema Evolution Strategy

The protobuf schema supports backward and forward compatibility:
- **New fields**: Must be optional or have defaults
- **Removed fields**: Mark as deprecated, remove in later version
- **Field renumbering**: Never reuse field numbers
- **Enum changes**: Add new values at end, never remove existing values

### Code Generation

Generate language-specific code from the protobuf schema:

```bash
# Go
protoc --go_out=. --go_opt=paths=source_relative ark/eventing/proto/event.proto

# Python
protoc --python_out=. ark/eventing/proto/event.proto

# TypeScript (for GraphQL service)
protoc --ts_out=. ark/eventing/proto/event.proto
```

## Fast Mode

For high-frequency events that don't need persistence, AER supports a "fast mode" that passes events through without storing them:

**Configuration:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ark-event-recorder-config
data:
  fastModeEvents: |
    - type: "metrics"
    - type: "heartbeat"
    - subtype: "chunk"  # LLM/A2A chunks (already ephemeral)
```

**Behavior:**
- Events matching fast mode patterns skip PostgreSQL storage
- Events are still broadcast to active subscribers (real-time delivery)
- Events are still available in Kafka for short-term replay (7 days retention)
- Reduces database load for high-frequency, low-value events

## Event Routing Strategy

Events can be routed to different destinations based on configuration:

| Route | K8s Events API | Kafka | PostgreSQL | Use Case |
|-------|----------------|-------|------------|----------|
| `k8s+broker` | ✅ | ✅ | ✅ | Core query/agent events (audit trail) |
| `broker-only` | ❌ | ✅ | ✅ | Granular events (reduce etcd pressure) |
| `fast-mode` | ❌ | ✅ | ❌ | High-frequency metrics/chunks |

**Future**: As Ark matures, more granular events can move to `broker-only` to reduce etcd/event API pressure while maintaining full observability through AER.

## Future Enhancements

1. **Direct Kafka Publishing from Ark Controllers**: Instead of emitting K8s events, controllers could publish directly to Kafka (as protobuf) to reduce etcd pressure
2. **Event Filtering in Subscriptions**: Add filtering capabilities to GraphQL subscriptions (by type, severity, etc.)
3. **Event Aggregation**: Pre-compute aggregations (e.g., error rates per session, average execution time per query type)
4. **Schema Registry Integration**: Integrate with Confluent Schema Registry for schema management and validation
5. **Service Splitting**: Split unified watcher into dedicated services if needed for scale
6. **Event Replay API**: Allow replaying events from a specific point in time for debugging

