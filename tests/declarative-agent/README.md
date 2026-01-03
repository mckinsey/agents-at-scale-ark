# Declarative Agent Test

Tests that declarative agents (agents with ExecutionEngine source.image) create Deployments with correct environment variable injection.

## What it tests
- ExecutionEngine with source.image triggers Deployment creation
- Agent config values are injected as uppercase env vars
- Model configuration is injected as ARK_MODEL_* env vars
- Service is created for the agent

## Running
```bash
chainsaw test
```

Validates that template-based agents receive config and model info as environment variables.
