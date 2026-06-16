---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 4. Protocol Data Model

The A2A protocol defines a canonical data model using Protocol Buffers. All protocol bindings **MUST** provide functionally equivalent representations of these data structures.

### 4.1. Core Objects

<a id="Task"></a>

#### 4.1.1. Task

{{ proto_to_table("Task") }}

<a id="TaskStatus"></a>

#### 4.1.2. TaskStatus

{{ proto_to_table("TaskStatus") }}

<a id="TaskState"></a>

#### 4.1.3. TaskState

{{ proto_enum_to_table("TaskState") }}

<a id="Message"></a>

#### 4.1.4. Message

{{ proto_to_table("Message") }}

<a id="Role"></a>

#### 4.1.5. Role

{{ proto_enum_to_table("Role") }}

<a id="Part"></a>

#### 4.1.6. Part

{{ proto_to_table("Part") }}

<a id="Artifact"></a>

#### 4.1.7. Artifact

{{ proto_to_table("Artifact") }}

### 4.2. Streaming Events

<a id="TaskStatusUpdateEvent"></a>

#### 4.2.1. TaskStatusUpdateEvent

{{ proto_to_table("TaskStatusUpdateEvent") }}

<a id="TaskArtifactUpdateEvent"></a>

#### 4.2.2. TaskArtifactUpdateEvent

{{ proto_to_table("TaskArtifactUpdateEvent") }}

### 4.3. Push Notification Objects

<a id="PushNotificationConfig"></a>

#### 4.3.1. PushNotificationConfig

{{ proto_to_table("PushNotificationConfig") }}

<a id="PushNotificationAuthenticationInfo"></a>

#### 4.3.2. AuthenticationInfo

{{ proto_to_table("AuthenticationInfo") }}

#### 4.3.3. Push Notification Payload

