# ARK Broker Streaming Tests

Tests streaming functionality for real-time message delivery via SSE.

## What it tests
- SSE streaming with OpenAI-compatible chunks
- Query stream lifecycle (wait, join, read completed)
- Stream status and cleanup operations

## Running
```bash
chainsaw test
```

Validates streaming service handles real-time delivery and ARK query integration.