# Team Round-Robin Deprecation Warning

Validates that teams using deprecated `strategy: round-robin` are migrated to `sequential` with appropriate warnings.

## What it tests
- Team with `round-robin` and `maxTurns` is migrated to `sequential` with `loops: true` (maxTurns preserved)
- Team with `round-robin` without `maxTurns` is migrated to plain `sequential`
- Both cases produce a deprecation warning
- Team with `sequential` strategy does not produce a deprecation warning

## Running
```bash
chainsaw test tests/team-round-robin-deprecation-warning
```

Successful test completion validates the round-robin migration webhook works correctly.
