---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 8. Agent Discovery: The Agent Card

<span id="5-agent-discovery-the-agent-card"></span>

### 8.1. Purpose

A2A Servers **MUST** make an Agent Card available. The Agent Card describes the server's identity, capabilities, skills, and interaction requirements. Clients use this information for discovering suitable agents and configuring interactions.

For more on discovery strategies, see the [Agent Discovery guide](./topics/agent-discovery.md).

### 8.2. Discovery Mechanisms

Clients can find Agent Cards through:

- **Well-Known URI:** Accessing `https://{server_domain}/.well-known/agent-card.json`
- **Registries/Catalogs:** Querying curated catalogs of agents
- **Direct Configuration:** Pre-configured Agent Card URLs or content

### 8.3. Protocol Declaration Requirements

The AgentCard **MUST** properly declare supported protocols:

#### 8.3.1. Supported Interfaces Declaration

- The `supportedInterfaces` field **SHOULD** declare all supported protocol combinations in preference order
- The first entry in `supportedInterfaces` represents the preferred interface
- Each interface **MUST** accurately declare its transport protocol and URL
- URLs **MAY** be reused if multiple transports are available at the same endpoint

#### 8.3.2. Client Protocol Selection

Clients **MUST** follow these rules:

1. Parse `supportedInterfaces` if present, and select the first supported transport
2. Prefer earlier entries in the ordered list when multiple options are supported
3. Use the correct URL for the selected transport

### 8.4. Agent Card Signing

