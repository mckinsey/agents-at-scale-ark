## Why

The completions engine uses `ExecutionContextExtensionURI` at runtime but does not declare it in the Agent Card capabilities. Strict A2A clients cannot discover supported extensions, weakening interoperability.

## What Changes

- Declare `execution-context/v1` extension in completions Agent Card `Capabilities.Extensions`.
- Document deprecation plan for legacy `ArkMetadataKey` metadata path.

## Capabilities

### New Capabilities
- `agent-card-extension-declaration`: Agent Card advertises supported Ark extension URIs for A2A discovery.

### Modified Capabilities

## Impact

- `ark/executors/completions/server.go`
