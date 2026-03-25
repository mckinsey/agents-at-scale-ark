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

Request:

```http
POST /message HTTP/1.1
X-A2A-Extensions: https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1

{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": { "role": "user", "parts": [...] },
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
