---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 5. Protocol Binding Requirements and Interoperability

### 5.1. Functional Equivalence Requirements

When an agent supports multiple protocols, all supported protocols **MUST**:

- **Identical Functionality**: Provide the same set of operations and capabilities
- **Consistent Behavior**: Return semantically equivalent results for the same requests
- **Same Error Handling**: Map errors consistently using appropriate protocol-specific codes
- **Equivalent Authentication**: Support the same authentication schemes declared in the AgentCard

### 5.2. Protocol Selection and Negotiation

- **Agent Declaration**: Agents **MUST** declare all supported protocols in their AgentCard
- **Client Choice**: Clients **MAY** choose any protocol declared by the agent
- **Fallback Behavior**: Clients **SHOULD** implement fallback logic for alternative protocols

### 5.3. Method Mapping Reference

| Functionality                   | JSON-RPC Method                    | gRPC Method                        | REST Endpoint                                           |
| :------------------------------ | :--------------------------------- | :--------------------------------- | :------------------------------------------------------ |
| Send message                    | `SendMessage`                      | `SendMessage`                      | `POST /message:send`                                    |
| Stream message                  | `SendStreamingMessage`             | `SendStreamingMessage`             | `POST /message:stream`                                  |
| Get task                        | `GetTask`                          | `GetTask`                          | `GET /tasks/{id}`                                       |
| List tasks                      | `ListTasks`                        | `ListTasks`                        | `GET /tasks`                                            |
| Cancel task                     | `CancelTask`                       | `CancelTask`                       | `POST /tasks/{id}:cancel`                               |
| Subscribe to task               | `SubscribeToTask`                  | `SubscribeToTask`                  | `POST /tasks/{id}:subscribe`                            |
| Create push notification config | `CreateTaskPushNotificationConfig` | `CreateTaskPushNotificationConfig` | `POST /tasks/{id}/pushNotificationConfigs`              |
| Get push notification config    | `GetTaskPushNotificationConfig`    | `GetTaskPushNotificationConfig`    | `GET /tasks/{id}/pushNotificationConfigs/{configId}`    |
| List push notification configs  | `ListTaskPushNotificationConfigs`  | `ListTaskPushNotificationConfigs`  | `GET /tasks/{id}/pushNotificationConfigs`               |
| Delete push notification config | `DeleteTaskPushNotificationConfig` | `DeleteTaskPushNotificationConfig` | `DELETE /tasks/{id}/pushNotificationConfigs/{configId}` |
| Get extended Agent Card         | `GetExtendedAgentCard`             | `GetExtendedAgentCard`             | `GET /extendedAgentCard`                                |

### 5.4. Error Code Mappings

