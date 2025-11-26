# Ark Event Recorder - Design Document

## Overview

The Ark Event Recorder (AER) is a high-throughput event collection and streaming system designed to capture, persist, and broadcast events from multiple sources across a Kubernetes-based workflow execution environment. It integrates with Ark's structured eventing system (PR #477) to collect events emitted by Ark controllers, along with events from Argo Workflows, Kubernetes events, and other sources.

The system uses Kafka for reliable buffering, PostgreSQL for persistent storage with rich querying capabilities, and GraphQL subscriptions for real-time event streaming to clients.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    External Event Sources                          │
│                                                                    │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │ Ark-Watcher  │      │ Argo-Watcher │      │   Monitor    │   │
│  │ (K8s events  │      │  (workflows/ │      │   Service    │   │
│  │  with        │      │   pod logs)  │      │              │   │
│  │  structured  │      │              │      │              │   │
│  │  annotations)│      │              │      │              │   │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘   │
│         │                     │                     │            │
│         │   Extract from      │   Generate UUID     │            │
│         │   K8s events +      │   Normalize event   │            │
│         │   annotations       │                     │            │
│         │                     │                     │            │
│         └─────────────────────┴─────────────────────┘            │
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
│  │  1. Parse JSON from Kafka messages                       │   │
│  │  2. Validate event schema                                │   │
│  │  3. Batch INSERT into PostgreSQL                         │   │
│  │  4. Commit Kafka offsets on success                      │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Broadcast to Subscribers                                 │   │
│  │  • In-memory EventPubSub                                 │   │
│  │  • Publishes to all active GraphQL subscriptions        │   │
│  │  • Async queue per subscriber                           │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                            │                                      │
│            ┌───────────────┴───────────────┐                    │
│            │                                │                    │
│  ┌─────────▼─────────┐          ┌──────────▼────────┐          │
│  │  GraphQL          │          │  Cleanup Service   │          │
│  │  Subscription     │          │  (Background Task) │          │
│  │  (WebSocket)      │          │  • Runs every 24h  │          │
│  │                   │          │  • DELETE old rows │          │
│  │  subscription {   │          │                    │          │
│  │    events { ... } │          └────────────────────┘          │
│  │  }                │                                           │
│  └───────────────────┘                                           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GraphQL Query API                                        │   │
│  │                                                           │   │
│  │  query {                                                  │   │
│  │    events(correlationId: "workflow-123") {              │   │
│  │      eventId, timestamp, severity, type, subtype ...    │   │
│  │    }                                                      │   │
│  │  }                                                        │   │
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

## Component 1: Ark-Watcher Microservice

### Purpose
Watches Kubernetes Events (including those with structured annotations from Ark controllers), normalizes them to the standard event format, and publishes to Kafka. **Core part of Ark**

### Responsibilities

1. **Kubernetes Event Monitoring**: Watch Kubernetes Event resources for:
   - Events with `ark.mckinsey.com/event-data` annotation (from Ark controllers)
   - Standard K8s events related to workflow execution (pods, containers, resource issues)
2. **Event Normalization**: Convert K8s events to standardized AER event format
3. **UUID Generation**: Generate `event_id` before publishing to Kafka
4. **Kafka Publishing**: Serialize normalized events to protobuf binary format and send to "events" topic with `correlation_id` as partition key

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

## Component 2: Argo Watcher Microservice

### Purpose
Watches Argo Workflows and pod logs in Kubernetes, normalizes them to the standard event format, and publishes to Kafka. **Lives with Argo marketplace entry**

### Responsibilities

1. **Workflow State Monitoring**: Watch Argo Workflow resources for phase changes (Pending, Running, Succeeded, Failed, Error)
2. **Pod Log Streaming**: Stream stdout/stderr from workflow pods
3. **Event Normalization**: Convert Argo-specific data to standardized event format
4. **UUID Generation**: Generate `event_id` before publishing to Kafka
5. **Kafka Publishing**: Serialize normalized events to protobuf binary format and send to "events" topic with `correlation_id` as partition key

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

## Component 3: Ark Event Recorder Service

### Purpose
Reliably consume events from Kafka, persist to PostgreSQL with batch processing, and broadcast to active GraphQL subscribers. **Core part of Ark**

### Processing Flow

1. **Consume from Kafka**: Poll up to 100 messages or wait 1 second (whichever comes first)
2. **Deserialize Protobuf**: Deserialize binary protobuf messages to Event objects
3. **Validate**: Check event schema compliance and version. Discard malformed events or events with unsupported versions (log warning and continue processing batch)
4. **Convert to JSONB**: Convert protobuf payload to JSONB for PostgreSQL storage (maintains queryability)
5. **Batch Insert**: Write all valid events to PostgreSQL in single transaction using `ON CONFLICT (event_id) DO NOTHING` to handle duplicate deliveries
6. **Commit Offsets**: Only commit Kafka offsets after successful database write
7. **Broadcast**: Publish events (as protobuf or JSON) to in-memory pub/sub for GraphQL subscribers

### Key Design Decisions

1. **Batch Processing**: Fetches up to 100 events at once, reducing database round-trips significantly
2. **Manual Offset Commit**: Only commits after successful database write, ensuring at-least-once delivery
3. **Partition Key**: Kafka uses `correlation_id` as partition key, ensuring all events for a session/workflow stay ordered
4. **Error Handling**: On failure, don't commit offsets → Kafka replays events → eventual consistency
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

## GraphQL API

### Schema Definition

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

type Query {
  # Get events for a specific correlation ID (session ID, query ID, etc.)
  events(correlationId: String!): [Event!]!

  # Get single event by event_id
  event(eventId: UUID!): Event

  # Query events with filters
  eventsByType(type: String!, subtype: String, limit: Int, offset: Int): [Event!]!
  
  # Query events by time range
  eventsByTimeRange(startTime: DateTime!, endTime: DateTime!, correlationId: String): [Event!]!
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

**1. Ark Event Recorder**
- FastAPI service with GraphQL endpoint (using Ariadne for GraphQL)
- Background Kafka consumer task
- Background cleanup task for event expiration
- No Kubernetes RBAC needed (doesn't watch K8s directly)
- Deployment: 1 replica initially (may scale to 3 replicas later if needed for higher throughput)

**2. Ark-Watcher**
- Minimal service (health check endpoint only)
- Background task: Kubernetes event watcher
- Requires K8s RBAC: read events
- Deployment: 1 replica
- **Note**: In the future, Ark controllers may publish directly to Kafka to avoid etcd/event pressure

**3. Argo-Watcher**
- Minimal service (health check endpoint only)
- Background tasks: workflow watcher + log streamer
- Requires K8s RBAC: read workflows, pods, logs
- Deployment: 1 replica (K8s watch has built-in HA via resource version bookmarking)
- Lives with Argo marketplace entry (optional component)

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

## Future Enhancements

1. **Direct Kafka Publishing from Ark Controllers**: Instead of emitting K8s events, controllers could publish directly to Kafka (as protobuf) to reduce etcd pressure
2. **Event Filtering in Subscriptions**: Add filtering capabilities to GraphQL subscriptions (by type, severity, etc.)
3. **Event Aggregation**: Pre-compute aggregations (e.g., error rates per session, average execution time per query type)
4. **Multi-tenant Support**: Add tenant isolation for events
5. **Event Replay API**: Allow replaying events from a specific point in time for debugging
6. **Schema Registry Integration**: Integrate with Confluent Schema Registry for schema management and validation

