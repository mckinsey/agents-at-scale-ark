# Direct Evaluation Test - RAGAS Provider

Tests direct evaluation functionality using the RAGAS provider for LLM-based assessment.

## What it tests
- RAGAS provider integration for direct evaluation mode
- Azure OpenAI configuration for RAGAS metrics evaluation
- Evaluation scoring with relevance metric (0.0-1.0 range)
- Pass/fail determination based on min-score threshold (0.7)
- Metadata annotation propagation including:
  - Provider confirmation (`evaluation.metadata/provider: ragas`)
  - Requested metrics tracking (`evaluation.metadata/requested_metrics: relevance`)
  - Metric count validation (`evaluation.metadata/metric_count: "1"`)
  - Validation summary presence check
- Integration with ark-evaluator service deployed in default namespace
- Model availability and evaluator readiness verification

## Resources Created
- **Model**: Azure OpenAI model (gpt-4.1-mini) for evaluation
- **Evaluator**: RAGAS-based evaluator with Azure configuration
- **Evaluation**: Direct evaluation with simple math Q&A example
- **RBAC**: Permissions for accessing secrets and ARK resources

## Key Assertions
1. Model availability status
2. Evaluator reaches ready phase
3. Evaluation completes (phase: done)
4. Score is string type within 0.0-1.0 range
5. Passed status is boolean
6. RAGAS-specific metadata annotations are present
7. Validation summary annotation exists

## Running
```bash
chainsaw test
```

Successful completion validates that RAGAS provider can perform direct evaluations with proper scoring, metadata tracking, and Azure OpenAI integration.