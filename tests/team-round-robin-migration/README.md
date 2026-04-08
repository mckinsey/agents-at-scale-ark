# Round-Robin Migration Test

Tests that the mutating webhook correctly migrates deprecated `round-robin` strategy to `sequential`.

## What it tests
- Round-robin with maxTurns migrates to sequential with `loops: true` and maxTurns preserved
- Round-robin without maxTurns migrates to sequential with `loops: false`
- Migrated teams execute queries successfully using mock-llm

## Running
```bash
chainsaw test
```

Successful completion validates that round-robin teams are transparently migrated and remain functional.
