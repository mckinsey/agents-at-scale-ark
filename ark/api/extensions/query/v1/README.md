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

Receivers use the QueryRef to look up the full Query CRD from the Kubernetes cluster. The Query resource contains the agent configuration, tools, history, and all other execution context. The Python SDK handles this resolution transparently — engine authors receive a fully populated `ExecutionEngineRequest` without needing to interact with the extension directly.
