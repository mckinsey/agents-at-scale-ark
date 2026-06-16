---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 4. Authentication and Authorization

A2A treats agents as standard enterprise applications, relying on established web security practices. Identity information is **not** transmitted within A2A JSON-RPC payloads; it is handled at the HTTP transport layer.

For a comprehensive guide on enterprise security aspects, see [Enterprise-Ready Features](./topics/enterprise-ready.md).

### 4.1. Transport Security

As stated in section 3.1, production deployments **MUST** use HTTPS. Implementations **SHOULD** use modern [TLS](https://datatracker.ietf.org/doc/html/rfc8446) configurations (TLS 1.3+ recommended) with strong cipher suites.

### 4.2. Server Identity Verification

A2A Clients **SHOULD** verify the A2A Server's identity by validating its TLS certificate against trusted certificate authorities (CAs) during the TLS handshake.

### 4.3. Client/User Identity & Authentication Process

1. **Discovery of Requirements:** The client discovers the server's required authentication schemes via the `authentication` field in the [`AgentCard`](#55-agentcard-object-structure). Scheme names often align with [OpenAPI Authentication methods](https://swagger.io/docs/specification/authentication/) (e.g., "Bearer" for OAuth 2.0 tokens, "Basic" for Basic Auth, "ApiKey" for API keys).
2. **Credential Acquisition (Out-of-Band):** The client obtains the necessary credentials (e.g., API keys, OAuth tokens, JWTs) through an **out-of-band process** specific to the required authentication scheme and the identity provider. This process is outside the scope of the A2A protocol itself.
3. **Credential Transmission:** The client includes these credentials in the appropriate [HTTP headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers) (e.g., `Authorization: Bearer <token>`, `X-API-Key: <value>`) of every A2A request sent to the server.

### 4.4. Server Responsibilities for Authentication

The A2A Server:

- **MUST** authenticate every incoming request based on the provided HTTP credentials and its declared authentication requirements from its Agent Card.
- **SHOULD** use standard HTTP status codes like [`401 Unauthorized`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401) or [`403 Forbidden`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403) for authentication challenges or rejections.
- **SHOULD** include relevant HTTP headers (e.g., [`WWW-Authenticate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/WWW-Authenticate)) with `401 Unauthorized` responses to indicate the required authentication scheme(s), guiding the client.

### 4.5. In-Task Authentication (Secondary Credentials)

If an agent, during the execution of a task, requires _additional_ credentials for a _different_ system or resource (e.g., to access a specific tool on behalf of the user that requires its own auth):

1. It **SHOULD** transition the A2A task to the `auth-required` state (see [`TaskState`](#63-taskstate-enum)).
2. The accompanying `TaskStatus.message` (often a [`DataPart`](#653-datapart-object)) **SHOULD** provide details about the required secondary authentication, potentially using an [`PushNotificationAuthenticationInfo`](#69-pushnotificationauthenticationinfo-object)-like structure to describe the need.
3. The A2A Client then obtains these new credentials out-of-band and provides them in a subsequent [`message/send`](#71-messagesend) or [`message/stream`](#72-messagestream) request. How these credentials are used (e.g., passed as data within the A2A message if the agent is proxying, or used by the client to interact directly with the secondary system) depends on the specific scenario.

### 4.6. Authorization

Once a client is authenticated, the A2A Server is responsible for authorizing the request based on the authenticated client/user identity and its own policies. Authorization logic is implementation-specific and MAY be enforced based on:

- The specific skills requested (e.g., as identified by `AgentSkill.id` from the Agent Card).
- The actions attempted within the task.
- Data access policies relevant to the resources the agent manages.
- OAuth scopes associated with the presented token, if applicable.

Servers should implement the principle of least privilege.
