---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 11. A2A Compliance Requirements

This section defines the normative requirements for A2A-compliant implementations.

### 11.1. Agent Compliance

For an agent to be considered **A2A-compliant**, it **MUST**:

#### 11.1.1. Transport Support Requirements

- **Support at least one transport**: Agents **MUST** implement at least one transport protocols as defined in [Section 3.2](#32-supported-transport-protocols).
- **Expose Agent Card**: **MUST** provide a valid `AgentCard` document as defined in [Section 5](#5-agent-discovery-the-agent-card).
- **Declare transport capabilities**: **MUST** accurately declare all supported transports in the `AgentCard` using `preferredTransport` and `additionalInterfaces` fields following the requirements in [Section 5.6](#56-transport-declaration-and-url-relationships).

#### 11.1.2. Core Method Implementation

**MUST** implement all of the following core methods via at least one supported transport:

- `message/send` - Send messages and initiate tasks
- `tasks/get` - Retrieve task status and results
- `tasks/cancel` - Request task cancellation

#### 11.1.3. Optional Method Implementation

**MAY** implement the following optional methods:

- `message/stream` - Streaming message interaction (requires `capabilities.streaming: true`)
- `tasks/resubscribe` - Resume streaming for existing tasks (requires `capabilities.streaming: true`)
- `tasks/pushNotificationConfig/set` - Configure push notifications (requires `capabilities.pushNotifications: true`)
- `tasks/pushNotificationConfig/get` - Retrieve push notification config (requires `capabilities.pushNotifications: true`)
- `tasks/pushNotificationConfig/list` - List push notification configs (requires `capabilities.pushNotifications: true`)
- `tasks/pushNotificationConfig/delete` - Delete push notification config (requires `capabilities.pushNotifications: true`)
- `agent/authenticatedExtendedCard` - Retrieve authenticated agent card (requires `supportsAuthenticatedExtendedCard: true`)

#### 11.1.4. Multi-Transport Compliance

If an agent supports additional transports (gRPC, HTTP+JSON), it **MUST**:

- **Functional equivalence**: Provide identical functionality across all supported transports.
- **Consistent behavior**: Return semantically equivalent results for the same operations.
- **Transport-specific requirements**: Conform to all requirements defined in [Section 3.2](#32-supported-transport-protocols) for each supported transport.
- **Method mapping compliance**: Use the standard method mappings defined in [Section 3.5](#35-method-mapping-and-naming-conventions) for all supported transports.

#### 11.1.5. Data Format Compliance

- **JSON-RPC structure**: **MUST** use valid JSON-RPC 2.0 request/response objects as defined in [Section 6.11](#611-json-rpc-structures).
- **A2A data objects**: **MUST** use the data structures defined in [Section 6](#6-protocol-data-objects) for all protocol entities.
- **Error handling**: **MUST** use the error codes defined in [Section 8](#8-error-handling).

### 11.2. Client Compliance

For a client to be considered **A2A-compliant**, it **MUST**:

#### 11.2.1. Transport Support

- **Multi-transport capability**: **MUST** be able to communicate with agents using at least one transport protocols.
- **Agent Card processing**: **MUST** be able to parse and interpret `AgentCard` documents.
- **Transport selection**: **MUST** be able to select an appropriate transport from the agent's declared capabilities following the rules defined in [Section 5.6.3](#563-client-transport-selection-rules).

#### 11.2.2. Protocol Implementation

- **Core method usage**: **MUST** properly construct requests for at least `message/send` and `tasks/get` methods.
- **Error handling**: **MUST** properly handle all A2A error codes defined in [Section 8.2](#82-a2a-specific-errors).
- **Authentication**: **MUST** support at least one authentication method when interacting with agents that require authentication.

#### 11.2.3. Optional Client Features

Clients **MAY** implement:

- **Multi-transport support**: Support for gRPC and/or HTTP+JSON transports.
- **Streaming support**: Handle streaming methods and Server-Sent Events.
- **Push notification handling**: Serve as webhook endpoints for push notifications.
- **Extended Agent Cards**: Retrieve and use authenticated extended agent cards.

### 11.3. Compliance Testing

Implementations **SHOULD** validate compliance through:

- **Transport interoperability**: Test communication with agents using different transport implementations.
- **Method mapping verification**: Verify that all supported transports use the correct method names and URL patterns as defined in [Section 3.5](#35-method-mapping-and-naming-conventions).
- **Error handling**: Verify proper handling of all defined error conditions.
- **Data format validation**: Ensure JSON schemas match the TypeScript type definitions in [`types/src/types.ts`](types/src/types.ts).
- **Multi-transport consistency**: For multi-transport agents, verify functional equivalence across all supported transports.
