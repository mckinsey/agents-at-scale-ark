# Query Parameters Ref Test

Tests query parameter ref templating and injection.

## What it tests
- Query input parameter templating
- Parameter resolution from ConfigMaps and Secrets
- Dynamic query configuration
- Template substitution in query inputs

## Running
```bash
chainsaw test
```

Validates that agents and tools can dynamically resolve parameters from query.