---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 7. Authentication and Authorization

A2A treats agents as standard enterprise applications, relying on established web security practices. Identity information is handled at the protocol layer, not within A2A semantics.

For a comprehensive guide on enterprise security aspects, see [Enterprise-Ready Features](./topics/enterprise-ready.md).

### 7.1. Protocol Security

Production deployments **MUST** use encrypted communication (HTTPS for HTTP-based bindings, TLS for gRPC). Implementations **SHOULD** use modern TLS configurations (TLS 1.3+ recommended) with strong cipher suites.

### 7.2. Server Identity Verification

A2A Clients **SHOULD** verify the A2A Server's identity by validating its TLS certificate against trusted certificate authorities (CAs) during the TLS handshake.

### 7.3. Client Authentication Process

1. **Discovery of Requirements:** The client discovers the server's required authentication schemes via the `securitySchemes` field in the AgentCard.
2. **Credential Acquisition (Out-of-Band):** The client obtains the necessary credentials through an out-of-band process specific to the required authentication scheme.
3. **Credential Transmission:** The client includes these credentials in protocol-appropriate headers or metadata for every A2A request.

### 7.4. Server Authentication Responsibilities

The A2A Server:

- **MUST** authenticate every incoming request based on the provided credentials and its declared authentication requirements.
- **SHOULD** use appropriate binding-specific error codes for authentication challenges or rejections.
- **SHOULD** provide relevant authentication challenge information with error responses.

### 7.5. In-Task Authentication (Secondary Credentials)

If an agent requires additional credentials during task execution:

1. It **SHOULD** transition the A2A task to the `TASK_STATE_AUTH_REQUIRED` state.
2. The accompanying `TaskStatus.update` **SHOULD** provide details about the required secondary authentication.
3. The A2A Client obtains these credentials out-of-band and provides them in a subsequent message request.

### 7.6. Authorization

Once authenticated, the A2A Server authorizes requests based on the authenticated identity and its own policies. Authorization logic is implementation-specific and **MAY** consider:

- Specific skills requested
- Actions attempted within tasks
- Data access policies
- OAuth scopes (if applicable)
