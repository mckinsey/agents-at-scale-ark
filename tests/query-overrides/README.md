# Query Overrides Test

Tests HTTP header overrides defined in Query spec for models and MCP servers using label selectors, including precedence over Agent-level overrides.

## What it tests
- Query-level header overrides for models via labelSelector
- Query-level header overrides for MCP servers via labelSelector
- Static values, Secrets, and ConfigMaps as header value sources
- Header propagation to model HTTP requests
- Header propagation to MCP server tool calls
- Query overrides take precedence over Agent overrides for the same headers

## Running
```bash
chainsaw test tests/query-overrides/
```

Successful completion validates that headers defined in Query overrides are correctly propagated to matching models and MCP servers, and that Query overrides take precedence over Agent overrides.
