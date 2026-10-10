# Query with set-based label selector

Verifies that a Query using `spec.selector.matchExpressions` (the set-based
form of a `LabelSelector`) dispatches correctly through the aggregated
PostgreSQL apiserver.

## What it tests
- Creating a Query with `matchExpressions: In` / `NotIn` and a set of labeled
  Agents (specialist vs generalist, production vs development)
- The Query controller lists Agents through the aggregated apiserver using
  the parsed selector
- The apiserver's PostgreSQL storage backend translates set-based operators
  into jsonb SQL and returns the matching Agent
- The Query reaches `Completed` and targets a specialist, not the generalist

The pre-fix backend rejected anything other than equality, so this Query
would never have dispatched.

## Running

```bash
chainsaw test tests/query-label-selector-set-based/
```

Successful completion confirms set-based label selectors flow end-to-end from
Query CR through the controller to the apiserver's storage layer.
