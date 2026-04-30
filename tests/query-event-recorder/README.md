# Query Event Recorder Test

Tests that events are emitted correctly during query execution lifecycle.

## What it tests
- **Events validated via the ark-broker:**
  - `QueryExecutionStart` - Query execution initiation
  - `AgentExecutionStart` - Agent processing begins
  - `LLMCallStart` - LLM API call initiation
  - `LLMCallComplete` - LLM API call completion
  - `AgentExecutionComplete` - Agent processing completion
  - `QueryExecutionComplete` - Query execution completion
- Events are retrievable from the broker by query UID

## Running
```bash
chainsaw test
```

Validates that all expected lifecycle events are recorded in the broker during query execution.