Agent Cards **MAY** be digitally signed using JSON Web Signature (JWS) as defined in [RFC 7515](https://tools.ietf.org/html/rfc7515) to ensure authenticity and integrity. Signatures allow clients to verify that an Agent Card has not been tampered with and originates from the claimed provider.

#### 8.4.1. Canonicalization Requirements

Before signing, the Agent Card content **MUST** be canonicalized using the JSON Canonicalization Scheme (JCS) as defined in [RFC 8785](https://tools.ietf.org/html/rfc8785). This ensures consistent signature generation and verification across different JSON implementations.

**Canonicalization Rules:**

1. **Field Presence and Default Value Handling**: Before canonicalization, the JSON representation **MUST** respect Protocol Buffer field presence semantics as defined in [Section 5.7](#57-field-presence-and-optionality). This ensures that the canonical form accurately reflects which fields were explicitly provided versus which were omitted, enabling signature verification when Agent Cards are reconstructed:
    - **Optional fields not explicitly set**: Fields marked with the `optional` keyword that were not explicitly set **MUST** be omitted from the JSON object
    - **Optional fields explicitly set to defaults**: Fields marked with `optional` that were explicitly set to a value (even if that value matches a default) **MUST** be included in the JSON object
    - **Required fields**: Fields marked with `REQUIRED` **MUST** always be present, even if the field value matches the default.
    - **Default values**: Fields with default values **MUST** be omitted unless the field is marked as `REQUIRED` or has the `optional` keyword.

2. **RFC 8785 Compliance**: The Agent Card JSON **MUST** be canonicalized according to RFC 8785, which specifies:
    - Predictable ordering of object properties (lexicographic by key)
    - Consistent representation of numbers, strings, and other primitive values
    - Removal of insignificant whitespace

3. **Signature Field Exclusion**: The `signatures` field itself **MUST** be excluded from the content being signed to avoid circular dependencies.

**Example of Default Value Removal:**

Original Agent Card fragment:

```json
{
  "name": "Example Agent",
  "description": "",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "extensions": []
  },
  "skills": []
}
```

Applying the canonicalization rules:

- `name`: "Example Agent" - REQUIRED field → **include**
- `description`: "" - REQUIRED field → **include**
- `capabilities`: object - REQUIRED field → **include** (after processing children)
    - `streaming`: false - optional field, present in JSON (explicitly set) → **include**
    - `pushNotifications`: false - optional field, present in JSON (explicitly set) → **include**
    - `extensions`: [] - repeated field (not REQUIRED) with empty array → **omit**
- `skills`: [] - REQUIRED field → **include**

After applying RFC 8785:

```json
{"capabilities":{"pushNotifications":false,"streaming":false},"description":"","name":"Example Agent","skills":[]}
```

#### 8.4.2. Signature Format

Signatures use the JSON Web Signature (JWS) format as defined in [RFC 7515](https://tools.ietf.org/html/rfc7515). The [`AgentCardSignature`](#447-agentcardsignature) object represents JWS components using three fields:

- **`protected`** (required, string): Base64url-encoded JSON object containing the JWS Protected Header
- **`signature`** (required, string): Base64url-encoded signature value
- **`header`** (optional, object): JWS Unprotected Header as a JSON object (not base64url-encoded)

**JWS Protected Header Parameters:**

The protected header **MUST** include:

- `alg`: Algorithm used for signing (e.g., "ES256", "RS256")
- `typ`: **SHOULD** be set to "JOSE" for JWS
- `kid`: Key ID for identifying the signing key

The protected header **MAY** include:

- `jku`: URL to JSON Web Key Set (JWKS) containing the public key

**Signature Generation Process:**

1. **Prepare the payload:**
    - Remove properties with default values from the Agent Card
    - Exclude the `signatures` field
    - Canonicalize the resulting JSON using RFC 8785 to produce the canonical payload

2. **Create the protected header:**
    - Construct a JSON object with the required header parameters (`alg`, `typ`, `kid`) and any optional parameters (`jku`)
    - Serialize the header to JSON
    - Base64url-encode the serialized header to produce the `protected` field value

3. **Compute the signature:**
    - Construct the JWS Signing Input: `ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))`
    - Sign the JWS Signing Input using the algorithm specified in the `alg` header parameter and the private key
    - Base64url-encode the resulting signature bytes to produce the `signature` field value

4. **Assemble the AgentCardSignature:**
    - Set `protected` to the base64url-encoded protected header from step 2
    - Set `signature` to the base64url-encoded signature value from step 3
    - Optionally set `header` to a JSON object containing any unprotected header parameters.

**Example:**

Given a canonical Agent Card payload and signing key, the signature generation produces:

```json
{
  "protected": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpPU0UiLCJraWQiOiJrZXktMSIsImprdSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vYWdlbnQvandrcy5qc29uIn0",
  "signature": "QFdkNLNszlGj3z3u0YQGt_T9LixY3qtdQpZmsTdDHDe3fXV9y9-B3m2-XgCpzuhiLt8E0tV6HXoZKHv4GtHgKQ"
}
```

Where the `protected` value decodes to:

```json
{"alg":"ES256","typ":"JOSE","kid":"key-1","jku":"https://example.com/agent/jwks.json"}
```

#### 8.4.3. Signature Verification

Clients verifying Agent Card signatures **MUST**:

1. Extract the signature from the `signatures` array
2. Retrieve the public key using the `kid` and `jku` (or from a trusted key store)
3. Remove properties with default values from the received Agent Card
4. Exclude the `signatures` field
5. Canonicalize the resulting JSON using RFC 8785
6. Verify the signature against the canonicalized payload

**Security Considerations:**

- Clients **SHOULD** verify at least one signature before trusting an Agent Card
- Public keys **SHOULD** be retrieved over secure channels (HTTPS)
- Clients **MAY** maintain a trusted key store for known agent providers
- Expired or revoked keys **MUST NOT** be used for verification
- Multiple signatures **MAY** be present to support key rotation

### 8.5. Sample Agent Card

```json
{
  "name": "GeoSpatial Route Planner Agent",
  "description": "Provides advanced route planning, traffic analysis, and custom map generation services. This agent can calculate optimal routes, estimate travel times considering real-time traffic, and create personalized maps with points of interest.",
  "supportedInterfaces": [
    {"url": "https://georoute-agent.example.com/a2a/v1", "protocolBinding": "JSONRPC", "protocolVersion": "1.0"},
    {"url": "https://georoute-agent.example.com/a2a/grpc", "protocolBinding": "GRPC", "protocolVersion": "1.0"},
    {"url": "https://georoute-agent.example.com/a2a/json", "protocolBinding": "HTTP+JSON", "protocolVersion": "1.0"}
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
    "stateTransitionHistory": false,
    "extendedAgentCard": true
  },
  "securitySchemes": {
    "google": {
      "openIdConnectSecurityScheme": {
        "openIdConnectUrl": "https://accounts.google.com/.well-known/openid-configuration"
      }
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
  "signatures": [
    {
      "protected": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpPU0UiLCJraWQiOiJrZXktMSIsImprdSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vYWdlbnQvandrcy5qc29uIn0",
      "signature": "QFdkNLNszlGj3z3u0YQGt_T9LixY3qtdQpZmsTdDHDe3fXV9y9-B3m2-XgCpzuhiLt8E0tV6HXoZKHv4GtHgKQ"
    }
  ]
}
```
