# Ark Query Extension (v1)

A2A v0.3.0 extension for passing Ark query context to execution engines.

**URI**: `https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1`

## Schema

The extension metadata carries a `QueryRef` — a reference to an Ark Query resource:

```json
{
  "name": "my-query",
  "namespace": "default"
}
```

See [schema.json](./schema.json) for the formal JSON Schema definition.

### Target override

`target` is optional. It names the resource the engine should execute, overriding the Query's own `spec.target`:

```json
{
  "name": "my-query",
  "namespace": "default",
  "target": { "type": "agent", "name": "researcher" }
}
```

The completions engine sends it when dispatching one member of a team, because the Query targets the team rather than the member. The controller never sends it for a top-level dispatch, where `spec.target` is authoritative.

An engine that does not understand `target` ignores it and reads `spec.target`, so a top-level dispatch is unaffected. Resolving a team member requires ark-sdk >= 0.1.68.

A `target` invocation is a sub-request: the calling engine owns the Query's status, memory and broker stream, so the receiving engine must not write to any of them.

## Metadata Key

```
https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1/ref
```

## Agent Card Declaration

Engines that support this extension declare it in their agent card:

```json
{
  "capabilities": {
    "extensions": [{
      "uri": "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1",
      "description": "Ark query context",
      "required": false
    }]
  }
}
```

## Wire Format

Request. Activation is signalled by `message.extensions`; Ark does not currently send the `X-A2A-Extensions` request header:

```http
POST /message HTTP/1.1

{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [...],
      "extensions": ["https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1"]
    },
    "metadata": {
      "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1/ref": {
        "name": "my-query",
        "namespace": "default"
      }
    }
  }
}
```

## Resolution

Only a QueryRef (name + namespace) crosses the A2A boundary. The controller sends no agent config, model credentials, tool definitions, or MCP server details over the wire.

The executor resolves all resources locally from the cluster using its pod's service account:

1. Fetch the Query CRD using the QueryRef
2. Fetch the referenced Agent CRD
3. Resolve the Model CRD (including API keys from Secrets)
4. Resolve MCPServer CRDs referenced by the agent's MCP-type tools (including headers from Secrets)
5. Build the `ExecutionEngineRequest` in-process

Secrets never traverse the A2A boundary — they are read from Kubernetes within the executor pod.

The Python SDK handles this resolution transparently via the query extension. Engine authors receive a fully populated `ExecutionEngineRequest` from the SDK without interacting with the extension or Kubernetes APIs directly.
