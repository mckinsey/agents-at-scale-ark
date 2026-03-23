---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 5. Agent Discovery: The Agent Card

### 5.1. Purpose

A2A Servers **MUST** make an Agent Card available. The Agent Card is a JSON document that describes the server's identity, capabilities, skills, service endpoint URL, and how clients should authenticate and interact with it. Clients use this information for discovering suitable agents and for configuring their interactions.

For more on discovery strategies, see the [Agent Discovery guide](./topics/agent-discovery.md).

### 5.2. Discovery Mechanisms

Clients can find Agent Cards through various methods, including but not limited to:

- **Well-Known URI:** Accessing a predefined path on the agent's domain (see [Section 5.3](#53-recommended-location)).
- **Registries/Catalogs:** Querying curated catalogs or registries of agents (which might be enterprise-specific, public, or domain-specific).
- **Direct Configuration:** Clients may be pre-configured with the Agent Card URL or the card content itself.

### 5.3. Recommended Location

If using the well-known URI strategy, the recommended location for an agent's Agent Card is:
`https://{server_domain}/.well-known/agent-card.json`
This follows the principles of [RFC 8615](https://datatracker.ietf.org/doc/html/rfc8615) for well-known URIs.

### 5.4. Security of Agent Cards

Agent Cards themselves might contain information that is considered sensitive.

- If an Agent Card contains sensitive information, the endpoint serving the card **MUST** be protected by appropriate access controls (e.g., mTLS, network restrictions, authentication required to fetch the card).
- It is generally **NOT RECOMMENDED** to include plaintext secrets (like static API keys) directly in an Agent Card. Prefer authentication schemes where clients obtain dynamic credentials out-of-band.

### 5.5. `AgentCard` Object Structure

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentCard"
```

#### 5.5.1. `AgentProvider` Object

Information about the organization or entity providing the agent.

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentProvider"
```

#### 5.5.2. `AgentCapabilities` Object

Specifies optional A2A protocol features supported by the agent.

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentCapabilities"
```

#### 5.5.2.1. `AgentExtension` Object

Specifies an extension to the A2A protocol supported by the agent.

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentExtension"
```

#### 5.5.3. `SecurityScheme` Object

Describes the authentication requirements for accessing the agent's `url` endpoint. Refer [Sample Agent Card](#57-sample-agent-card) for an example.

```ts { .no-copy }
--8<-- "types/src/types.ts:SecurityScheme"
```

#### 5.5.4. `AgentSkill` Object

Describes a specific capability, function, or area of expertise the agent can perform or address.

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentSkill"
```

#### 5.5.5. `AgentInterface` Object

Provides a declaration of a combination of the target URL and the supported transport to interact with the agent. This enables agents to expose the same functionality through multiple transport protocols.

```ts { .no-copy }
--8<-- "types/src/types.ts:TransportProtocol"
```

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentInterface"
```

The `transport` field **SHOULD** use one of the core A2A transport protocol values:

- `"JSONRPC"`: JSON-RPC 2.0 over HTTP
- `"GRPC"`: gRPC over HTTP/2
- `"HTTP+JSON"`: REST-style HTTP with JSON

Additional transport values **MAY** be used for future extensions, but such extensions **MUST** not conflict with core A2A protocol functionality.

#### 5.5.6. `AgentCardSignature` Object

Represents a JSON Web Signature (JWS) used to verify the integrity of the AgentCard.

```ts { .no-copy }
--8<-- "types/src/types.ts:AgentCardSignature"
```

### 5.6. Transport Declaration and URL Relationships

The AgentCard **MUST** properly declare the relationship between URLs and transport protocols:

#### 5.6.1. Main URL and Preferred Transport

- **Main URL requirement**: The `url` field **MUST** specify the primary endpoint for the agent.
- **Transport correspondence**: The transport protocol available at the main `url` **MUST** match the `preferredTransport` field.
- **Required declaration**: The `preferredTransport` field is **REQUIRED** and **MUST** be present in every `AgentCard`.
- **Transport availability**: The main `url` **MUST** support the transport protocol declared in `preferredTransport`.

#### 5.6.2. Additional Interfaces

- **URL uniqueness**: Each `AgentInterface` in `additionalInterfaces` **SHOULD** specify a distinct URL for clarity, but **MAY** reuse URLs if multiple transport protocols are available at the same endpoint.
- **Transport declaration**: Each `AgentInterface` **MUST** accurately declare the transport protocol available at its specified URL.
- **Completeness**: The `additionalInterfaces` array **SHOULD** include all supported transports, including the main URL's transport for completeness.

#### 5.6.3. Client Transport Selection Rules

Clients **MUST** follow these rules when selecting a transport:

1. **Parse transport declarations**: Extract available transports from both the main `url`/`preferredTransport` combination and all `additionalInterfaces`.
2. **Prefer declared preference**: If the client supports the `preferredTransport`, it **SHOULD** use the main `url`.
3. **Fallback selection**: If the preferred transport is not supported by the client, it **MAY** select any supported transport from `additionalInterfaces`.
4. **Graceful degradation**: Clients **SHOULD** implement fallback logic to try alternative transports if their first choice fails.
5. **URL-transport matching**: Clients **MUST** use the correct URL for the selected transport protocol as declared in the AgentCard.

#### 5.6.4. Validation Requirements

Agent Cards **MUST** satisfy these validation requirements:

- **Transport consistency**: The `preferredTransport` value **MUST** be present and **MUST** be available at the main `url`.
- **Interface completeness**: If `additionalInterfaces` is provided, it **SHOULD** include an entry corresponding to the main `url` and `preferredTransport`.
- **No conflicts**: The same URL **MUST NOT** declare conflicting transport protocols across different interface declarations.
- **Minimum transport requirement**: The agent **MUST** declare at least one supported transport protocol through either the main `url`/`preferredTransport` combination or `additionalInterfaces`.

### 5.7. Sample Agent Card

```json
{
  "protocolVersion": "0.2.9",
  "name": "GeoSpatial Route Planner Agent",
  "description": "Provides advanced route planning, traffic analysis, and custom map generation services. This agent can calculate optimal routes, estimate travel times considering real-time traffic, and create personalized maps with points of interest.",
  "url": "https://georoute-agent.example.com/a2a/v1",
  "preferredTransport": "JSONRPC",
  "additionalInterfaces" : [
    {"url": "https://georoute-agent.example.com/a2a/v1", "transport": "JSONRPC"},
    {"url": "https://georoute-agent.example.com/a2a/grpc", "transport": "GRPC"},
    {"url": "https://georoute-agent.example.com/a2a/json", "transport": "HTTP+JSON"}
  ],
  "provider": {
    "organization": "Example Geo Services Inc.",
    "url": "https://www.examplegeoservices.com"
  },
  "iconUrl": "https://georoute-agent.example.com/icon.png",
  "version": "1.2.0",
  "documentationUrl": "https://docs.examplegeoservices.com/georoute-agent/api",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": false
  },
  "securitySchemes": {
    "google": {
      "type": "openIdConnect",
      "openIdConnectUrl": "https://accounts.google.com/.well-known/openid-configuration"
    }
  },
  "security": [{ "google": ["openid", "profile", "email"] }],
  "defaultInputModes": ["application/json", "text/plain"],
  "defaultOutputModes": ["application/json", "image/png"],
  "skills": [
    {
      "id": "route-optimizer-traffic",
      "name": "Traffic-Aware Route Optimizer",
      "description": "Calculates the optimal driving route between two or more locations, taking into account real-time traffic conditions, road closures, and user preferences (e.g., avoid tolls, prefer highways).",
      "tags": ["maps", "routing", "navigation", "directions", "traffic"],
      "examples": [
        "Plan a route from '1600 Amphitheatre Parkway, Mountain View, CA' to 'San Francisco International Airport' avoiding tolls.",
        "{\"origin\": {\"lat\": 37.422, \"lng\": -122.084}, \"destination\": {\"lat\": 37.7749, \"lng\": -122.4194}, \"preferences\": [\"avoid_ferries\"]}"
      ],
      "inputModes": ["application/json", "text/plain"],
      "outputModes": [
        "application/json",
        "application/vnd.geo+json",
        "text/html"
      ]
    },
    {
      "id": "custom-map-generator",
      "name": "Personalized Map Generator",
      "description": "Creates custom map images or interactive map views based on user-defined points of interest, routes, and style preferences. Can overlay data layers.",
      "tags": ["maps", "customization", "visualization", "cartography"],
      "examples": [
        "Generate a map of my upcoming road trip with all planned stops highlighted.",
        "Show me a map visualizing all coffee shops within a 1-mile radius of my current location."
      ],
      "inputModes": ["application/json"],
      "outputModes": [
        "image/png",
        "image/jpeg",
        "application/json",
        "text/html"
      ]
    }
  ],
  "supportsAuthenticatedExtendedCard": true,
  "signatures": [
    {
      "protected": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpPU0UiLCJraWQiOiJrZXktMSIsImprdSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vYWdlbnQvandrcy5qc29uIn0",
      "signature": "QFdkNLNszlGj3z3u0YQGt_T9LixY3qtdQpZmsTdDHDe3fXV9y9-B3m2-XgCpzuhiLt8E0tV6HXoZKHv4GtHgKQ"
    }
  ]
}
```
