# Direct Evaluation Test

Tests standalone direct evaluation functionality using the Evaluation resource.

## What it tests
- Direct evaluation mode with input/output pairs
- Evaluation parameters (scope, min-score, temperature) takes precedence over evaluator defined parameters
- Evaluation scoring and pass/fail logic
- Integration with evaluator-llm service
- Golden examples loaded from ConfigMap for enhanced evaluation context
- Metadata annotation propagation from evaluator response

## Running
```bash
chainsaw test
```

Successful completion validates that direct evaluations can assess input/output pairs with configurable parameters and produce evaluation scores.