When a task update occurs, the agent sends an HTTP POST request to the configured webhook URL. The payload uses the same [`StreamResponse`](#323-stream-response) format as streaming operations, allowing push notifications to deliver the same event types as real-time streams.

**Request Format:**

```http
POST {webhook_url}
Authorization: {authentication_scheme} {credentials}
Content-Type: application/json

{
  /* StreamResponse object - one of: */
  "task": { /* Task object */ },
  "message": { /* Message object */ },
  "statusUpdate": { /* TaskStatusUpdateEvent object */ },
  "artifactUpdate": { /* TaskArtifactUpdateEvent object */ }
}
```

**Payload Structure:**

The webhook payload is a [`StreamResponse`](#323-stream-response) object containing exactly one of the following:

- **task**: A [`Task`](#411-task) object with the current task state
- **message**: A [`Message`](#414-message) object containing a message response
- **statusUpdate**: A [`TaskStatusUpdateEvent`](#421-taskstatusupdateevent) indicating a status change
- **artifactUpdate**: A [`TaskArtifactUpdateEvent`](#422-taskartifactupdateevent) indicating artifact updates

**Authentication:**

The agent MUST include authentication credentials in the request headers as specified in the [`PushNotificationConfig.authentication`](#432-authenticationinfo) field. The format follows standard HTTP authentication patterns (Bearer tokens, Basic auth, etc.).

**Client Responsibilities:**

- Clients MUST respond with HTTP 2xx status codes to acknowledge successful receipt
- Clients SHOULD process notifications idempotently, as duplicate deliveries may occur
- Clients MUST validate the task ID matches an expected task
- Clients SHOULD implement appropriate security measures to verify the notification source

**Server Guarantees:**

- Agents MUST attempt delivery at least once for each configured webhook
- Agents MAY implement retry logic with exponential backoff for failed deliveries
- Agents SHOULD include a reasonable timeout for webhook requests (recommended: 10-30 seconds)
- Agents MAY stop attempting delivery after a configured number of consecutive failures

For detailed security guidance on push notifications, see [Section 13.2 Push Notification Security](#132-push-notification-security).

### 4.4. Agent Discovery Objects

<a id="AgentCard"></a>

#### 4.4.1. AgentCard

{{ proto_to_table("AgentCard") }}

<a id="AgentProvider"></a>

#### 4.4.2. AgentProvider

{{ proto_to_table("AgentProvider") }}

<a id="AgentCapabilities"></a>

#### 4.4.3. AgentCapabilities

{{ proto_to_table("AgentCapabilities") }}

<a id="AgentExtension"></a>

#### 4.4.4. AgentExtension

{{ proto_to_table("AgentExtension") }}

<a id="AgentSkill"></a>

#### 4.4.5. AgentSkill

{{ proto_to_table("AgentSkill") }}

<a id="AgentInterface"></a>

#### 4.4.6. AgentInterface

{{ proto_to_table("AgentInterface") }}

<a id="AgentCardSignature"></a>

#### 4.4.7. AgentCardSignature

{{ proto_to_table("AgentCardSignature") }}

### 4.5. Security Objects

<a id="Security"></a>
<a id="SecurityScheme"></a>

#### 4.5.1. SecurityScheme

{{ proto_to_table("SecurityScheme") }}

<a id="APIKeySecurityScheme"></a>

#### 4.5.2. APIKeySecurityScheme

{{ proto_to_table("APIKeySecurityScheme") }}

<a id="HTTPAuthSecurityScheme"></a>

#### 4.5.3. HTTPAuthSecurityScheme

{{ proto_to_table("HTTPAuthSecurityScheme") }}

<a id="OAuth2SecurityScheme"></a>

#### 4.5.4. OAuth2SecurityScheme

{{ proto_to_table("OAuth2SecurityScheme") }}

<a id="OpenIdConnectSecurityScheme"></a>

#### 4.5.5. OpenIdConnectSecurityScheme

{{ proto_to_table("OpenIdConnectSecurityScheme") }}

<a id="MutualTlsSecurityScheme"></a>

#### 4.5.6. MutualTlsSecurityScheme

{{ proto_to_table("MutualTlsSecurityScheme") }}

<a id="OAuthFlows"></a>

#### 4.5.7. OAuthFlows

{{ proto_to_table("OAuthFlows") }}

<a id="AuthorizationCodeOAuthFlow"></a>

#### 4.5.8. AuthorizationCodeOAuthFlow

{{ proto_to_table("AuthorizationCodeOAuthFlow") }}

<a id="ClientCredentialsOAuthFlow"></a>

#### 4.5.9. ClientCredentialsOAuthFlow

{{ proto_to_table("ClientCredentialsOAuthFlow") }}

<a id="DeviceCodeOAuthFlow"></a>

#### 4.5.10. DeviceCodeOAuthFlow

{{ proto_to_table("DeviceCodeOAuthFlow") }}

### 4.6. Extensions

The A2A protocol supports extensions to provide additional functionality or data beyond the core specification while maintaining backward compatibility and interoperability. Extensions allow agents to declare additional capabilities such as protocol enhancements or vendor-specific features, maintain compatibility with clients that don't support specific extensions, enable innovation through experimental or domain-specific features without modifying the core protocol, and facilitate standardization by providing a pathway for community-developed features to become part of the core specification.

#### 4.6.1. Extension Declaration

Agents declare their supported extensions in the [`AgentCard`](#441-agentcard) using the `extensions` field, which contains an array of [`AgentExtension`](#444-agentextension) objects.

*Example: Agent declaring extension support in AgentCard:*

```json
{
  "name": "Research Assistant Agent",
  "description": "AI agent for academic research and fact-checking",
  "supportedInterfaces": [
    {
      "url": "https://research-agent.example.com/a2a/v1",
      "protocolBinding": "HTTP+JSON",
      "protocolVersion": "0.3",
    }
  ],
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "extensions": [
      {
        "uri": "https://standards.org/extensions/citations/v1",
        "description": "Provides citation formatting and source verification",
        "required": false
      },
      {
        "uri": "https://example.com/extensions/geolocation/v1",
        "description": "Location-based search capabilities",
        "required": false
      }
    ]
  },
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    {
      "id": "academic-research",
      "name": "Academic Research Assistant",
      "description": "Provides research assistance with citations and source verification",
      "tags": ["research", "citations", "academic"],
      "examples": ["Find peer-reviewed articles on climate change"],
      "inputModes": ["text/plain"],
      "outputModes": ["text/plain"]
    }
  ]
}
```

Clients indicate their desire to opt into the use of specific extensions through binding-specific mechanisms such as HTTP headers, gRPC metadata, or JSON-RPC request parameters that identify the extension identifiers they wish to utilize during the interaction.

*Example: HTTP client opting into extensions using headers:*

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/json
Authorization: Bearer token
A2A-Extensions: https://example.com/extensions/geolocation/v1,https://standards.org/extensions/citations/v1

{
  "message": {
    "role": "ROLE_USER",
    "parts": [{"text": "Find restaurants near me"}],
    "extensions": ["https://example.com/extensions/geolocation/v1"],
    "metadata": {
      "https://example.com/extensions/geolocation/v1": {
        "latitude": 37.7749,
        "longitude": -122.4194
      }
    }
  }
}
```

#### 4.6.2. Extensions Points

Extensions can be integrated into the A2A protocol at several well-defined extension points:

**Message Extensions:**

Messages can be extended to allow clients to provide additional strongly typed context or parameters relevant to the message being sent, or TaskStatus Messages to include extra information about the task's progress.

*Example: A location extension using the extensions and metadata arrays:*

```json
{
  "role": "ROLE_USER",
  "parts": [
    {"text": "Find restaurants near me"}
  ],
  "extensions": ["https://example.com/extensions/geolocation/v1"],
  "metadata": {
    "https://example.com/extensions/geolocation/v1": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "accuracy": 10.0,
      "timestamp": "2025-10-21T14:30:00Z"
    }
  }
}
```

**Artifact Extensions:**

Artifacts can include extension data to provide strongly typed context or metadata about the generated content.

*Example: An artifact with citation extension for research sources:*

```json
{
  "artifactId": "research-summary-001",
  "name": "Climate Change Summary",
  "parts": [
    {
      "text": "Global temperatures have risen by 1.1°C since pre-industrial times, with significant impacts on weather patterns and sea levels."
    }
  ],
  "extensions": ["https://standards.org/extensions/citations/v1"],
  "metadata": {
    "https://standards.org/extensions/citations/v1": {
      "sources": [
        {
          "title": "Global Temperature Anomalies - 2023 Report",
          "authors": ["Smith, J.", "Johnson, M."],
          "url": "https://climate.gov/reports/2023-temperature",
          "accessDate": "2025-10-21",
          "relevantText": "Global temperatures have risen by 1.1°C"
        }
      ]
    }
  }
}
```

#### 4.6.3. Extension Versioning and Compatibility

Extensions **SHOULD** include version information in their URI identifier. This allows clients and agents to negotiate compatible versions of extensions during interactions. A new URI **MUST** be created for breaking changes to an extension.

If a client requests a versions of an extension that the agent does not support, the agent **SHOULD** ignore the extension for that interaction and proceed without it, unless the extension is marked as `required` in the AgentCard, in which case the agent **MUST** return an error indicating unsupported extension. It **MUST NOT** fall back to a previous version of the extension automatically.
