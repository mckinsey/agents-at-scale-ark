# A2A Experimental Team Sequential Test

Tests sequential team execution with A2A experimental mode enabled.

## What it tests

- Sequential team execution uses A2A execution path (`executeSequentialA2A`)
- Query with `ark.mckinsey.com/a2a-experimental-enabled: "true"` annotation triggers A2A mode
- All three agents (researcher, analyst, summarizer) execute in sequence
- Final response contains expected SUMMARY: content from summarizer

## A2A Features Validated

- A2A annotation processing on Query resource
- A2A-enabled team execution flow
- Message passing through sequential team members in A2A format

## Mock-LLM Configuration

Uses mock-llm with `ark.a2a.enabled: true` to:
- Create A2A server resources automatically
- Provide deterministic responses for each agent
- Enable reliable CI/CD testing

## Running

```bash
chainsaw test
```

## Expected Assertions

1. Model becomes available
2. All agents (researcher, analyst, summarizer) become available
3. Team becomes available
4. Query completes successfully
5. Response contains "SUMMARY:" indicating full sequential flow completed
