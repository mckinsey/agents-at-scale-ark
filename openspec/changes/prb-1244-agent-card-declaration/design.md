# PR-B Agent Card Extension Declaration Design

## Decision

Populate the empty `Capabilities` struct in `server.go` with the `ExecutionContextExtensionURI`. This makes the extension discoverable via the A2A agent-card endpoint per Section 4.4.3 of the A2A spec.

## Change

In `server.go`, set `Capabilities.Extensions` when constructing the `AgentCard`:

```go
Capabilities: server.AgentCapabilities{
    Extensions: []server.AgentExtension{
        {URI: arka2a.ExecutionContextExtensionURI},
    },
},
```

## Deprecation Documentation

Add inline documentation noting that `ArkMetadataKey` is deprecated in favor of the extension URI. The legacy key will be removed in PR-C after all engines have migrated.
