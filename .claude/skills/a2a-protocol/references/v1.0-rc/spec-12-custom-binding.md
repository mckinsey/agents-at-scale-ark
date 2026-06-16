---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 12. Custom Binding Guidelines

While the A2A protocol provides three standard bindings (JSON-RPC, gRPC, and HTTP+JSON/REST), implementers **MAY** create custom protocol bindings to support additional transport mechanisms or communication patterns. Custom bindings **MUST** comply with all requirements defined in [Section 5 (Protocol Binding Requirements and Interoperability)](#5-protocol-binding-requirements-and-interoperability). This section provides additional guidelines specific to developing custom bindings.

### 12.1. Binding Requirements

Custom protocol bindings **MUST**:

1. **Implement All Core Operations**: Support all operations defined in [Section 3 (A2A Protocol Operations)](#3-a2a-protocol-operations)
2. **Preserve Data Model**: Use data structures functionally equivalent to those defined in [Section 4 (Protocol Data Model)](#4-protocol-data-model)
3. **Maintain Semantics**: Ensure operations behave consistently with the abstract operation definitions
4. **Document Completely**: Provide comprehensive documentation of the binding specification

### 12.2. Data Type Mappings

Custom bindings **MUST** provide clear mappings for:

- **Protocol Buffer Types**: Define how each Protocol Buffer message type is represented
- **Timestamps**: Follow the conventions in [Section 5.6.1 (Timestamps)](#561-timestamps)
- **Binary Data**: Specify encoding for binary content (e.g., base64 for text-based protocols)
- **Enumerations**: Define representation of enum values (e.g., strings, integers)

### 12.3. Service Parameter Transmission

As specified in [Section 3.2.6 (Service Parameters)](#326-service-parameters), custom protocol bindings **MUST** document how service parameters are transmitted. The binding specification **MUST** address:

1. **Transmission Mechanism**: The protocol-specific method for transmitting service parameter key-value pairs
2. **Value Constraints**: Any limitations on service parameter values (e.g., character encoding, size limits)
3. **Reserved Names**: Any service parameter names reserved by the binding itself
4. **Fallback Strategy**: What happens when the protocol lacks native header support (e.g., passing service parameters in metadata)

**Example Documentation Requirements:**

- **For native header support**: "Service parameters are transmitted using HTTP request headers. Service parameter keys are case-insensitive and must conform to RFC 7230. Service parameter values must be UTF-8 strings."
- **For protocols without headers**: "Service parameters are serialized as a JSON object and transmitted in the request metadata field `a2a-service-parameters`."

### 12.4. Error Mapping

Custom bindings **MUST**:

1. **Map Standard Errors**: Provide mappings for all A2A-specific error types defined in [Section 3.2.2 (Error Handling)](#332-error-handling)
2. **Preserve Error Information**: Ensure error details are accessible to clients
3. **Use Appropriate Codes**: Map to protocol-native error codes where applicable
4. **Document Error Format**: Specify the structure of error responses

### 12.5. Streaming Support

If the binding supports streaming operations:

1. **Define Stream Mechanism**: Document how streaming is implemented (e.g., WebSockets, long-polling, chunked encoding)
2. **Event Ordering**: Specify ordering guarantees for streaming events
3. **Reconnection**: Define behavior for connection interruption and resumption
4. **Stream Termination**: Specify how stream completion is signaled

If streaming is not supported, the binding **MUST** clearly document this limitation in the Agent Card.

### 12.6. Authentication and Authorization

Custom bindings **MUST**:

1. **Support Standard Schemes**: Implement authentication schemes declared in the Agent Card
2. **Document Integration**: Specify how credentials are transmitted in the protocol
3. **Handle Challenges**: Define how authentication challenges are communicated
4. **Maintain Security**: Follow security best practices for the transport protocol

### 12.7. Agent Card Declaration

Custom bindings **MUST** be declared in the Agent Card:

1. **Transport Identifier**: Use a clear, descriptive transport name
2. **Endpoint URL**: Provide the full URL where the binding is available
3. **Documentation Link**: Include a URL to the complete binding specification

**Example:**

```json
{
  "supportedInterfaces": [
    {
      "url": "wss://agent.example.com/a2a/websocket",
      "protocolBinding": "WEBSOCKET"
    }
  ]
}
```

### 12.8. Interoperability Testing

Custom binding implementers **SHOULD**:

1. **Test Against Reference**: Verify behavior matches standard bindings
2. **Document Differences**: Clearly note any deviations from standard binding behavior
3. **Provide Examples**: Include sample requests and responses
4. **Test Edge Cases**: Verify handling of error conditions, large payloads, and long-running tasks
