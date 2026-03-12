---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 10. gRPC Protocol Binding

The gRPC Protocol Binding provides a high-performance, strongly-typed interface using Protocol Buffers over HTTP/2. The gRPC Protocol Binding leverages the [API guidelines](https://google.aip.dev/general) to simplify gRPC to HTTP mapping.

### 10.1. Protocol Requirements

- **Protocol:** gRPC over HTTP/2 with TLS
- **Definition:** Use the normative Protocol Buffers definition in `specification/a2a.proto`
- **Serialization:** Protocol Buffers version 3
- **Service:** Implement the `A2AService` gRPC service

### 10.2. Service Parameter Transmission

A2A service parameters defined in [Section 3.2.6](#326-service-parameters) **MUST** be transmitted using gRPC metadata (headers).

**Service Parameter Requirements:**

- Service parameter names **MUST** be transmitted as gRPC metadata keys
- Metadata keys are case-insensitive and automatically converted to lowercase by gRPC
- Multiple values for the same service parameter (e.g., `A2A-Extensions`) **SHOULD** be comma-separated in a single metadata entry

**Example gRPC Request with A2A Service Parameters:**

```go
// Go example using gRPC metadata
md := metadata.Pairs(
    "authorization", "Bearer token",
    "a2a-version", "0.3",
    "a2a-extensions", "https://example.com/extensions/geolocation/v1,https://standards.org/extensions/citations/v1",
)
ctx := metadata.NewOutgoingContext(context.Background(), md)

// Make the RPC call with the context containing metadata
response, err := client.SendMessage(ctx, request)
```

**Metadata Handling:**

- Implementations **MUST** extract A2A service parameters from gRPC metadata for processing
- Servers **SHOULD** validate required service parameters (e.g., `A2A-Version`) from metadata
- Service parameter keys in metadata are normalized to lowercase per gRPC conventions

### 10.3. Service Definition

{{ proto_service_to_table("A2AService") }}

### 10.4. Core Methods

#### 10.4.1. SendMessage

Sends a message to an agent.

**Request:**

{{ proto_to_table("SendMessageRequest") }}

**Response:**

{{ proto_to_table("SendMessageResponse") }}

#### 10.4.2. SendStreamingMessage

Sends a message with streaming updates.

**Request:**

{{ proto_to_table("SendMessageRequest") }}

**Response:** Server streaming [`StreamResponse`](#stream-response) objects.

#### 10.4.3. GetTask

Retrieves task status.

**Request:**

{{ proto_to_table("GetTaskRequest") }}

**Response:** See [`Task`](#411-task) object definition.

#### 10.4.4. ListTasks

Lists tasks with filtering.

**Request:**

{{ proto_to_table("ListTasksRequest") }}

**Response:**

{{ proto_to_table("ListTasksResponse") }}

#### 10.4.5. CancelTask

Cancels a running task.

**Request:**

{{ proto_to_table("CancelTaskRequest") }}

**Response:** See [`Task`](#411-task) object definition.

#### 10.4.6. SubscribeToTask

Subscribe to task updates via streaming. Returns `UnsupportedOperationError` if the task is in a terminal state.

**Request:**

{{ proto_to_table("SubscribeToTaskRequest") }}

**Response:** Server streaming [`StreamResponse`](#stream-response) objects.

#### 10.4.7. CreateTaskPushNotificationConfig

Creates a push notification configuration for a task.

**Request:**

{{ proto_to_table("CreateTaskPushNotificationConfigRequest") }}

**Response:** See [`PushNotificationConfig`](#431-pushnotificationconfig) object definition.

#### 10.4.8. GetTaskPushNotificationConfig

Retrieves an existing push notification configuration for a task.

**Request:**

{{ proto_to_table("GetTaskPushNotificationConfigRequest") }}

**Response:** See [`PushNotificationConfig`](#431-pushnotificationconfig) object definition.

#### 10.4.9. ListTaskPushNotificationConfigs

Lists all push notification configurations for a task.

**Request:**

{{ proto_to_table("ListTaskPushNotificationConfigsRequest") }}

**Response:**

{{ proto_to_table("ListTaskPushNotificationConfigsResponse") }}

#### 10.4.10. DeleteTaskPushNotificationConfig

Removes a push notification configuration for a task.

**Request:**

{{ proto_to_table("DeleteTaskPushNotificationConfigRequest") }}

**Response:** `google.protobuf.Empty`

#### 10.4.11. GetExtendedAgentCard

Retrieves the agent's extended capability card after authentication.

**Request:**

{{ proto_to_table("GetExtendedAgentCardRequest") }}

**Response:** See [`AgentCard`](#441-agentcard) object definition.

### 10.5. gRPC-Specific Data Types

#### 10.5.1. TaskPushNotificationConfig

Resource wrapper for push notification configurations. This is a gRPC-specific type used in resource-oriented operations to provide the full resource name along with the configuration data.

{{ proto_to_table("TaskPushNotificationConfig") }}

**Fields:**

{{ proto_to_table("TaskPushNotificationConfig") }}

### 10.6. Error Handling

gRPC error responses use the standard [gRPC status](https://grpc.io/docs/guides/error/) structure with [google.rpc.Status](https://github.com/googleapis/googleapis/blob/master/google/rpc/status.proto), which maps to the generic A2A error model defined in [Section 3.3.2](#332-error-handling) as follows:

- **Error Code**: Mapped to `status.code` (gRPC status code enum)
- **Error Message**: Mapped to `status.message` (human-readable string)
- **Error Details**: Mapped to `status.details` (repeated google.protobuf.Any messages)

**A2A Error Representation:**

For A2A-specific errors, implementations **MUST** include a `google.rpc.ErrorInfo` message in the `status.details` array with:

- `reason`: The A2A error type in UPPER_SNAKE_CASE without the "Error" suffix (e.g., `TASK_NOT_FOUND`)
- `domain`: Set to `"a2a-protocol.org"`
- `metadata`: Optional map of additional error context

For the complete mapping of A2A error types to gRPC status codes, see [Section 5.4 (Error Code Mappings)](#54-error-code-mappings).

**Error Response Example:**

```proto
// Standard gRPC invalid argument error
status {
  code: INVALID_ARGUMENT
  message: "Invalid request parameters"
  details: [
    {
      type: "type.googleapis.com/google.rpc.BadRequest"
      field_violations: [
        {
          field: "message.parts"
          description: "At least one part is required"
        }
      ]
    }
  ]
}
```

**Example A2A-Specific Error Response:**

```proto
// A2A-specific task not found error
status {
  code: NOT_FOUND
  message: "Task with ID 'task-123' not found"
  details: [
    {
      type: "type.googleapis.com/google.rpc.ErrorInfo"
      reason: "TASK_NOT_FOUND"
      domain: "a2a-protocol.org"
      metadata: {
        task_id: "task-123"
        timestamp: "2025-11-09T10:30:00Z"
      }
    }
  ]
}
```

### 10.7. Streaming

gRPC streaming uses server streaming RPCs for real-time updates. The `StreamResponse` message provides a union of possible streaming events:

{{ proto_to_table("StreamResponse") }}
