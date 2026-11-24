# query-ttl-gc-deletion

Regression for [#2828](https://github.com/mckinsey/agents-at-scale-ark/issues/2828): a terminal-phase Query whose TTL elapses must be fully reaped, not stuck in `Terminating` with the `ark.mckinsey.com/finalizer` blocking it.

## What it tests
- A query with `spec.ttl: 10s` completes with `phase: done`
- The `ark.mckinsey.com/finalizer` is present after completion
- The Query is fully deleted (finalizer removed, object gone) within 2m of TTL expiry

Before the #2828 fix the controller's TTL guard called `r.Delete` and returned before `handleFinalizer`, so the finalizer was never removed and the object stayed in `Terminating` forever. This test's final `wait for: deletion: {}` step would time out.

## Running
```bash
chainsaw test
```
