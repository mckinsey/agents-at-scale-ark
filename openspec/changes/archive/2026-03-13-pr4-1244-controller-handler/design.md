# PR4 Controller Handler Protocol Boundary Cleanup Design

## Decision

Treat protocol messages as the canonical handler/controller execution format and perform OpenAI conversion only in provider/tool serialization paths.

## Handler State

- Query input and memory history are stored as protocol messages.
- Target dispatch for agent/team/model/tool returns protocol messages.
- A2A response metadata and `messages` payload are serialized through a protocol -> OpenAI compatibility bridge.

## Controller State

- Direct execution success response now consumes protocol messages.
- Response `raw` remains OpenAI-compatible JSON by boundary conversion during serialization.
