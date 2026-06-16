# Team Graph Deprecation Warning

Validates that teams using deprecated `strategy: graph` are migrated to `sequential` with appropriate warnings.

## What it tests
- Team with `graph` strategy is migrated to `sequential` with `loops: false`
- Graph edges and maxTurns are discarded
- Deprecation warning is produced
- Team with `sequential` strategy does not produce a graph deprecation warning

## Running
```bash
chainsaw test tests/team-graph-deprecation-warning
```

Successful test completion validates the graph migration webhook works correctly.
