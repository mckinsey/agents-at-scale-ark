# A2A Experimental Memory Test

Tests A2A memory operations (AddA2AMessages, GetA2AMessages) with experimental mode enabled.

## What it tests

- A2A memory operations persist messages across queries
- First query creates a context and receives "1 message(s) received"
- Second query with same contextId sees accumulated messages "2 message(s) received"
- Validates A2A format is preserved through memory operations

## A2A Features Validated

- A2A annotation processing on Query resource
- `AddA2AMessages` - storing messages in A2A format
- `GetA2AMessages` - retrieving messages for a context
- `contextId` assignment and propagation
- Message persistence across multiple queries

## Test Scenario

1. First query is sent to message-counter-agent with A2A enabled
2. Agent responds with "1 message(s) received" and sets contextId
3. contextId is extracted from first response
4. Second query is sent with same contextId via annotation
5. Agent responds with "2 message(s) received" (accumulated messages)

## Mock-LLM Configuration

Uses mock-llm with `ark.a2a.enabled: true` to:
- Create mock-llm-message-counter A2AServer automatically
- Message counter tracks messages per contextId
- No model configuration needed (A2A server handles requests)

## Running

```bash
chainsaw test
```

## Expected Assertions

1. A2AServer mock-llm-message-counter becomes Ready
2. First query completes with "1 message(s) received"
3. contextId is present in first query response
4. Second query with same contextId shows "2 message(s) received"
