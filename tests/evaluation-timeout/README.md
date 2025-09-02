# Evaluation Timeout Test

Tests that the timeout configuration from Evaluation CRD is properly passed to the evaluator service.

## What it tests
- Default timeout of 5 minutes when not specified
- Custom timeout values are respected
- Timeout is properly logged in controller

## Running
```bash
chainsaw test
```

Successful completion validates that timeout configuration from the CRD spec is properly used during evaluation execution.