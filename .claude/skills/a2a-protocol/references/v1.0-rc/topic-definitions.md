---
source: "Agent2Agent (A2A) Protocol Documentation"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/tree/main/docs/topics"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

# A2A Definition/Schema

=== "Protobuf"
    <h3>Protobuf</h3>
    The normative A2A protocol definition in Protocol Buffers (proto3 syntax).
    This is the source of truth for the A2A protocol specification.

    <h3>Download</h3>

    You can download the proto file directly: [`a2a.proto`](spec/a2a.proto)

    <h3>Definition</h3>

    ```protobuf
    --8<-- "docs/spec/a2a.proto"
    ```

=== "JSON"
    <h3>JSON</h3>
    The A2A protocol JSON Schema definition (JSON Schema 2020-12 compliant).
    This schema is automatically generated from the protocol buffer definitions and bundled into a single file with all message definitions.

    <h3>Download</h3>

    You can download the schema file directly: [`a2a.json`](spec/a2a.json)

    <h3>Definition</h3>

    ```json
    --8<-- "docs/spec/a2a.json"
    ```
