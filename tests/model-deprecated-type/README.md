# Model Deprecated Type Format

Tests that the deprecated `spec.type` field (used for provider in Ark < 0.50) still works but emits a deprecation warning.

## What it tests
- Model with old format (`type: openai` instead of `provider: openai`) is accepted
- Model becomes available and functional
- Deprecation warning is emitted by the webhook

## Running
```bash
chainsaw test ./tests/model-deprecated-type
```

Successful completion validates backward compatibility with deprecation notice.
