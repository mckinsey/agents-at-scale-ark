# Query Reference Evaluation Test

Tests post-hoc evaluation functionality using query references.

## What it tests
- Query-ref evaluation mode using existing query responses
- Post-hoc evaluation workflow (query execution followed by separate evaluation)
- Evaluation resource creation that references completed queries
- LLM-as-a-Judge evaluation of previously generated agent responses
- Evaluation scoring and pass/fail determination

## Running
```bash
chainsaw test
```

Successful completion validates that evaluations can reference and evaluate existing query responses using the query-ref pattern.