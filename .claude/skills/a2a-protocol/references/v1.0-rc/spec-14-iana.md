---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 14. IANA Considerations

This section provides registration templates for the A2A protocol's media type, HTTP headers, and well-known URI, intended for submission to the Internet Assigned Numbers Authority (IANA).

### 14.1. Media Type Registration

#### 14.1.1. application/a2a+json

**Type name:** `application`

**Subtype name:** `a2a+json`

**Required parameters:** None

**Optional parameters:**

- None

**Encoding considerations:** Binary (UTF-8 encoding MUST be used for JSON text)

**Security considerations:**
This media type shares security considerations common to all JSON-based formats as described in RFC 8259, Section 12. Additionally:

- Content MUST be validated against the A2A protocol schema before processing
- Implementations MUST sanitize user-provided content to prevent injection attacks
- File references within A2A messages MUST be validated to prevent server-side request forgery (SSRF)
- Authentication and authorization MUST be enforced as specified in Section 7 of the A2A specification
- Sensitive information in task history and artifacts MUST be protected according to applicable data protection regulations

**Interoperability considerations:**
The A2A protocol supports multiple protocol bindings. This media type is intended for the HTTP+JSON/REST binding.

**Published specification:**
Agent2Agent (A2A) Protocol Specification, available at: <https://a2a-protocol.org/latest/specification>

**Applications that use this media type:**
AI agent platforms, agentic workflow systems, multi-agent collaboration tools, and enterprise automation systems that implement the A2A protocol for agent-to-agent communication.

**Fragment identifier considerations:** None

**Additional information:**

- **Deprecated alias names for this type:** None
- **Magic number(s):** None
- **File extension(s):** .a2a.json
- **Macintosh file type code(s):** TEXT

**Person & email address to contact for further information:**
A2A Protocol Working Group, <a2a-protocol@example.org>

**Intended usage:** COMMON

**Restrictions on usage:** None

**Author:** A2A Protocol Working Group

**Change controller:** A2A Protocol Working Group

**Provisional registration:** No

### 14.2. HTTP Header Field Registrations

**Note:** The following HTTP headers represent the HTTP-based protocol binding implementation of the abstract A2A service parameters defined in [Section 3.2.6](#326-service-parameters). These registrations are specific to HTTP/HTTPS transports.

#### 14.2.1. A2A-Version Header

**Header field name:** A2A-Version

**Applicable protocol:** HTTP

**Status:** Standard

**Author/Change controller:** A2A Protocol Working Group

**Specification document:** Section 3.2.5 of the A2A Protocol Specification

**Related information:**
The A2A-Version header field indicates the A2A protocol version that the client is using. The value MUST be in the format `Major.Minor` (e.g., "0.3"). If the version is not supported by the agent, the agent returns a `VersionNotSupportedError`.

**Example:**

```text
A2A-Version: 0.3
```

#### 14.2.2. A2A-Extensions Header

**Header field name:** A2A-Extensions

**Applicable protocol:** HTTP

**Status:** Standard

**Author/Change controller:** A2A Protocol Working Group

**Specification document:** Section 3.2.5 of the A2A Protocol Specification

**Related information:**
The A2A-Extensions header field contains a comma-separated list of extension URIs that the client wants to use for the request. Extensions allow agents to provide additional functionality beyond the core A2A specification while maintaining backward compatibility.

**Example:**

```text
A2A-Extensions: https://example.com/extensions/geolocation/v1,https://standards.org/extensions/citations/v1
```

### 14.3. Well-Known URI Registration

**URI suffix:** agent-card.json

**Change controller:** A2A Protocol Working Group

**Specification document:** Section 8.2 of the A2A Protocol Specification

**Related information:**
The `.well-known/agent-card.json` URI provides a standardized location for discovering an A2A agent's capabilities, supported protocols, authentication requirements, and available skills. The resource at this URI MUST return an AgentCard object as defined in Section 4.4.1 of the A2A specification.

**Status:** Permanent

**Security considerations:**

- The Agent Card MAY contain public information about an agent's capabilities and SHOULD NOT include sensitive credentials or internal implementation details
- Implementations SHOULD support HTTPS to ensure authenticity and integrity of the Agent Card
- Agent Cards MAY be signed using JSON Web Signatures (JWS) as specified in the AgentCardSignature object (Section 4.4.7)
- Clients SHOULD verify signatures when present to ensure the Agent Card has not been tampered with
- Extended Agent Cards retrieved via authenticated endpoints (Section 3.1.11) MAY contain additional information and MUST enforce appropriate access controls

**Example:**

```text
https://agent.example.com/.well-known/agent-card.json
```

---
