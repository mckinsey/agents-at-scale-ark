# Evaluator Selector Examples

This directory contains examples of using evaluator selectors for automatic query evaluation.

## Overview

Evaluator selectors allow evaluators to automatically create evaluations for queries that match specific label criteria. When a matching query reaches "done" status, the evaluator creates an evaluation resource.

## Files

### evaluator-with-selector.yaml

Contains two evaluator examples:

1. **production-quality-evaluator**: Evaluates queries with production labels
2. **configmap-based-evaluator**: Uses ConfigMap for parameter values

### queries-with-labels.yaml

Contains query examples and a manual evaluation:

1. **production-analysis-query**: Matches production-quality-evaluator
2. **research-priority-query**: Matches configmap-based-evaluator  
3. **development-query**: Doesn't match any evaluators
4. **manual-override-evaluation**: Manual evaluation with parameter overrides

## Usage

1. Apply the resources:
   ```bash
   kubectl apply -f evaluator-with-selector.yaml
   kubectl apply -f queries-with-labels.yaml
   ```

2. Check evaluator status:
   ```bash
   kubectl get evaluators
   kubectl describe evaluator production-quality-evaluator
   ```

3. When queries complete, check for automatic evaluations:
   ```bash
   kubectl get evaluations
   kubectl get evaluations -l ark.mckinsey.com/auto=true
   ```

## Selector Behavior

- **Automatic Creation**: When a query with matching labels reaches "done" status, an evaluation is automatically created
- **Naming Convention**: Auto-created evaluations use the format `{evaluator-name}-{query-name}-eval`
- **Labels**: Auto-created evaluations have labels identifying the evaluator and query
- **Re-evaluation**: If a query changes and reaches "done" again, the evaluation is updated to retrigger

## Parameter Override

The manual evaluation example shows how evaluation parameters override evaluator defaults:

- Evaluator default: `scope: "accuracy,clarity,usefulness"`
- Evaluation override: `scope: "accuracy,completeness"`
- Result: Uses the evaluation's scope value

New parameters can also be added that don't exist in the evaluator defaults.

## Troubleshooting

### No Evaluations Created

1. Check evaluator status: `kubectl describe evaluator <name>`
2. Verify query labels match selector
3. Ensure query status is "done"
4. Check evaluator logs: `kubectl logs -l app=ark-controller-manager`

### Parameter Resolution Issues

1. Verify ConfigMap exists: `kubectl get configmap evaluation-config`
2. Check ConfigMap keys match parameter references
3. Review evaluator status for parameter resolution errors