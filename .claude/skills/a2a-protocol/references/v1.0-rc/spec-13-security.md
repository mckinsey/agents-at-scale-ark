---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 13. Security Considerations

This section consolidates security guidance and best practices for implementing and operating A2A agents. For additional enterprise security considerations, see [Enterprise-Ready Features](./topics/enterprise-ready.md).

### 13.1. Data Access and Authorization Scoping

Implementations **MUST** ensure appropriate scope limitation based on the authenticated caller's authorization boundaries. This applies to all operations that access or list tasks and other resources.

**Authorization Principles:**

- Servers **MUST** implement authorization checks on every [A2A Protocol Operations](#3-a2a-protocol-operations) request
- Implementations **MUST** scope results to the caller's authorized access boundaries as defined by the agent's authorization model
- Even when `contextId` or other filter parameters are not specified in requests, implementations **MUST** scope results to the caller's authorized access boundaries
- Authorization models are agent-defined and **MAY** be based on:
    - User identity (user-based authorization)
    - Organizational roles or groups (role-based authorization)
    - Project or workspace membership (project-based authorization)
    - Organizational or tenant boundaries (multi-tenant authorization)
    - Custom authorization logic specific to the agent's domain

**Operations Requiring Scope Limitation:**

- [`List Tasks`](#314-list-tasks): **MUST** only return tasks visible to the authenticated client according to the agent's authorization model
- [`Get Task`](#313-get-task): **MUST** verify the authenticated client has access to the requested task according to the agent's authorization model
- Task-related operations (Cancel, Subscribe, Push Notification Config): **MUST** verify the client has appropriate access rights according to the agent's authorization model

**Implementation Requirements:**

- Authorization boundaries are defined by each agent's authorization model, not prescribed by the protocol
- Authorization checks **MUST** occur before any database queries or operations that could leak information about the existence of resources outside the caller's authorization scope
- Agents **SHOULD** document their authorization model and access control policies

See also: [Section 3.1.4 List Tasks (Security Note)](#314-list-tasks) for operation-specific requirements.

### 13.2. Push Notification Security

When implementing push notifications, both agents (as webhook callers) and clients (as webhook receivers) have security responsibilities.

**Agent (Webhook Caller) Requirements:**

- Agents **MUST** include authentication credentials in webhook requests as specified in [`PushNotificationConfig.authentication`](#432-authenticationinfo)
- Agents **SHOULD** implement reasonable timeout values for webhook requests (recommended: 10-30 seconds)
- Agents **SHOULD** implement retry logic with exponential backoff for failed deliveries
- Agents **MAY** stop attempting delivery after a configured number of consecutive failures
- Agents **SHOULD** validate webhook URLs to prevent SSRF (Server-Side Request Forgery) attacks:
    - Reject private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    - Reject localhost and link-local addresses
    - Implement URL allowlists where appropriate

**Client (Webhook Receiver) Requirements:**

- Clients **MUST** validate webhook authenticity using the provided authentication credentials
- Clients **SHOULD** verify the task ID in the payload matches an expected task they created
- Clients **MUST** respond with HTTP 2xx status codes to acknowledge successful receipt
- Clients **SHOULD** process notifications idempotently, as duplicate deliveries may occur
- Clients **SHOULD** implement rate limiting to prevent webhook flooding
- Clients **SHOULD** use HTTPS endpoints for webhook URLs to ensure confidentiality

**Configuration Security:**

- Webhook URLs **SHOULD** use HTTPS to protect payload confidentiality in transit
- Authentication tokens in [`PushNotificationConfig`](#431-pushnotificationconfig) **SHOULD** be treated as secrets and rotated periodically
- Agents **SHOULD** securely store push notification configurations and credentials
- Clients **SHOULD** use unique, single-purpose tokens for each push notification configuration

See also: [Section 4.3 Push Notification Objects](#43-push-notification-objects) and [Section 4.3.3 Push Notification Payload](#433-push-notification-payload).

### 13.3. Extended Agent Card Access Control

The extended Agent Card feature allows agents to provide additional capabilities or information to authenticated clients beyond what is available in the public Agent Card.

**Access Control Requirements:**

- The [`Get Extended Agent Card`](#3111-get-extended-agent-card) operation **MUST** require authentication
- Agents **MUST** authenticate requests using one of the schemes declared in the public `AgentCard.securitySchemes` and `AgentCard.security` fields
- Agents **MAY** return different extended card content based on the authenticated client's identity or authorization level
- Agents **SHOULD** implement appropriate caching headers to control client-side caching of extended cards

**Capability-Based Access:**

- Extended cards **MAY** include additional skills not present in the public card
- Extended cards **MAY** expose more detailed capability information (e.g., rate limits, quotas)
- Extended cards **MAY** include organization-specific or user-specific configuration
- Agents **SHOULD** document which capabilities are available at different authentication levels

**Security Considerations:**

- Extended cards **SHOULD NOT** include sensitive information that could be exploited if leaked (e.g., internal service URLs, unmasked credentials)
- Agents **MUST** validate that clients have appropriate permissions before returning privileged information in extended cards
- Clients retrieving extended cards **SHOULD** replace their cached public Agent Card with the extended version for the duration of their authenticated session
- Agents **SHOULD** version extended cards appropriately and honor client cache invalidation

**Availability Declaration:**

- Agents declare extended card support via `AgentCard.capabilities.extendedAgentCard`
- When `capabilities.extendedAgentCard` is `false` or not present, the operation **MUST** return [`UnsupportedOperationError`](#332-error-handling)
- When support is declared but no extended card is configured, the operation **MUST** return [`ExtendedAgentCardNotConfiguredError`](#332-error-handling)

See also: [Section 3.1.11 Get Extended Agent Card](#3111-get-extended-agent-card) and [Section 3.3.4 Capability Validation](#334-capability-validation).

### 13.4. General Security Best Practices

**Transport Security:**

- Production deployments **MUST** use encrypted communication (HTTPS for HTTP-based bindings, TLS for gRPC)
- Implementations **SHOULD** use modern TLS configurations (TLS 1.3+ recommended) with strong cipher suites
- Agents **SHOULD** enforce HSTS (HTTP Strict Transport Security) headers when using HTTP-based bindings
- Implementations **SHOULD** disable support for deprecated SSL/TLS versions (SSLv3, TLS 1.0, TLS 1.1)

**Input Validation:**

- Agents **MUST** validate all input parameters before processing
- Agents **SHOULD** implement appropriate limits on message sizes, file sizes, and request complexity
- Agents **SHOULD** sanitize or validate file content types and reject unexpected media types

**Credential Management:**

- API keys, tokens, and other credentials **MUST** be treated as secrets
- Credentials **SHOULD** be rotated periodically
- Credentials **SHOULD** be transmitted only over encrypted connections
- Agents **SHOULD** implement credential revocation mechanisms
- Agents **SHOULD** log authentication failures and implement rate limiting to prevent brute-force attacks

**Audit and Monitoring:**

- Agents **SHOULD** log security-relevant events (authentication failures, authorization denials, suspicious requests)
- Agents **SHOULD** implement monitoring for unusual patterns (rapid task creation, excessive cancellations)
- Agents **SHOULD** provide audit trails for sensitive operations
- Logs **MUST NOT** include sensitive information (credentials, personal data) unless required and properly protected

**Rate Limiting and Abuse Prevention:**

- Agents **SHOULD** implement rate limiting on all operations
- Agents **SHOULD** return appropriate error responses when rate limits are exceeded
- Agents **MAY** implement different rate limits for different operations or user tiers

**Data Privacy:**

- Agents **MUST** comply with applicable data protection regulations
- Agents **SHOULD** provide mechanisms for users to request deletion of their data
- Agents **SHOULD** implement appropriate data retention policies
- Agents **SHOULD** minimize logging of sensitive or personal information

**Custom Binding Security:**

- Custom protocol bindings **MUST** address security considerations in their specification
- Custom bindings **SHOULD** follow the same security principles as standard bindings
- Custom bindings **MUST** document authentication integration and credential transmission

See also: [Section 12.6 Authentication and Authorization (Custom Bindings)](#126-authentication-and-authorization).
