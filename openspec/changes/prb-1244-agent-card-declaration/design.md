# PR-B Agent Card Extension Declaration Design

## Decision

Populate the empty `Capabilities` struct in `server.go` with both Ark extension URIs. This makes the extensions discoverable via the A2A agent-card endpoint per Section 4.4.3/4.4.4 of the A2A spec.

## Prerequisites

PR-A provides:
- `arka2a.ExecutionContextExtensionURI` and `arka2a.ExecutionTraceExtensionURI` constants
- Generic `SetExtension`/`GetExtension` helpers for runtime extension handling

This PR completes the discovery side -- declaring in the Agent Card what the runtime already supports.

## Change

In `server.go`, set `Capabilities.Extensions` when constructing the `AgentCard`:

```go
Capabilities: server.AgentCapabilities{
    Extensions: []server.AgentExtension{
        {URI: arka2a.ExecutionContextExtensionURI},
        {URI: arka2a.ExecutionTraceExtensionURI},
    },
},
```

## Deprecation Documentation

Add inline documentation noting that `ArkMetadataKey` is deprecated in favor of the extension URI. The legacy key will be removed in PR-C after all engines have migrated. At runtime, PR-A's `SetMetadata` is used for the legacy key (not `SetExtension`), so it never appears in `Message.extensions` per the A2A spec.
