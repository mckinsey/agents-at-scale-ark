# query-ttl-propagation

Verifies that `Query.spec.ttl` propagates through the full execution pipeline without breaking query execution.

## What it tests
- A query with an explicit `spec.ttl: "1h0m0s"` completes with `phase: done`
- The TTL value flows from the Query CRD through the completions executor and into the broker POST `/messages` call without errors
- Unit tests cover the per-layer transformation (Go: `ttlSecondsFromQuery`, HTTP body; Python: `_parse_go_duration_to_seconds`, broker client); this test covers the assembled pipeline

## Running
```bash
chainsaw test
```

Successful completion confirms the TTL plumbing does not break query execution end-to-end.
