# Baseline Evaluation Test

Tests baseline evaluation functionality using ConfigMap-based golden examples.

## What it tests
- Baseline evaluation type with ConfigMap golden examples
- Golden example structure with all GoldenTestCase fields
- Evaluation parameters passed from evaluator to service
- Integration with evaluator-llm service

## Running
```bash
chainsaw test
```

Successful completion validates that baseline evaluations can use ConfigMap-based golden examples following the GoldenTestCase schema.