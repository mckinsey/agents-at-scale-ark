---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 9. JSON-RPC Protocol Binding

The JSON-RPC protocol binding provides a simple, HTTP-based interface using JSON-RPC 2.0 for method calls and Server-Sent Events for streaming.

### 9.1. Protocol Requirements

- **Protocol:** JSON-RPC 2.0 over HTTP(S)
- **Content-Type:** `application/json` for requests and responses
- **Method Naming:** PascalCase method names matching gRPC conventions (e.g., `SendMessage`, `GetTask`)
- **Streaming:** Server-Sent Events (`text/event-stream`)

### 9.2. Service Parameter Transmission

A2A service parameters defined in [Section 3.2.6](#326-service-parameters) **MUST** be transmitted using standard HTTP request headers, as JSON-RPC 2.0 operates over HTTP(S).

**Service Parameter Requirements:**

- Service parameter names **MUST** be transmitted as HTTP header fields
- Service parameter keys are case-insensitive per HTTP specification (RFC 7230)
- Multiple values for the same service parameter (e.g., `A2A-Extensions`) **SHOULD** be comma-separated in a single header field

**Example Request with A2A Service Parameters:**

```http
POST /rpc HTTP/1.1
Host: agent.example.com
Content-Type: application/json
Authorization: Bearer token
A2A-Version: 0.3
A2A-Extensions: https://example.com/extensions/geolocation/v1,https://standards.org/extensions/citations/v1

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "SendMessage",
  "params": { /* SendMessageRequest */ }
}
```

### 9.3. Base Request Structure

All JSON-RPC requests **MUST** follow the standard JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "category/action",
  "params": { /* method-specific parameters */ }
}
```

### 9.4. Core Methods

#### 9.4.1. `SendMessage`

Sends a message to initiate or continue a task.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "SendMessage",
  "params": { /* SendMessageRequest object */ }
}
```

**Referenced Objects:** [`SendMessageRequest`](#321-sendmessagerequest), [`Message`](#414-message)

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    /* SendMessageResponse object, contains one of:
     * "task": { Task object }
     * "message": { Message object }
    */
  }
```

**Referenced Objects:** [`Task`](#411-task), [`Message`](#414-message)

#### 9.4.2. `SendStreamingMessage`

Sends a message and subscribes to real-time updates via Server-Sent Events.

**Request:** Same as `SendMessage`

**Response:** HTTP 200 with `Content-Type: text/event-stream`

```text
data: {"jsonrpc": "2.0", "id": 1, "result": { /* StreamResponse object */ }}

data: {"jsonrpc": "2.0", "id": 1, "result": { /* StreamResponse object */ }}
```

**Referenced Objects:** [`StreamResponse`](#323-stream-response)

#### 9.4.3. `GetTask`

Retrieves the current state of a task.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "GetTask",
  "params": {
    "id": "task-uuid",
    "historyLength": 10
  }
}
```

#### 9.4.4. `ListTasks`

Lists tasks with optional filtering and pagination.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "ListTasks",
  "params": {
    "contextId": "context-uuid",
    "status": "TASK_STATE_WORKING",
    "pageSize": 50,
    "pageToken": "cursor-token"
  }
}
```

#### 9.4.5. `CancelTask`

Cancels an ongoing task.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "CancelTask",
  "params": {
    "id": "task-uuid"
  }
}
```

#### 9.4.6. `SubscribeToTask`

<span id="936-taskssubscribe"></span>

Subscribes to a task stream for receiving updates on a task that is not in a terminal state.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "SubscribeToTask",
  "params": {
    "id": "task-uuid"
  }
}
```

**Response:** SSE stream (same format as `SendStreamingMessage`)

**Error:** Returns `UnsupportedOperationError` if the task is in a terminal state (`completed`, `failed`, `canceled`, or `rejected`).

#### 9.4.7. Push Notification Configuration Methods

- `CreateTaskPushNotificationConfig` - Create push notification configuration
- `GetTaskPushNotificationConfig` - Get push notification configuration
- `ListTaskPushNotificationConfigs` - List push notification configurations
- `DeleteTaskPushNotificationConfig` - Delete push notification configuration

#### 9.4.8. `GetExtendedAgentCard`

Retrieves an extended Agent Card.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "GetExtendedAgentCard"
}
```

### 9.5. Error Handling

JSON-RPC error responses use the standard [JSON-RPC 2.0 error object](https://www.jsonrpc.org/specification#error_object) structure, which maps to the generic A2A error model defined in [Section 3.3.2](#332-error-handling) as follows:

- **Error Code**: Mapped to `error.code` (numeric JSON-RPC error code)
- **Error Message**: Mapped to `error.message` (human-readable string)
- **Error Details**: Mapped to `error.data` (optional structured object)

**Standard JSON-RPC Error Codes:**

| JSON-RPC Error Code | Error Name            | Standard Message                   | Description                                             |
| :------------------ | :-------------------- | :--------------------------------- | :------------------------------------------------------ |
| `-32700`            | `JSONParseError`      | "Invalid JSON payload"             | The server received invalid JSON                        |
| `-32600`            | `InvalidRequestError` | "Request payload validation error" | The JSON sent is not a valid Request object             |
| `-32601`            | `MethodNotFoundError` | "Method not found"                 | The requested method does not exist or is not available |
| `-32602`            | `InvalidParamsError`  | "Invalid parameters"               | The method parameters are invalid                       |
| `-32603`            | `InternalError`       | "Internal error"                   | An internal error occurred on the server                |

**A2A-Specific Error Codes:**

A2A-specific errors use codes in the range `-32001` to `-32099`. For the complete mapping of A2A error types to JSON-RPC error codes, see [Section 5.4 (Error Code Mappings)](#54-error-code-mappings).

**Error Response Structure:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "method": "invalid/method"
    }
  }
}
```

**Example A2A-Specific Error Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32001,
    "message": "Task not found",
    "data": {
      "taskId": "nonexistent-task-id",
      "timestamp": "2025-11-09T10:30:00.000Z"
    }
  }
}
```

The `data` field **MAY** include additional context-specific information to help clients diagnose and resolve the error.
