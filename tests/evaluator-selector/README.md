# Evaluator Selector Integration Test

This test validates the evaluator selector functionality for automatic query evaluation.

## Test Scenarios

1. **Selector Matching**: Evaluator with selector creates evaluation for matching query
2. **Non-Matching Query**: Non-matching query does not trigger evaluation  
3. **Parameter Override**: Manual evaluation with parameter overrides works correctly
4. **ConfigMap Parameters**: Evaluator using ConfigMap for parameters works
5. **Re-evaluation**: Query changes trigger evaluation updates

## Test Resources

- `a01-secret.yaml`: API key for model
- `a02-model.yaml`: Default model for evaluator
- `a03-configmap.yaml`: ConfigMap with parameter values
- `a04-evaluator-with-selector.yaml`: Evaluator with query selector
- `a05-query-matching.yaml`: Query that matches evaluator selector
- `a06-query-non-matching.yaml`: Query that doesn't match selector
- `a07-manual-evaluation-override.yaml`: Manual evaluation with parameter overrides

## Expected Behavior

1. Evaluator should reach "ready" status
2. Matching query should trigger automatic evaluation creation
3. Non-matching query should not create evaluation
4. Manual evaluation should merge parameters correctly
5. All evaluations should complete successfully