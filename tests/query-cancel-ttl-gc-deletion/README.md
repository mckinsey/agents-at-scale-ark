# query-cancel-ttl-gc-deletion

Regression/coverage companion to `query-ttl-gc-deletion` for the `spec.cancel` path: a
Query held at `input-required` by a tool-approval gate, canceled via `spec.cancel`,
must transition to `cancelled` and then be fully reaped once its TTL elapses.

## What it tests
- A running Query halted at `input-required` (tool call pending approval) transitions
  to `phase: cancelled` after `spec.cancel` is set to `true`
- The canceled Query's TTL (measured from the cancel transition) triggers garbage
  collection, deleting the Query and its finalizer within the expected window

## Running
```bash
chainsaw test
```

Successful completion validates that canceling a Query that is not yet in a terminal
phase converges to `cancelled` and is deleted once its TTL elapses, exercising the same
requeue chain as the done/error terminal paths.
