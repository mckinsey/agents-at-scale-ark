## Why

The completions engine uses `ExecutionContextExtensionURI` at runtime but does not declare it in the Agent Card capabilities. Strict A2A clients cannot discover supported extensions, weakening interoperability. PR-A introduced `ExecutionTraceExtensionURI` as well, which also needs declaration.

## What Changes

- Declare `execution-context/v1` and `execution-trace/v1` extensions in completions Agent Card `Capabilities.Extensions`.
- Document deprecation plan for legacy `ArkMetadataKey` metadata path.

## Prerequisites

- PR-A merged: generic extension helpers (`SetExtension`, `SetMetadata`) and extension URI constants available in `ark/internal/a2a/`.

## Capabilities

### New Capabilities
- `agent-card-extension-declaration`: Agent Card advertises supported Ark extension URIs for A2A discovery.

### Modified Capabilities

## Impact

- `ark/executors/completions/server.go`
