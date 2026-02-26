# A2A Experimental Team Selector Test

Tests selector team strategy with A2A experimental mode enabled.

## What it tests

- Selector team execution uses A2A execution path (`executeSelectorA2A`)
- Query with `ark.mckinsey.com/a2a-experimental-enabled: "true"` annotation triggers A2A mode
- Coordinator agent dynamically selects participants based on conversation flow
- Selection flow: researcher -> analyst -> coordinator (terminate)

## A2A Features Validated

- A2A annotation processing on Query resource
- A2A-enabled selector team execution flow
- AI-driven participant selection in A2A mode
- Selector prompt template variable substitution (Roles, History, Participants)
- Tool calls (terminate) work correctly in selector teams under A2A

## Mock-LLM Configuration

Uses mock-llm with `ark.a2a.enabled: true` to:
- Create A2A server resources automatically
- Provide deterministic responses for selector prompts
- Simulate intelligent participant selection based on conversation state
- Handle terminate tool call from coordinator
- Enable reliable CI/CD testing

## Running

```bash
chainsaw test
```

## Expected Assertions

1. Model becomes available
2. All agents (researcher, analyst, coordinator) become available
3. Team with selector strategy becomes available
4. Query completes successfully
5. Response target is selector-team
6. Response content length > 100 (meaningful output from selector flow)
