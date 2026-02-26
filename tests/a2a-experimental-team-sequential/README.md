# A2A Native Team Sequential Test

Tests sequential team execution with A2A native mode enabled.

## What it tests

- Sequential team execution uses A2A execution path (`executeSequentialA2A`)
- Query executes through A2A mode by default
- All three agents (researcher, analyst, summarizer) execute in sequence
- Final response contains expected SUMMARY: content from summarizer

## A2A Features Validated

- Default A2A execution on Query resource
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
