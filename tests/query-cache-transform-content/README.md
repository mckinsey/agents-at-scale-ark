# Query Cache Transform Content

Validates that the controller's cache transform does not corrupt observable Query state.

## What it tests
- A query targeting the mock model completes and reaches `phase: done`.
- `status.response.content` returned by the API server contains the full marker payload, proving etcd keeps the complete content even though the transform strips it from the controller's in-memory cache.
- The response target is resolved correctly.

## Running
```bash
chainsaw test
```

Successful completion confirms the cache transform strips content only from the in-memory cache, leaving the API-server-served object intact.
