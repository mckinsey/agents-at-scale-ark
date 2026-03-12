---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 3. A2A Protocol Operations

This section describes the core operations of the A2A protocol in a binding-independent manner. These operations define the fundamental capabilities that all A2A implementations must support, regardless of the underlying binding mechanism.

### 3.1. Core Operations

The following operations define the fundamental capabilities that all A2A implementations must support, independent of the specific protocol binding used. For a quick reference mapping of these operations to protocol-specific method names and endpoints, see [Section 5.3 (Method Mapping Reference)](#53-method-mapping-reference). For detailed protocol-specific implementation details, see:

- [Section 9: JSON-RPC Protocol Binding](#9-json-rpc-protocol-binding)
- [Section 10: gRPC Protocol Binding](#10-grpc-protocol-binding)
- [Section 11: HTTP+JSON/REST Protocol Binding](#11-httpjsonrest-protocol-binding)

#### 3.1.1. Send Message

The primary operation for initiating agent interactions. Clients send a message to an agent and receive either a task that tracks the processing or a direct response message.

**Inputs:**

- [`SendMessageRequest`](#321-sendmessagerequest): Request object containing the message, configuration, and metadata

**Outputs:**

- [`Task`](#411-task): A task object representing the processing of the message, OR
- [`Message`](#414-message): A direct response message (for simple interactions that don't require task tracking)

**Errors:**

- [`ContentTypeNotSupportedError`](#332-error-handling): A Media Type provided in the request's message parts is not supported by the agent.
- [`UnsupportedOperationError`](#332-error-handling): Messages sent to Tasks that are in a terminal state (e.g., completed, canceled, rejected) cannot accept further messages.
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

**Behavior:**

The agent MAY create a new `Task` to process the provided message asynchronously or MAY return a direct `Message` response for simple interactions. The operation MUST return immediately with either task information or response message. Task processing MAY continue asynchronously after the response when a [`Task`](#411-task) is returned.

#### 3.1.2. Send Streaming Message

Similar to Send Message but with real-time streaming of updates during processing.

**Inputs:**

- [`SendMessageRequest`](#321-sendmessagerequest): Request object containing the message, configuration, and metadata

**Outputs:**

- [`Stream Response`](#323-stream-response) object containing:
    - Initial response: [`Task`](#411-task) object OR [`Message`](#414-message) object
    - Subsequent events following a `Task` MAY include stream of [`TaskStatusUpdateEvent`](#421-taskstatusupdateevent) and [`TaskArtifactUpdateEvent`](#422-taskartifactupdateevent) objects
- Final completion indicator

**Errors:**

- [`UnsupportedOperationError`](#332-error-handling): Streaming is not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`UnsupportedOperationError`](#332-error-handling): Messages sent to Tasks that are in a terminal state (e.g., completed, canceled, rejected) cannot accept further messages.
- [`ContentTypeNotSupportedError`](#332-error-handling): A Media Type provided in the request's message parts is not supported by the agent.
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

**Behavior:**

The operation MUST establish a streaming connection for real-time updates. The stream MUST follow one of these patterns:

1. **Message-only stream:** If the agent returns a [`Message`](#414-message), the stream MUST contain exactly one `Message` object and then close immediately. No task tracking or updates are provided.

2. **Task lifecycle stream:** If the agent returns a [`Task`](#411-task), the stream MUST begin with the Task object, followed by zero or more [`TaskStatusUpdateEvent`](#421-taskstatusupdateevent) or [`TaskArtifactUpdateEvent`](#422-taskartifactupdateevent) objects. The stream MUST close when the task reaches a terminal state (e.g. completed, failed, canceled, rejected).

The agent MAY return a `Task` for complex processing with status/artifact updates or MAY return a `Message` for direct streaming responses without task overhead. The implementation MUST provide immediate feedback on progress and intermediate results.

#### 3.1.3. Get Task

Retrieves the current state (including status, artifacts, and optionally history) of a previously initiated task. This is typically used for polling the status of a task initiated with message/send, or for fetching the final state of a task after being notified via a push notification or after a stream has ended.

**Inputs:**

{{ proto_to_table("GetTaskRequest") }}

See [History Length Semantics](#324-history-length-semantics) for details about `historyLength`.

**Outputs:**

- [`Task`](#411-task): Current state and artifacts of the requested task

**Errors:**

- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

#### 3.1.4. List Tasks

Retrieves a list of tasks with optional filtering and pagination capabilities. This method allows clients to discover and manage multiple tasks across different contexts or with specific status criteria.

**Inputs:**

{{ proto_to_table("ListTasksRequest") }}

When `includeArtifacts` is false (the default), the artifacts field MUST be omitted entirely from each Task object in the response. The field should not be present as an empty array or null value. When `includeArtifacts` is true, the artifacts field should be included with its actual content (which may be an empty array if the task has no artifacts).

**Outputs:**

{{ proto_to_table("ListTasksResponse") }}

Note on `nextPageToken`: The `nextPageToken` field MUST always be present in the response. When there are no more results to retrieve (i.e., this is the final page), the field MUST be set to an empty string (""). Clients should check for an empty string to determine if more pages are available.

**Errors:**

None specific to this operation beyond standard protocol errors.

**Behavior:**

The operation MUST return only tasks visible to the authenticated client and MUST use cursor-based pagination for performance and consistency. Tasks MUST be sorted by last update time in descending order. Implementations MUST implement appropriate authorization scoping to ensure clients can only access authorized tasks. See [Section 13.1 Data Access and Authorization Scoping](#131-data-access-and-authorization-scoping) for detailed security requirements.

***Pagination Strategy:***

This method uses cursor-based pagination (via `pageToken`/`nextPageToken`) rather than offset-based pagination for better performance and consistency, especially with large datasets. Cursor-based pagination avoids the "deep pagination problem" where skipping large numbers of records becomes inefficient for databases. This approach is consistent with the gRPC specification, which also uses cursor-based pagination (page_token/next_page_token).

***Ordering:***

Implementations MUST return tasks sorted by their status timestamp time in descending order (most recently updated tasks first). This ensures consistent pagination and allows clients to efficiently monitor recent task activity.

#### 3.1.5. Cancel Task

Requests the cancellation of an ongoing task. The server will attempt to cancel the task, but success is not guaranteed (e.g., the task might have already completed or failed, or cancellation might not be supported at its current stage).

**Inputs:**

{{ proto_to_table("CancelTaskRequest") }}

**Outputs:**

- Updated [`Task`](#411-task) with cancellation status

**Errors:**

- [`TaskNotCancelableError`](#332-error-handling): The task is not in a cancelable state (e.g., already completed, failed, or canceled).
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

**Behavior:**

The operation attempts to cancel the specified task and returns its updated state.

#### 3.1.6. Subscribe to Task

<span id="79-taskssubscribe"></span>

Establishes a streaming connection to receive updates for an existing task.

**Inputs:**

{{ proto_to_table("SubscribeToTaskRequest") }}

**Outputs:**

- [`Stream Response`](#323-stream-response) object containing:
    - Initial response: [`Task`](#411-task) object with current state
    - Stream of [`TaskStatusUpdateEvent`](#421-taskstatusupdateevent) and [`TaskArtifactUpdateEvent`](#422-taskartifactupdateevent) objects

**Errors:**

- [`UnsupportedOperationError`](#332-error-handling): Streaming is not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.
- [`UnsupportedOperationError`](#332-error-handling): The operation is attempted on a task that is in a terminal state (`completed`, `failed`, `canceled`, or `rejected`).

**Behavior:**

The operation enables real-time monitoring of task progress and can be used with any task that is not in a terminal state. The stream MUST terminate when the task reaches a terminal state (`completed`, `failed`, `canceled`, or `rejected`).

The operation MUST return a `Task` object as the first event in the stream, representing the current state of the task at the time of subscription. This prevents a potential loss of information between a call to `GetTask` and calling `SubscribeToTask`.

#### 3.1.7. Create Push Notification Config

<span id="75-taskspushnotificationconfigset"></span>
<span id="317-create-push-notification-config"></span>

Creates a push notification configuration for a task to receive asynchronous updates via webhook.

**Inputs:**

{{ proto_to_table("CreateTaskPushNotificationConfigRequest") }}

**Outputs:**

- [`PushNotificationConfig`](#431-pushnotificationconfig): Created configuration with assigned ID

**Errors:**

- [`PushNotificationNotSupportedError`](#332-error-handling): Push notifications are not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

**Behavior:**

The operation MUST establish a webhook endpoint for task update notifications. When task updates occur, the agent will send HTTP POST requests to the configured webhook URL with [`StreamResponse`](#323-stream-response) payloads (see [Push Notification Payload](#433-push-notification-payload) for details). This operation is only available if the agent supports push notifications capability. The configuration MUST persist until task completion or explicit deletion.

 <span id="tasks-push-notification-config-operations"></span><span id="grpc-push-notification-operations"></span><span id="push-notification-operations"></span>

#### 3.1.8. Get Push Notification Config

<span id="76-taskspushnotificationconfigget"></span>

Retrieves an existing push notification configuration for a task.

**Inputs:**

{{ proto_to_table("GetTaskPushNotificationConfigRequest") }}

**Outputs:**

- [`PushNotificationConfig`](#431-pushnotificationconfig): The requested configuration

**Errors:**

- [`PushNotificationNotSupportedError`](#332-error-handling): Push notifications are not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`TaskNotFoundError`](#332-error-handling): The push notification configuration does not exist.

**Behavior:**

The operation MUST return configuration details including webhook URL and notification settings. The operation MUST fail if the configuration does not exist or the client lacks access.

#### 3.1.9. List Push Notification Configs

Retrieves all push notification configurations for a task.

**Inputs:**

{{ proto_to_table("ListTaskPushNotificationConfigsRequest") }}

**Outputs:**

{{ proto_to_table("ListTaskPushNotificationConfigsResponse") }}

**Errors:**

- [`PushNotificationNotSupportedError`](#332-error-handling): Push notifications are not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist or is not accessible.

**Behavior:**

The operation MUST return all active push notification configurations for the specified task and MAY support pagination for tasks with many configurations.

#### 3.1.10. Delete Push Notification Config

Removes a push notification configuration for a task.

**Inputs:**

{{ proto_to_table("DeleteTaskPushNotificationConfigRequest") }}

**Outputs:**

- Confirmation of deletion (implementation-specific)

**Errors:**

- [`PushNotificationNotSupportedError`](#332-error-handling): Push notifications are not supported by the agent (see [Capability Validation](#334-capability-validation)).
- [`TaskNotFoundError`](#332-error-handling): The task ID does not exist.

**Behavior:**

The operation MUST permanently remove the specified push notification configuration. No further notifications will be sent to the configured webhook after deletion. This operation MUST be idempotent - multiple deletions of the same config have the same effect.

#### 3.1.11. Get Extended Agent Card

Retrieves a potentially more detailed version of the Agent Card after the client has authenticated. This endpoint is available only if `AgentCard.capabilities.extendedAgentCard` is `true`.

**Inputs:**

{{ proto_to_table("GetExtendedAgentCardRequest") }}

**Outputs:**

- [`AgentCard`](#441-agentcard): A complete Agent Card object, which may contain additional details or skills not present in the public card

**Errors:**

- [`UnsupportedOperationError`](#332-error-handling): The agent does not support authenticated extended cards (see [Capability Validation](#334-capability-validation)).
- [`ExtendedAgentCardNotConfiguredError`](#332-error-handling): The agent declares support but does not have an extended agent card configured.

**Behavior:**

- **Authentication**: The client MUST authenticate the request using one of the schemes declared in the public `AgentCard.securitySchemes` and `AgentCard.security` fields.
- **Extended Information**: The operation MAY return different details based on client authentication level, including additional skills, capabilities, or configuration not available in the public Agent Card.
- **Card Replacement**: Clients retrieving this extended card SHOULD replace their cached public Agent Card with the content received from this endpoint for the duration of their authenticated session or until the card's version changes.
- **Availability**: This operation is only available if the public Agent Card declares `capabilities.extendedAgentCard: true`.

For detailed security guidance on extended agent cards, see [Section 13.3 Extended Agent Card Access Control](#133-extended-agent-card-access-control).

### 3.2. Operation Parameter Objects

This section defines common parameter objects used across multiple operations.

#### 3.2.1. SendMessageRequest

{{ proto_to_table("SendMessageRequest") }}

#### 3.2.2. SendMessageConfiguration

{{ proto_to_table("SendMessageConfiguration") }}

**Blocking vs Non-Blocking Execution:**

The `blocking` field in [`SendMessageConfiguration`](#322-sendmessageconfiguration) controls whether the operation waits for task completion:

- **Blocking (`blocking: true`)**: The operation MUST wait until the task reaches a terminal state (`COMPLETED`, `FAILED`, `CANCELED`, `REJECTED`) or an interrupted state (`INPUT_REQUIRED`, `AUTH_REQUIRED`) before returning. The response MUST include the latest task state with all artifacts and status information.

- **Non-Blocking (`blocking: false`)**: The operation MUST return immediately after creating the task, even if processing is still in progress. The returned task will have an in-progress state (e.g., `working`, `input_required`). It is the caller's responsibility to poll for updates using [Get Task](#313-get-task), subscribe via [Subscribe to Task](#316-subscribe-to-task), or receive updates via push notifications.

The `blocking` field has no effect:

- when the operation returns a direct [`Message`](#414-message) response instead of a task.
- for streaming operations, which always return updates in real-time.
- on configured push notification configurations, which operates independently of blocking mode.

#### 3.2.3. Stream Response

<span id="323-stream-response"></span>
<span id="72-messagestream"></span>

{{ proto_to_table("StreamResponse") }}

This wrapper allows streaming endpoints to return different types of updates through a single response stream while maintaining type safety.

#### 3.2.4. History Length Semantics

The `historyLength` parameter appears in multiple operations and controls how much task history is returned in responses. This parameter follows consistent semantics across all operations:

- **Unset/undefined**: No limit imposed; server returns its default amount of history (implementation-defined, may be all history)
- **0**: No history should be returned; the `history` field SHOULD be omitted
- **> 0**: Return at most this many recent messages from the task's history

#### 3.2.5. Metadata

A flexible key-value map for passing additional context or parameters with operations. Metadata keys and are strings and values can be any valid value that can be represented in JSON. [`Extensions`](#46-extensions) can be used to strongly type metadata values for specific use cases.

#### 3.2.6 Service Parameters

A key-value map for passing horizontally applicable context or parameters with case-insensitive string keys and case-sensitive string values. The transmission mechanism for these service parameter key-value pairs is defined by the specific protocol binding (e.g., HTTP headers for HTTP-based bindings, gRPC metadata for gRPC bindings). Custom protocol bindings **MUST** specify how service parameters are transmitted in their binding specification.

**Standard A2A Service Parameters:**

| Name             | Description                                                                                                                                             | Example Value                                                                                 |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| `A2A-Extensions` | Comma-separated list of extension URIs that the client wants to use for the request                                                                     | `https://example.com/extensions/geolocation/v1,https://standards.org/extensions/citations/v1` |
| `A2A-Version`    | The A2A protocol version that the client is using. If the version is not supported, the agent returns [`VersionNotSupportedError`](#332-error-handling) | `0.3`                                                                                         |

As service parameter names MAY need to co-exist with other parameters defined by the underlying transport protocol or infrastructure, all service parameters defined by this specification will be prefixed with `a2a-`.

### 3.3. Operation Semantics

#### 3.3.1. Idempotency

- **Get operations** (Get Task, List Tasks, Get Extended Agent Card) are naturally idempotent
- **Send Message** operations MAY be idempotent. Agents may utilize the messageId to detect duplicate messages.
- **Cancel Task** operations are idempotent - multiple cancellation requests have the same effect. A duplicate cancellation request MAY return `TaskNotFoundError` if the task has already been canceled and purged.

#### 3.3.2. Error Handling

All operations may return errors in the following categories. Servers **MUST** return appropriate errors and **SHOULD** provide actionable information to help clients resolve issues.

**Error Categories and Server Requirements:**

- **Authentication Errors**: Invalid or missing credentials
    - Servers **MUST** reject requests with invalid or missing authentication credentials
    - Servers **SHOULD** include authentication challenge information in the error response
    - Servers **SHOULD** specify which authentication scheme is required
    - Example error codes: HTTP `401 Unauthorized`, gRPC `UNAUTHENTICATED`, JSON-RPC custom error
    - Example scenarios: Missing bearer token, expired API key, invalid OAuth token

- **Authorization Errors**: Insufficient permissions for requested operation
    - Servers **MUST** return an authorization error when the authenticated client lacks required permissions
    - Servers **SHOULD** indicate what permission or scope is missing (without leaking sensitive information about resources the client cannot access)
    - Servers **MUST NOT** reveal the existence of resources the client is not authorized to access
    - Example error codes: HTTP `403 Forbidden`, gRPC `PERMISSION_DENIED`, JSON-RPC custom error
    - Example scenarios: Attempting to access a task created by another user, insufficient OAuth scopes

- **Validation Errors**: Invalid input parameters or message format
    - Servers **MUST** validate all input parameters before processing
    - Servers **SHOULD** specify which parameter(s) failed validation and why
    - Servers **SHOULD** provide guidance on valid parameter values or formats
    - Example error codes: HTTP `400 Bad Request`, gRPC `INVALID_ARGUMENT`, JSON-RPC `-32602 Invalid params`
    - Example scenarios: Invalid task ID format, missing required message parts, unsupported content type

- **Resource Errors**: Requested task not found or not accessible
    - Servers **MUST** return a not found error when a requested resource does not exist or is not accessible to the authenticated client
    - Servers **SHOULD NOT** distinguish between "does not exist" and "not authorized" to prevent information leakage
    - Example error codes: HTTP `404 Not Found`, gRPC `NOT_FOUND`, JSON-RPC custom error (see A2A-specific errors)
    - Example scenarios: Task ID does not exist, task has been deleted, configuration not found

- **System Errors**: Internal agent failures or temporary unavailability
    - Servers **SHOULD** return appropriate error codes for temporary failures vs. permanent errors
    - Servers **MAY** include retry guidance (e.g., Retry-After header in HTTP)
    - Servers **SHOULD** log system errors for diagnostic purposes
    - Example error codes: HTTP `500 Internal Server Error` or `503 Service Unavailable`, gRPC `INTERNAL` or `UNAVAILABLE`, JSON-RPC `-32603 Internal error`
    - Example scenarios: Database connection failure, downstream service timeout, rate limit exceeded

**Error Payload Structure:**

All error responses in the A2A protocol, regardless of binding, **MUST** convey the following information:

1. **Error Code**: A machine-readable identifier for the error type (e.g., string code, numeric code, or protocol-specific status)
2. **Error Message**: A human-readable description of the error
3. **Error Details** (optional): Additional structured information about the error, such as:
    - Affected fields or parameters
    - Contextual information (e.g., task ID, timestamp)
    - Suggestions for resolution

Protocol bindings **MUST** map these elements to their native error representations while preserving semantic meaning. See binding-specific sections for concrete error format examples: [JSON-RPC Error Handling](#95-error-handling), [gRPC Error Handling](#106-error-handling), and [HTTP/REST Error Handling](#116-error-handling).

**A2A-Specific Errors:**

| Error Name                            | Description                                                                                                                                                       |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskNotFoundError`                   | The specified task ID does not correspond to an existing or accessible task. It might be invalid, expired, or already completed and purged.                       |
| `TaskNotCancelableError`              | An attempt was made to cancel a task that is not in a cancelable state (e.g., it has already reached a terminal state like `completed`, `failed`, or `canceled`). |
| `PushNotificationNotSupportedError`   | Client attempted to use push notification features but the server agent does not support them (i.e., `AgentCard.capabilities.pushNotifications` is `false`).      |
| `UnsupportedOperationError`           | The requested operation or a specific aspect of it is not supported by this server agent implementation.                                                          |
| `ContentTypeNotSupportedError`        | A Media Type provided in the request's message parts or implied for an artifact is not supported by the agent or the specific skill being invoked.                |
| `InvalidAgentResponseError`           | An agent returned a response that does not conform to the specification for the current method.                                                                   |
| `ExtendedAgentCardNotConfiguredError` | The agent does not have an extended agent card configured when one is required for the requested operation.                                                       |
| `ExtensionSupportRequiredError`       | Server requested use of an extension marked as `required: true` in the Agent Card but the client did not declare support for it in the request.                   |
| `VersionNotSupportedError`            | The A2A protocol version specified in the request (via `A2A-Version` service parameter) is not supported by the agent.                                            |

#### 3.3.3. Asynchronous Processing

A2A operations are designed for asynchronous task execution. Operations return immediately with either [`Task`](#411-task) objects or [`Message`](#414-message) objects, and when a Task is returned, processing continues in the background. Clients retrieve task updates through polling, streaming, or push notifications (see [Section 3.5](#35-task-update-delivery-mechanisms)). Agents MAY accept additional messages for tasks in non-terminal states to enable multi-turn interactions (see [Section 3.4](#34-multi-turn-interactions)).

#### 3.3.4. Capability Validation

Agents declare optional capabilities in their [`AgentCard`](#441-agentcard). When clients attempt to use operations or features that require capabilities not declared as supported in the Agent Card, the agent **MUST** return an appropriate error response:

- **Push Notifications**: If `AgentCard.capabilities.pushNotifications` is `false` or not present, operations related to push notification configuration (Create, Get, List, Delete) **MUST** return [`PushNotificationNotSupportedError`](#332-error-handling).
- **Streaming**: If `AgentCard.capabilities.streaming` is `false` or not present, attempts to use `SendStreamingMessage` or `SubscribeToTask` operations **MUST** return [`UnsupportedOperationError`](#332-error-handling).
- **Extended Agent Card**: If `AgentCard.capabilities.extendedAgentCard` is `false` or not present, attempts to call the Get Extended Agent Card operation **MUST** return [`UnsupportedOperationError`](#332-error-handling). If the agent declares support but has not configured an extended card, it **MUST** return [`ExtendedAgentCardNotConfiguredError`](#332-error-handling).
- **Extensions**: When a server requests use of an extension marked as `required: true` in the Agent Card but the client does not declare support for it, the agent **MUST** return [`ExtensionSupportRequiredError`](#332-error-handling).

Clients **SHOULD** validate capability support by examining the Agent Card before attempting operations that require optional capabilities.

### 3.4. Multi-Turn Interactions

The A2A protocol supports multi-turn conversations through context identifiers and task references, enabling agents to maintain conversational continuity across multiple interactions.

#### 3.4.1. Context Identifier Semantics

A `contextId` is an identifier that logically groups multiple related [`Task`](#411-task) and [`Message`](#414-message) objects, providing continuity across a series of interactions.

**Generation and Assignment:**

- Agents **MAY** generate a new `contextId` when processing a [`Message`](#414-message) that does not include a `contextId` field
- If an agent generates a new `contextId`, it **MUST** be included in the response (either [`Task`](#411-task) or [`Message`](#414-message))
- Agents **MAY** accept and preserve client-provided `contextId` values
- If an agent cannot accept a client-provided `contextId`, it **MUST** reject the request with an error and **MUST NOT** generate a new `contextId` for the response
- Clients **SHOULD NOT** provide a client-generated `contextId` to a server unless they understand how the server will process that `contextId`
- Server-generated `contextId` values **SHOULD** be treated as opaque identifiers by clients

**Grouping and Scope:**

- A `contextId` logically groups multiple [`Task`](#411-task) objects and [`Message`](#414-message) objects that are part of the same conversational context
- All tasks and messages with the same `contextId` **SHOULD** be treated as part of the same conversational session
- Agents **MAY** use the `contextId` to maintain internal state, conversational history, or LLM context across multiple interactions
- Agents **MAY** implement context expiration or cleanup policies and **SHOULD** document any such policies

#### 3.4.2. Task Identifier Semantics

A `taskId` is a unique identifier for a [`Task`](#411-task) object, representing a stateful unit of work with a defined lifecycle.

**Generation and Assignment:**

- Task IDs are **server-generated** when a new task is created in response to a [`Message`](#414-message)
- Agents **MUST** generate a unique `taskId` for each new task they create
- The generated `taskId` **MUST** be included in the [`Task`](#411-task) object returned to the client
- When a client includes a `taskId` in a [`Message`](#414-message), it **MUST** reference an existing task
- Agents **MUST** return a [`TaskNotFoundError`](#332-error-handling) if the provided `taskId` does not correspond to an existing task
- Client-provided `taskId` values for creating new tasks is **NOT** supported

#### 3.4.3. Multi-Turn Conversation Patterns

The A2A protocol supports several patterns for multi-turn interactions:

**Context Continuity:**

- [`Task`](#411-task) objects maintain conversation context through the `contextId` field
- Clients **MAY** include the `contextId` in subsequent messages to indicate continuation of a previous interaction
- Clients **MAY** use `taskId` (with or without `contextId`) to continue or refine a specific task
- Clients **MAY** use `contextId` without `taskId` to start a new task within an existing conversation context
- Agents **MUST** infer `contextId` from the task if only `taskId` is provided
- Agents **MUST** reject messages containing mismatching `contextId` and `taskId` (i.e., the provided `contextId` is different from that of the referenced [`Task`](#411-task)).

**Input Required State:**

- Agents can request additional input mid-processing by transitioning a task to the `input-required` state
- The client continues the interaction by sending a new message with the same `taskId` and `contextId`

**Follow-up Messages:**

- Clients can send additional messages with `taskId` references to continue or refine existing tasks
- Clients **SHOULD** use the `referenceTaskIds` field in [`Message`](#414-message) to explicitly reference related tasks
- Agents **SHOULD** use referenced tasks to understand the context and intent of follow-up requests

**Context Inheritance:**

- New tasks created within the same `contextId` can inherit context from previous interactions
- Agents **SHOULD** leverage the shared `contextId` to provide contextually relevant responses

### 3.5. Task Update Delivery Mechanisms

The A2A protocol provides three complementary mechanisms for clients to receive updates about task progress and completion.

#### 3.5.1. Overview of Update Mechanisms

**Polling (Get Task):**

- Client periodically calls Get Task ([Section 3.1.3](#313-get-task)) to check task status
- Simple to implement, works with all protocol bindings
- Higher latency, potential for unnecessary requests
- Best for: Simple integrations, infrequent updates, clients behind restrictive firewalls

**Streaming:**

- Real-time delivery of events as they occur
- Operations: Stream Message ([Section 3.1.2](#312-send-streaming-message)) and Subscribe to Task ([Section 3.1.6](#316-subscribe-to-task))
- Low latency, efficient for frequent updates
- Requires persistent connection support
- Best for: Interactive applications, real-time dashboards, live progress monitoring
- Requires `AgentCard.capabilities.streaming` to be `true`

**Push Notifications (WebHooks):**

- Agent sends HTTP POST requests to client-registered endpoints when task state changes
- Client does not maintain persistent connection
- Asynchronous delivery, client must be reachable via HTTP
- Best for: Server-to-server integrations, long-running tasks, event-driven architectures
- Operations: Create ([Section 3.1.7](#317-create-push-notification-config)), Get ([Section 3.1.8](#76-taskspushnotificationconfigget)), List ([Section 3.1.9](#319-list-push-notification-configs)), Delete ([Section 3.1.10](#3110-delete-push-notification-config))
- Event types: TaskStatusUpdateEvent ([Section 4.2.1](#421-taskstatusupdateevent)), TaskArtifactUpdateEvent ([Section 4.2.2](#422-taskartifactupdateevent)), WebHook payloads ([Section 4.3](#43-push-notification-objects))
- Requires `AgentCard.capabilities.pushNotifications` to be `true`
- Regardless of the protocol binding being used by the agent, WebHook calls use plain HTTP and the JSON payloads as defined in the HTTP protocol binding

#### 3.5.2. Streaming Event Delivery

**Event Ordering:**

All implementations MUST deliver events in the order they were generated. Events MUST NOT be reordered during transmission, regardless of protocol binding.

**Multiple Streams Per Task:**

An agent MAY serve multiple concurrent streams to one or more clients for the same task. This allows multiple clients (or the same client with multiple connections) to independently subscribe to and receive updates about a task's progress.

When multiple streams are active for a task:

- Events MUST be broadcast to all active streams for that task
- Each stream MUST receive the same events in the same order
- Closing one stream MUST NOT affect other active streams for the same task
- The task lifecycle is independent of any individual stream's lifecycle

This capability enables scenarios such as:

- Multiple team members monitoring the same long-running task
- A client reconnecting to a task after a network interruption by opening a new stream
- Different applications or dashboards displaying real-time updates for the same task

#### 3.5.3. Push Notification Delivery

Push notifications are delivered via HTTP POST to client-registered webhook endpoints. The delivery semantics and reliability guarantees are defined in [Section 4.3](#43-push-notification-objects).

### 3.6 Versioning

The specific version of the A2A protocol in use is identified using the `Major.Minor` elements (e.g. `1.0`) of the corresponding A2A specification version. Patch version numbers used by the specification, do not affect protocol compatibility. Patch version numbers SHOULD NOT be used in requests, responses and Agent Cards, and MUST not be considered when clients and servers negotiate protocol versions.

#### 3.6.1 Client Responsibilities

Clients MUST send the `A2A-Version` header with each request to maintain compatibility after an agent upgrades to a new version of the protocol (except for 0.3 Clients - 0.3 will be assumed for empty header). Sending the `A2A-Version` header also provides visibility to agents about version usage in the ecosystem, which can help inform the risks of inplace version upgrades.

**Example of HTTP GET Request with Version Header:**

```http
GET /tasks/task-123 HTTP/1.1
Host: agent.example.com
A2A-Version: 1.0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

Clients MAY provide the `A2A-Version` as a request parameter instead of a header.

**Example of HTTP GET Request with Version request parameter:**

```http
GET /tasks/task-123?A2A-Version=1.0 HTTP/1.1
Host: agent.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

#### 3.6.2 Server Responsibilities

Agents MUST process requests using the semantics of the requested `A2A-Version` (matching `Major.Minor`). If the version is not supported by the interface, agents MUST return a [`VersionNotSupportedError`](#332-error-handling).

Agents MUST interpret empty value as 0.3 version.

Agents CAN expose multiple interfaces for the same transport with different versions under the same or different URLs.

#### 3.6.3 Tooling support

Tooling libraries and SDKs that implement the A2A protocol MUST provide mechanisms to help clients manage protocol versioning, such as negotiation of the transport and protocol version used. Client Agents that require the latest features of the protocol should be configured to request specific versions and avoid automatic fallback to older versions, to prevent silently losing functionality.

### 3.7 Messages and Artifacts

Messages and Artifacts serve distinct purposes within the A2A protocol. The core interaction model defined by A2A is for clients to send messages to initiate a task that produces one or more artifacts.

Messages play several key roles:

- **Task Initiation**: Clients send Messages to agents to initiate new tasks.
- **Clarification Messages**: Agents may send Messages back to the client to request clarification prior to initiating a task.
- **Status Messages**: Agents attach Messages to status update events to inform clients about task progress, request additional input, or provide informational updates.
- **Task Interaction**: Clients send Messages to provide additional input or instructions for ongoing tasks.

Messages SHOULD NOT be used to deliver task outputs. Results SHOULD BE returned using Artifacts associated with a Task. This separation allows for a clear distinction between communication (Messages) and data output (Artifacts).

The Task History field contains Messages exchanged during task execution. However, not all Messages are guaranteed to be persisted in the Task history; for example, transient informational messages may not be stored. Messages exchanged prior to task creation may not be stored in Task history. The agent is responsible to determine which Messages are persisted in the Task History.

Clients using streaming to retrieve task updates MAY not receive all status update messages if the client is disconnected and then reconnects. Messages MUST NOT be considered a reliable delivery mechanism for critical information.

Agents MAY choose to persist all Messages that contain important information in the Task history to ensure clients can retrieve it later. However, clients MUST NOT rely on this behavior unless negotiated out-of-band.
