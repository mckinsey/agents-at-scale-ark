# Query Partial Success Test

Tests queries with mixed success/failure scenarios - where some targets succeed and others fail.

## What it tests
- Multi-target query execution with some targets failing
- Partial success behavior - successful responses preserved when other targets fail
- Overall query status is "error" when any target fails
- Failed targets have proper error serialization in Raw field
- Error targets have populated content field

## Running
```bash
chainsaw test
```

Validates that queries can handle partial success scenarios correctly, preserving successful responses while properly handling failures.