All A2A-specific errors defined in [Section 3.3.2](#332-error-handling) **MUST** be mapped to binding-specific error representations. The following table provides the canonical mappings for each standard protocol binding:

| A2A Error Type                        | JSON-RPC Code | gRPC Status           | HTTP Status                  | HTTP Type URI                                                        |
| :------------------------------------ | :------------ | :-------------------- | :--------------------------- | :------------------------------------------------------------------- |
| `TaskNotFoundError`                   | `-32001`      | `NOT_FOUND`           | `404 Not Found`              | `https://a2a-protocol.org/errors/task-not-found`                     |
| `TaskNotCancelableError`              | `-32002`      | `FAILED_PRECONDITION` | `409 Conflict`               | `https://a2a-protocol.org/errors/task-not-cancelable`                |
| `PushNotificationNotSupportedError`   | `-32003`      | `UNIMPLEMENTED`       | `400 Bad Request`            | `https://a2a-protocol.org/errors/push-notification-not-supported`    |
| `UnsupportedOperationError`           | `-32004`      | `UNIMPLEMENTED`       | `400 Bad Request`            | `https://a2a-protocol.org/errors/unsupported-operation`              |
| `ContentTypeNotSupportedError`        | `-32005`      | `INVALID_ARGUMENT`    | `415 Unsupported Media Type` | `https://a2a-protocol.org/errors/content-type-not-supported`         |
| `InvalidAgentResponseError`           | `-32006`      | `INTERNAL`            | `502 Bad Gateway`            | `https://a2a-protocol.org/errors/invalid-agent-response`             |
| `ExtendedAgentCardNotConfiguredError` | `-32007`      | `FAILED_PRECONDITION` | `400 Bad Request`            | `https://a2a-protocol.org/errors/extended-agent-card-not-configured` |
| `ExtensionSupportRequiredError`       | `-32008`      | `FAILED_PRECONDITION` | `400 Bad Request`            | `https://a2a-protocol.org/errors/extension-support-required`         |
| `VersionNotSupportedError`            | `-32009`      | `UNIMPLEMENTED`       | `400 Bad Request`            | `https://a2a-protocol.org/errors/version-not-supported`              |

**Custom Binding Requirements:**

Custom protocol bindings **MUST** define equivalent error code mappings that preserve the semantic meaning of each A2A error type. The binding specification **SHOULD** provide a similar mapping table showing how each A2A error type is represented in the custom binding's native error format.

For binding-specific error structures and examples, see:

- [JSON-RPC Error Handling](#95-error-handling)
- [gRPC Error Handling](#106-error-handling)
- [HTTP/REST Error Handling](#116-error-handling)

### 5.5. JSON Field Naming Convention

All JSON serializations of the A2A protocol data model **MUST** use **camelCase** naming for field names, not the snake_case convention used in Protocol Buffer definitions.

**Naming Convention:**

- Protocol Buffer field: `protocol_version` → JSON field: `protocolVersion`
- Protocol Buffer field: `context_id` → JSON field: `contextId`
- Protocol Buffer field: `default_input_modes` → JSON field: `defaultInputModes`
- Protocol Buffer field: `push_notification_config` → JSON field: `pushNotificationConfig`

**Enum Values:**

- Enum values **MUST** be represented according to the [ProtoJSON specification](https://protobuf.dev/programming-guides/json/), which serializes enums as their string names **as defined in the Protocol Buffer definition** (typically SCREAMING_SNAKE_CASE).

**Examples:**

- Protocol Buffer enum: `TASK_STATE_INPUT_REQUIRED` → JSON value: `"TASK_STATE_INPUT_REQUIRED"`
- Protocol Buffer enum: `ROLE_USER` → JSON value: `"ROLE_USER"`

**Note:** This follows the ProtoJSON specification as adopted in [ADR-001](../adrs/adr-001-protojson-serialization.md).

### 5.6. Data Type Conventions

This section documents conventions for common data types used throughout the A2A protocol, particularly as they apply to protocol bindings.

#### 5.6.1. Timestamps

The A2A protocol uses [`google.protobuf.Timestamp`](https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp) for all timestamp fields in the Protocol Buffer definitions. When serialized to JSON (in JSON-RPC, HTTP/REST, or other JSON-based bindings), these timestamps **MUST** be represented as ISO 8601 formatted strings in UTC timezone.

**Format Requirements:**

- **Format:** ISO 8601 combined date and time representation
- **Timezone:** UTC (denoted by 'Z' suffix)
- **Precision:** Millisecond precision **SHOULD** be used where available
- **Pattern:** `YYYY-MM-DDTHH:mm:ss.sssZ`

**Examples:**

```json
{
  "timestamp": "2025-10-28T10:30:00.000Z",
  "createdAt": "2025-10-28T14:25:33.142Z",
  "lastModified": "2025-10-31T17:45:22.891Z"
}
```

**Implementation Notes:**

- Protocol Buffer's `google.protobuf.Timestamp` represents time as seconds since Unix epoch (January 1, 1970, 00:00:00 UTC) plus nanoseconds
- JSON serialization automatically converts this to ISO 8601 format when using standard Protocol Buffer JSON encoding
- Clients and servers **MUST** parse and generate ISO 8601 timestamps correctly
- When millisecond precision is not available, the fractional seconds portion **MAY** be omitted or zero-filled
- Timestamps **MUST NOT** include timezone offsets other than 'Z' (all times are UTC)

### 5.7. Field Presence and Optionality

The Protocol Buffer definition in `specification/a2a.proto` uses [`google.api.field_behavior`](https://github.com/googleapis/googleapis/blob/master/google/api/field_behavior.proto) annotations to indicate whether fields are `REQUIRED`. These annotations serve as both documentation and validation hints for implementations.

**Required Fields:**

Fields marked with `[(google.api.field_behavior) = REQUIRED]` indicate that the field **MUST** be present and set in valid messages. Implementations **SHOULD** validate these requirements and reject messages with missing required fields. Arrays marked as required **MUST** contain at least one element.

**Optional Field Presence:**

The Protocol Buffer `optional` keyword is used to distinguish between a field being explicitly set versus omitted. This distinction is critical for two scenarios:

1. **Explicit Default Values:** Some fields in the specification define default values that differ from Protocol Buffer's implicit defaults. Implementations should apply the default value when the field is not explicitly provided.

2. **Agent Card Canonicalization:** When creating cryptographic signatures of Agent Cards, it is required to produce a canonical JSON representation. The `optional` keyword enables implementations to distinguish between fields that were explicitly set (and should be included in the canonical form) versus fields that were omitted (and should be excluded from canonicalization). This ensures Agent Cards can be reconstructed to accurately match their signature.

**Unrecognized Fields:**

Implementations **SHOULD** ignore unrecognized fields in messages, allowing for forward compatibility as the protocol evolves.
