# Drop Query Input Types

## Requirements

### MUST

- Existing `type: messages` queries continue to work via mutating webhook during deprecation period
- Migration warning annotation is attached when webhook converts `type: messages` to `type: user`
- After removal, `type: messages` returns a clear validation error
- `query_types.go` has no `openai-go` import dependency after removal phase
- All tests pass with text-only input across controller, completions, API, SDK, and dashboard

### SHOULD

- Deprecation webhook follows the established migration warning pattern from model_webhook.go
- SDK and CLI changes ship in the same release as the deprecation webhook
- Documentation is updated before enforcement phase

### MAY

- Support structured input (e.g., JSON object) as a future extension to `type: user` if needed
- Accept content-type hints in the input for non-text data
