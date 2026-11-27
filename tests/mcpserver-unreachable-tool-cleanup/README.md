# MCPServer Unreachable Tool Cleanup

Checks that the Tools of an MCPServer are removed when the server becomes unreachable.

## What it tests

- The Ark API serves collection deletes on Tools (`deletecollection`)
- An MCPServer whose client creation fails reports `ClientCreationFailed` and a zero tool count
- The MCPServer's discovered Tools are deleted
- An Agent that uses one of those Tools reports `ToolNotFound`

## Running

```bash
chainsaw test
```

Passing shows that a failed MCPServer leaves no stale Tools behind on either storage backend.
