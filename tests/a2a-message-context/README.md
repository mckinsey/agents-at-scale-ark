# A2A Message Context Test

Tests A2A contextId annotation handling for stateful conversations.

## What it tests
- A2A contextId annotation is set on query responses
- Subsequent queries with the same contextId maintain conversation state
- message-counter-agent correctly tracks messages per context

## Running
```bash
chainsaw test
```

Validates that A2A agents maintain conversation state using contextId.
