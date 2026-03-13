# PR1 Protocol Core Adapters Design

## Decision

Keep OpenAI message unions as provider-boundary types and introduce protocol-native conversion utilities as the internal bridge.

## Mapping

- user -> `protocol.MessageRoleUser`
- assistant -> `protocol.MessageRoleAgent`
- system -> `protocol.MessageRoleUser` with `sourceRole=system` metadata
- tool -> `protocol.MessageRoleAgent` with `sourceRole=tool` and tool call metadata

## Boundaries

- Model/provider interfaces remain unchanged in this PR.
- Controller and handler interfaces remain unchanged in this PR.
- This PR creates conversion primitives used by subsequent protocol-native slices.
