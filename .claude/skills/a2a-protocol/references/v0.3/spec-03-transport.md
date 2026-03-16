---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 3. Transport and Format

### 3.1. Transport Layer Requirements

A2A supports multiple transport protocols, all operating over **HTTP(S)**. Agents have flexibility in choosing which transport protocols to implement based on their specific requirements and use cases:

- A2A communication **MUST** occur over **HTTP(S)**.
- The A2A Server exposes its service at one or more URLs defined in its `AgentCard`.
- Agents **MUST** implement at least one of the three core transport protocols defined in this specification.
- All supported transport protocols are considered equal in status and capability.

### 3.2. Supported Transport Protocols

A2A defines three core transport protocols. **A2A-compliant agents SHOULD implement at least one of these transport protocols. They MAY be compliant implementing a transport extension as defined in [3.2.4](#324-transport-extensions)** All three protocols are considered equal in status, and agents may choose to implement any combination of them based on their requirements.

#### 3.2.1. JSON-RPC 2.0 Transport

Agents **MAY** support JSON-RPC 2.0 transport. If implemented, it **MUST** conform to these requirements:

- The primary data format is **[JSON-RPC 2.0](https://www.jsonrpc.org/specification)** for all requests and responses (excluding SSE stream wrapper).
- Client requests and server responses **MUST** adhere to the JSON-RPC 2.0 specification.
- The `Content-Type` header for HTTP requests and responses containing JSON-RPC payloads **MUST** be `application/json`.
- Method names follow the pattern `{category}/{action}` (e.g., `"message/send"`, `"tasks/get"`).

#### 3.2.2. gRPC Transport

Agents **MAY** support gRPC transport. If implemented, it **MUST** conform to these requirements:

- **Protocol Definition**: **MUST** use the normative Protocol Buffers definition in [`specification/grpc/a2a.proto`](specification/grpc/a2a.proto).
- **Message Serialization**: **MUST** use Protocol Buffers version 3 for message serialization.
- **Service Definition**: **MUST** implement the `A2AService` gRPC service as defined in the proto file.
- **Method Coverage**: **MUST** provide all methods with functionally equivalent behavior to other supported transports.
- **Field Mapping**: **MUST** use the `json_name` annotations for HTTP/JSON transcoding compatibility.
- **Error Handling**: **MUST** map A2A error codes to appropriate gRPC status codes as defined in the proto annotations.
- **Transport Security**: **MUST** support TLS encryption (gRPC over HTTP/2 with TLS).

#### 3.2.3. HTTP+JSON/REST Transport

Agents **MAY** support REST-style HTTP+JSON transport. If implemented, it **MUST** conform to these requirements:

- **HTTP Methods**: **MUST** use appropriate HTTP verbs (GET for queries, POST for actions, PUT for updates, DELETE for removal).
- **URL Patterns**: **MUST** follow the URL patterns documented in each method section (e.g., `/v1/message:send`, `/v1/tasks/{id}`).
- **Content-Type**: **MUST** use `application/json` for request and response bodies.
- **HTTP Status Codes**: **MUST** use appropriate HTTP status codes (200, 400, 401, 403, 404, 500, etc.) that correspond to A2A error types.
- **Request/Response Format**: **MUST** use JSON objects that are structurally equivalent to the core A2A data structures.
- **Method Coverage**: **MUST** provide all methods with functionally equivalent behavior to other supported transports.
- **Error Format**: **MUST** return error responses in a consistent JSON format that maps to A2A error types.

#### 3.2.4. Transport Extensions

Additional transport protocols **MAY** be defined as extensions to the core A2A specification. Such extensions:

- **MUST** maintain functional equivalence with the core transports
- **MUST** use clear namespace identifiers to avoid conflicts
- **MUST** be clearly documented and specified
- **SHOULD** provide migration paths from core transports

### 3.3. Streaming Transport (Server-Sent Events)

Streaming capabilities are **transport-specific**:

#### 3.3.1. JSON-RPC 2.0 Streaming

When streaming is used for methods like `message/stream` or `tasks/resubscribe`:

- The server responds with an HTTP `200 OK` status and a `Content-Type` header of `text/event-stream`.
- The body of this HTTP response contains a stream of **[Server-Sent Events (SSE)](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events)** as defined by the W3C.
- Each SSE `data` field contains a complete JSON-RPC 2.0 Response object (specifically, a [`SendStreamingMessageResponse`](#721-sendstreamingmessageresponse-object)).

#### 3.3.2. gRPC Streaming

gRPC transport uses **server streaming RPCs** for streaming operations as defined in the Protocol Buffers specification.

#### 3.3.3. HTTP+JSON/REST Streaming

If REST transport is supported it **MUST** implement streaming using Server-Sent Events similar to JSON-RPC.

### 3.4. Transport Compliance and Interoperability

#### 3.4.1. Functional Equivalence Requirements

When an agent supports multiple transports, all supported transports **MUST**:

- **Identical Functionality**: Provide the same set of operations and capabilities.
- **Consistent Behavior**: Return semantically equivalent results for the same requests.
- **Same Error Handling**: Map errors consistently across transports using the error codes defined in [Section 8](#8-error-handling).
- **Equivalent Authentication**: Support the same authentication schemes declared in the `AgentCard`.

#### 3.4.2. Transport Selection and Negotiation

- **Agent Declaration**: Agents **MUST** declare all supported transports in their `AgentCard` using the `preferredTransport` and `additionalInterfaces` fields.
- **Client Choice**: Clients **MAY** choose any transport declared by the agent.
- **No Transport Negotiation**: A2A does not define a dynamic transport negotiation protocol. Clients select a transport based on the static `AgentCard` information.
- **Fallback Behavior**: Clients **SHOULD** implement fallback logic to try alternative transports if their preferred transport fails. The specific fallback strategy is implementation-dependent.

#### 3.4.3. Transport-Specific Extensions

Transports **MAY** provide transport-specific optimizations or extensions that do not compromise functional equivalence:

- **gRPC**: May leverage gRPC-specific features like bidirectional streaming, metadata, or custom status codes.
- **REST**: May provide additional HTTP caching headers or support HTTP conditional requests.
- **JSON-RPC**: May include additional fields in the JSON-RPC request/response objects that do not conflict with the core specification.

Such extensions **MUST** be backward-compatible and **MUST NOT** break interoperability with clients that do not support the extensions.

### 3.5. Method Mapping and Naming Conventions

To ensure consistency and predictability across different transports, A2A defines normative method mapping rules.

#### 3.5.1. JSON-RPC Method Naming

JSON-RPC methods **MUST** follow the pattern: `{category}/{action}` where:

- `category` represents the resource type (e.g., "message", "tasks", "agent")
- `action` represents the operation (e.g., "send", "get", "cancel")
- Nested actions use forward slashes (e.g., "tasks/pushNotificationConfig/set")

#### 3.5.2. gRPC Method Naming

gRPC methods **MUST** follow Protocol Buffers service conventions using PascalCase:

- Convert JSON-RPC category/action to PascalCase compound words
- Use standard gRPC method prefixes (Get, Set, List, Create, Delete, Cancel)

#### 3.5.3. HTTP+JSON/REST Method Naming

REST endpoints **MUST** follow RESTful URL patterns with appropriate HTTP verbs:

- Use resource-based URLs: `/v1/{resource}[/{id}][:{action}]`
- Use standard HTTP methods aligned with REST semantics
- Use colon notation for non-CRUD actions

#### 3.5.4. Method Mapping Compliance

When implementing multiple transports, agents **MUST**:

- **Use standard mappings**: Follow the method mappings defined in sections 3.5.2 and 3.5.3.
- **Maintain functional equivalence**: Each transport-specific method **MUST** provide identical functionality across all supported transports.
- **Consistent parameters**: Use equivalent parameter structures across transports (accounting for transport-specific serialization differences).
- **Equivalent responses**: Return semantically equivalent responses across all transports for the same operation.

#### 3.5.5. Extension Method Naming

For custom or extension methods not defined in the core A2A specification:

- **JSON-RPC**: Follow the `{category}/{action}` pattern with a clear namespace (e.g., `myorg.extension/action`)
- **gRPC**: Use appropriate service and method names following Protocol Buffers conventions
- **REST**: Use clear resource-based URLs with appropriate HTTP methods

Extension methods **MUST** be clearly documented and **MUST NOT** conflict with core A2A method names or semantics.

#### 3.5.6. Method Mapping Reference Table

For quick reference, the following table summarizes the method mappings across all transports:

| JSON-RPC Method | gRPC Method | REST Endpoint | Description |
|:----------------|:------------|:--------------|:------------|
| `message/send` | `SendMessage` | `POST /v1/message:send` | Send message to agent |
| `message/stream` | `SendStreamingMessage` | `POST /v1/message:stream` | Send message with streaming |
| `tasks/get` | `GetTask` | `GET /v1/tasks/{id}` | Get task status |
| `tasks/list` | `ListTask` | `GET /v1/tasks` | List tasks (gRPC/REST only) |
| `tasks/cancel` | `CancelTask` | `POST /v1/tasks/{id}:cancel` | Cancel task |
| `tasks/resubscribe` | `TaskSubscription` | `POST /v1/tasks/{id}:subscribe` | Resume task streaming |
| `tasks/pushNotificationConfig/set` | `CreateTaskPushNotification` | `POST /v1/tasks/{id}/pushNotificationConfigs` | Set push notification config |
| `tasks/pushNotificationConfig/get` | `GetTaskPushNotification` | `GET /v1/tasks/{id}/pushNotificationConfigs/{configId}` | Get push notification config |
| `tasks/pushNotificationConfig/list` | `ListTaskPushNotification` | `GET /v1/tasks/{id}/pushNotificationConfigs` | List push notification configs |
| `tasks/pushNotificationConfig/delete` | `DeleteTaskPushNotification` | `DELETE /v1/tasks/{id}/pushNotificationConfigs/{configId}` | Delete push notification config |
| `agent/getAuthenticatedExtendedCard` | `GetAgentCard` | `GET /v1/card` | Get authenticated agent card |
