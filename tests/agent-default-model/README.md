# Agent Default Model Test

Tests agent behavior with and without default model present using mock-llm.

## What it tests

### Scenario 1: With default model
- Mock OpenAI server deployed (mock-llm)
- Default model created pointing to mock server
- Agent creation without explicit modelRef
- Webhook sets modelRef to "default"
- Model shows as Available
- Agent shows as Available when default model exists
- Query execution using default model succeeds

### Scenario 2: Without default model
- Agent creation without explicit modelRef
- Webhook sets modelRef to "default"
- Agent shows as Unavailable (ModelNotFound) when default model doesn't exist
- Admission succeeds but agent cannot be used

## Running
```bash
chainsaw test
```

Validates that agents correctly use the default model when no explicit model is specified, and show appropriate status when the default model is missing.