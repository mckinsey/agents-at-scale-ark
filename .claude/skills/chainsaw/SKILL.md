---
name: ark-chainsaw-testing
description: Run and write Ark Chainsaw tests with mock-llm. Use for running tests, debugging failures, or creating new e2e tests.
---

# Ark Chainsaw Testing

Run and write Chainsaw e2e tests for Ark resources.

## Running Tests

```bash
# Run all standard tests
(cd tests && chainsaw test --selector 'standard')

# Run specific test
chainsaw test ./tests/query-parameter-ref --fail-fast

# Debug mode - keep resources on failure
chainsaw test ./tests/query-parameter-ref --skip-delete --pause-on-failure
```

## Writing Tests

Reference `tests/CLAUDE.md` for comprehensive patterns.

For a complete working example that shows the correct patterns for writing tests, see [examples.md](examples.md).

## Test Structure

```
tests/my-test/
├── chainsaw-test.yaml      # Test definition
├── mock-llm-values.yaml    # Mock LLM config (if needed)
├── README.md               # Required documentation
└── manifests/
    ├── a03-model.yaml      # Model before Agent
    ├── a04-agent.yaml      # Agent before Query
    └── a05-query.yaml      # Query last
```

## Environment Variables

For real LLM tests (not mock-llm):
```bash
export E2E_TEST_AZURE_OPENAI_KEY="your-key"
export E2E_TEST_AZURE_OPENAI_BASE_URL="your-endpoint"
```
