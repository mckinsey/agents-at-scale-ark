# query-broker-ttl

Verifies that `Query.spec.ttl` propagates to broker messages and produces the correct `expires_at` in Postgres.

## What it tests
- A query with `spec.ttl: "1h0m0s"` completes with `phase: done`
- The broker writes the message to Postgres with `expires_at = created_at + 3600s`
- Requires the broker running with postgres backend (`postgresql: "true"` label)

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (which also configures the broker with postgres backend). Successful completion confirms the TTL flows from the Query CRD through the completions executor, the broker POST `/messages`, and into the Postgres `expires_at` column.
