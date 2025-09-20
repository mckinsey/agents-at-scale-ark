# Evaluator Context Enhanced Test

Tests the enhanced ARK evaluator with context precision and recall support for RAG-based evaluations.

## What it tests

- Enhanced evaluator with **AgentInstructions** vs **EvaluationContext** separation
- **ADDITIONAL CONTEXT** section in evaluation prompts
- **Context precision and recall** criteria in base evaluation criteria
- **RAGAS context metrics** support (`context_precision`, `context_recall`, `context_entity_recall`)
- **Context parameter** passing from evaluation YAML to evaluator prompts
- Proper **criteria scoring** format including context-specific metrics

## Test Components

### Agent Instructions (scope-aware evaluation)
- KYC risk assessment specialist agent with defined scope and behavior
- Tests proper agent instruction resolution vs context separation

### Evaluation Context (reference material)
- Customer profile data chunks for Associated British Foods PLC
- Risk assessment data for context precision/recall testing
- Controller information for comprehensive evaluation

### Context Metrics Testing
- `context_precision`: How precise is the retrieved context in relation to the query?
- `context_recall`: How well does the response recall relevant information from provided context?
- Integration with RAGAS metrics: `LLMContextPrecisionWithoutReference`, `LLMContextRecall`

### Enhanced Evaluation Criteria
Tests the updated base criteria (now 8 items instead of 6):
1. Relevance, 2. Accuracy, 3. Completeness, 4. Conciseness, 5. Clarity, 6. Usefulness
7. **Context_Precision** (new), 8. **Context_Recall** (new)

## Running

```bash
chainsaw test tests/evaluator-context-enhanced/
```

Successful completion validates that the enhanced evaluator properly separates agent instructions from evaluation context and includes context precision/recall metrics in evaluation scoring.