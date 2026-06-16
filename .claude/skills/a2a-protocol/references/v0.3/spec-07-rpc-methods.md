---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 7. Protocol RPC Methods

All A2A RPC methods are invoked by the A2A Client by sending an HTTP POST request to the A2A Server's `url` (as specified in its `AgentCard`). The body of the HTTP POST request **MUST** be a `JSONRPCRequest` object, and the `Content-Type` header **MUST** be `application/json`.

The A2A Server's HTTP response body **MUST** be a `JSONRPCResponse` object (or, for streaming methods, an SSE stream where each event's data is a `JSONRPCResponse`). The `Content-Type` for JSON-RPC responses is `application/json`. For SSE streams, it is `text/event-stream`.

### 7.1. `message/send`

Sends a message to an agent to initiate a new interaction or to continue an existing one. This method is suitable for synchronous request/response interactions or when client-side polling (using `tasks/get`) is acceptable for monitoring longer-running tasks. A task which has reached a terminal state (completed, canceled, rejected, or failed) can't be restarted. Sending a message to such a task will result in an error. For more information, refer to the [Life of a Task guide](./topics/life-of-a-task.md).

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `message/send`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`MessageSendParams`](#711-messagesendparams-object)
    -   **Response**: [`Task` | `Message`](#61-task-object) (A message object or the current or final state of the task after processing the message).

=== "gRPC"
    -   **URL:** `SendMessage`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message SendMessageRequest {
          Message msg = 1;
          SendMessageConfiguration configuration = 2;
        }
        ```
    -   **Response:**
        ```proto
        message SendMessageResponse {
          oneof payload {
            Task task = 1;
            Message msg = 2;
          }
        }
        ```

=== "REST"
    -   **URL:** `/v1/message:send`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```typescript
        {
          message: Message,
          configuration?: MessageSendConfiguration,
          metadata?: { [key: string]: any }
        }
        ```
    -   **Response:**
        ```typescript
        // Returns one of a message or a task
        {
          message?: Message,
          task?: Task
        }
        ```

</div>

The `error` response for all transports in case of failure is a [`JSONRPCError`](#612-jsonrpcerror-object) or equivalent.

#### 7.1.1. `MessageSendParams` Object

```ts { .no-copy }
--8<-- "types/src/types.ts:MessageSendParams"

--8<-- "types/src/types.ts:MessageSendConfiguration"
```

### 7.2. `message/stream`

Sends a message to an agent to initiate/continue a task AND subscribes the client to real-time updates for that task via Server-Sent Events (SSE). This method requires the server to have `AgentCard.capabilities.streaming: true`. Just like `message/send`, a task which has reached a terminal state (completed, canceled, rejected, or failed) can't be restarted. Sending a message to such a task will result in an error. For more information, refer to the [Life of a Task guide](./topics/life-of-a-task.md).

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `message/stream`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`MessageSendParams`](#711-messagesendparams-object) (same as `message/send`)
    -   **Response**: A stream of Server-Sent Events. Each SSE `data` field contains a [`SendStreamingMessageResponse`](#721-sendstreamingmessageresponse-object)

=== "gRPC"
    -   **URL:** `SendStreamingMessage`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message SendMessageRequest {
          Message msg = 1;
          SendMessageConfiguration configuration = 2;
        }
        ```
    -   **Response:**
        ```proto
        message StreamResponse {
          oneof payload {
            Task task;
            Message msg;
            TaskStatusUpdateEvent status_update;
            TaskArtifactUpdateEvent artifact_update;
          }
        }
        ```

=== "REST"
    -   **URL:** `/v1/message:stream`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```typescript
        {
          message: Message,
          configuration?: MessageSendConfiguration,
          metadata?: { [key: string]: any }
        }
        ```
    -   **Response:**
        ```typescript
        {
          message?: Message
          task?: Task
          statusUpdate?: TaskStatusUpdateEvent
          artifactUpdate?: TaskArtifactUpdateEvent
        }
        ```

</div>

#### 7.2.1. `SendStreamingMessageResponse` Object

This is the structure of the JSON object found in the `data` field of each Server-Sent Event sent by the server for a `message/stream` request or `tasks/resubscribe` request.

```ts { .no-copy }
--8<-- "types/src/types.ts:SendStreamingMessageResponse"

--8<-- "types/src/types.ts:SendStreamingMessageSuccessResponse"
```

#### 7.2.2. `TaskStatusUpdateEvent` Object

Carries information about a change in the task's status during streaming. This is one of the possible `result` types in a `SendStreamingMessageSuccessResponse`.

```ts { .no-copy }
--8<-- "types/src/types.ts:TaskStatusUpdateEvent"
```

#### 7.2.3. `TaskArtifactUpdateEvent` Object

Carries a new or updated artifact (or a chunk of an artifact) generated by the task during streaming. This is one of the possible `result` types in a `SendTaskStreamingResponse`.

```ts { .no-copy }
--8<-- "types/src/types.ts:TaskArtifactUpdateEvent"
```

### 7.3. `tasks/get`

Retrieves the current state (including status, artifacts, and optionally history) of a previously initiated task. This is typically used for polling the status of a task initiated with `message/send`, or for fetching the final state of a task after being notified via a push notification or after an SSE stream has ended.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/get`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`TaskQueryParams`](#731-taskqueryparams-object)
    -   **Response**: `Task`

=== "gRPC"
    -   **URL:** `GetTask`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message GetTaskRequest {
          // name=tasks/{id}
          string name;
          int32 history_length;
        }
        ```
    -   **Response**: `Task`

=== "REST"
    -   **URL:** `v1/tasks/{id}?historyLength={historyLength}`
    -   **HTTP Method:** `GET`
    -   **Payload:** None
    -   **Response**: `Task`

</div>

#### 7.3.1. `TaskQueryParams` Object

```ts { .no-copy }
--8<-- "types/src/types.ts:TaskQueryParams"
```

### `tasks/list`

<div class="grid cards" markdown>

=== "JSON-RPC"
    -  N/A

=== "gRPC"
    -   **URL:** `ListTask`
    -   **HTTP Method:** `GET`
    -   **Payload:**
        ```proto
        {}
        ```
    -   **Response**: `repeated Task`

=== "REST"
    -   **URL:** `/v1/tasks`
    -   **HTTP Method:** `GET`
    -   **Payload:**
        ```typescript
        {}
        ```
    -   **Response**: `[Task]`

</div>

### 7.4. `tasks/cancel`

Requests the cancellation of an ongoing task. The server will attempt to cancel the task, but success is not guaranteed (e.g., the task might have already completed or failed, or cancellation might not be supported at its current stage).

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/cancel`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`TaskIdParams`](#741-taskidparams-object-for-taskscancel-and-taskspushnotificationconfigget)
    -   **Response**: `Task`

=== "gRPC"
    -   **URL:** `CancelTask`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message CancelTaskRequest{
          // name=tasks/{id}
          string name;
        }
        ```
    -   **Response**: `Task`

=== "REST"
    -   **URL:** `/v1/tasks/{id}:cancel`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```typescript
        {
          name: string
        }
        ```
    -   **Response**: `Task`

</div>

#### 7.4.1. `TaskIdParams` Object (for `tasks/cancel` and `tasks/pushNotificationConfig/get`)

A simple object containing just the task ID and optional metadata.

```ts { .no-copy }
--8<-- "types/src/types.ts:TaskIdParams"
```

### 7.5. `tasks/pushNotificationConfig/set`

Sets or updates the push notification configuration for a specified task. This allows the client to tell the server where and how to send asynchronous updates for the task. Requires the server to have `AgentCard.capabilities.pushNotifications: true`.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/pushNotificationConfig/set`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`TaskPushNotificationConfig`](#610-taskpushnotificationconfig-object)
    -   **Response**: [`TaskPushNotificationConfig`](#610-taskpushnotificationconfig-object)

=== "gRPC"
    -   **URL:** `CreateTaskPushNotification`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message SetTaskPushNotificationRequest {
          TaskPushNotificationConfig config = 1;
        }
        ```
    -   **Response**: `TaskPushNotificationConfig`

=== "REST"
    -   **URL:** `/v1/tasks/{id}/pushNotificationConfigs`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```typescript
        {
          config: TaskPushNotificationConfig
        }
        ```
    -   **Response**: `TaskPushNotificationConfig`

</div>

### 7.6. `tasks/pushNotificationConfig/get`

Retrieves the current push notification configuration for a specified task. Requires the server to have `AgentCard.capabilities.pushNotifications: true`.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/pushNotificationConfig/get`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`GetTaskPushNotificationConfigParams`](#761-gettaskpushnotificationconfigparams-object-taskspushnotificationconfigget)
    -   **Response**: [`TaskPushNotificationConfig`](#610-taskpushnotificationconfig-object)

=== "gRPC"
    -   **URL:** `GetTaskPushNotification`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message TaskSubscriptionRequest {
          // name=tasks/{id}/pushNotification/{id}
          string name;
        }
        ```
    -   **Response**: `TaskPushNotificationConfig`

=== "REST"
    -   **URL:** `/v1/tasks/{taskId}/pushNotificationConfigs/{configId}`
    -   **HTTP Method:** `GET`
    -   **Payload:** None
    -   **Response**: `TaskPushNotificationConfig`

</div>

**Response `error` type (on failure)**: [`JSONRPCError`](#612-jsonrpcerror-object) (e.g., [`PushNotificationNotSupportedError`](#82-a2a-specific-errors), [`TaskNotFoundError`](#82-a2a-specific-errors)).

#### 7.6.1. `GetTaskPushNotificationConfigParams` Object (`tasks/pushNotificationConfig/get`)

A object for fetching the push notification configuration for a task.

```ts { .no-copy }
--8<-- "types/src/types.ts:GetTaskPushNotificationConfigParams"
```

### 7.7. `tasks/pushNotificationConfig/list`

Retrieves the associated push notification configurations for a specified task. Requires the server to have `AgentCard.capabilities.pushNotifications: true`.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/pushNotificationConfig/list`
    -   **HTTP Method:** `POST`
    -   **Payload:** [`ListTaskPushNotificationConfigParams`](#771-listtaskpushnotificationconfigparams-object-taskspushnotificationconfiglist)
    -   **Response**: `TaskPushNotificationConfig[]`

=== "gRPC"
    -   **URL:** `ListTaskPushNotification`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message ListTaskPushNotificationRequest {
          // parent=tasks/{id}
          string parent = 1;
        }
        ```
    -   **Response**: `repeated TaskPushNotificationConfig`

=== "REST"
    -   **URL:** `/v1/tasks/{id}/pushNotificationConfigs`
    -   **HTTP Method:** `GET`
    -   **Payload:**: None
    -   **Response**: `[TaskPushNotificationConfig]`

</div>

#### 7.7.1. `ListTaskPushNotificationConfigParams` Object (`tasks/pushNotificationConfig/list`)

A object for fetching the push notification configurations for a task.

```ts { .no-copy }
--8<-- "types/src/types.ts:ListTaskPushNotificationConfigParams"
```

### 7.8. `tasks/pushNotificationConfig/delete`

Deletes an associated push notification configuration for a task. Requires the server to have `AgentCard.capabilities.pushNotifications: true`.

- **Request `params` type**: [`DeleteTaskPushNotificationConfigParams`](#781-deletetaskpushnotificationconfigparams-object-taskspushnotificationconfigdelete)
- **Response `result` type (on success)**: [`null`]
- **Response `error` type (on failure)**: [`JSONRPCError`](#612-jsonrpcerror-object) (e.g., [`PushNotificationNotSupportedError`](#82-a2a-specific-errors), [`TaskNotFoundError`](#82-a2a-specific-errors)).

#### 7.8.1. `DeleteTaskPushNotificationConfigParams` Object (`tasks/pushNotificationConfig/delete`)

A object for deleting an associated push notification configuration for a task.

```ts { .no-copy }
--8<-- "types/src/types.ts:DeleteTaskPushNotificationConfigParams"
```

### 7.9. `tasks/resubscribe`

Allows a client to reconnect to an SSE stream for an ongoing task after a previous connection (from `message/stream` or an earlier `tasks/resubscribe`) was interrupted. Requires the server to have `AgentCard.capabilities.streaming: true`.

The purpose is to resume receiving _subsequent_ updates. The server's behavior regarding events missed during the disconnection period (e.g., whether it attempts to backfill some missed events or only sends new ones from the point of resubscription) is implementation-dependent and not strictly defined by this specification.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `tasks/resubscribe`
    -   **HTTP Method:** `POST`
    -   **Payload**: [`TaskIdParams`](#741-taskidparams-object-for-taskscancel-and-taskspushnotificationconfigget)
    -   **Response**: A stream of Server-Sent Events. Each SSE `data` field contains a [`SendStreamingMessageResponse`](#721-sendstreamingmessageresponse-object)

=== "gRPC"
    -   **URL:** `TaskSubscription`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```proto
        message TaskSubscriptionRequest{
          // name=tasks/{id}
          string name;
        }
        ```
    -   **Response:**
        ```proto
        message StreamResponse {
          oneof payload {
            Task task;
            Message msg;
            TaskStatusUpdateEvent status_update;
            TaskArtifactUpdateEvent artifact_update;
          }
        }
        ```

=== "REST"
    -   **URL:** `/v1/tasks/{id}:subscribe`
    -   **HTTP Method:** `POST`
    -   **Payload:**
        ```typescript
        {
          name: string
        }
        ```
    -   **Response:**
        ```typescript
        {
          message?: Message
          task?: Task
          statusUpdate?: TaskStatusUpdateEvent
          artifactUpdate?: TaskArtifactUpdateEvent
        }
        ```

</div>

### 7.10. `agent/getAuthenticatedExtendedCard`

Retrieves a potentially more detailed version of the Agent Card after the client has authenticated. This endpoint is available only if `AgentCard.supportsAuthenticatedExtendedCard` is `true`.

- **Authentication**: The client **MUST** authenticate the request using one of the schemes declared in the public `AgentCard.securitySchemes` and `AgentCard.security` fields.
- **Response `result` type (on success)**: `AgentCard` (A complete Agent Card object, which may contain additional details or skills not present in the public card).
- **Response `error` type (on failure)**: Standard HTTP error codes.
    - `401 Unauthorized`: Authentication failed (missing or invalid credentials). The server **SHOULD** include a `WWW-Authenticate` header.

<div class="grid cards" markdown>

=== "JSON-RPC"
    -   **URL:** `agent/getAuthenticatedExtendedCard`
    -   **HTTP Method:** `POST`
    -   **Payload:** None
    -   **Response:** `AgentCard`

=== "gRPC"
    -   **URL:** `GetAgentCard`
    -   **HTTP Method:** `POST`
    -   **Payload:** None
    -   **Response:** `AgentCard`

=== "REST"
    -   **URL:** `/v1/card`
    -   **HTTP Method:** `GET`
    -   **Payload:** None
    -   **Response:** `AgentCard`

</div>

Clients retrieving this authenticated card **SHOULD** replace their cached public Agent Card with the content received from this endpoint for the duration of their authenticated session or until the card's version changes.

```ts { .no-copy }
--8<-- "types/src/types.ts:GetAuthenticatedExtendedCardSuccessResponse"
```
