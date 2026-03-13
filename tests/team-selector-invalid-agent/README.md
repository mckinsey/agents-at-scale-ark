# Team Selector Invalid Agent

Tests that when a selector agent returns an invalid agent name, the conversation ends gracefully with an appropriate warning message.

## What it tests
- Selector team strategy with AI-driven participant selection
- Selector returning invalid agent name (invalid-agent-name)
- Conversation termination after invalid agent name
- System message warning: "Selector returned invalid agent name: invalid-agent-name. Ending conversation"

## Running
```bash
chainsaw test
```

Validates that selector teams handle invalid agent selection by terminating conversation with clear error message.
