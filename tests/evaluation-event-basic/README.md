# Basic Event Evaluation Test

Tests basic event-based evaluation functionality using simple pattern matching.

## What it tests
- Event evaluation type with basic expression rules
- Kubernetes event fetching for query execution
- Basic pattern matching for common event types
- Event evaluation scoring and pass/fail logic
- Integration with ark-evaluator service event provider
- Metadata annotation propagation from evaluator response

## Running
```bash
chainsaw test
```

Successful completion validates that event evaluations can assess Kubernetes events with basic pattern matching and produce evaluation scores.