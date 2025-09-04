# LLM Evaluator

AI-powered query evaluation service using LLM-as-a-Judge approach.

### Quick Build 
```bash
# From project root
make evaluator-llm-build
```

### Full Workflow
```bash
# From project root
make evaluator-llm-deps     # Install dependencies (including ark-sdk)
make evaluator-llm-test     # Run tests
make evaluator-llm-build    # Build Docker image
make evaluator-llm-install  # Deploy to cluster
kubectl rollout restart deployment evaluator-llm   #force deployment update
```

### Development
```bash
make evaluator-llm-dev      # Run service locally
```

## Configuration

The service automatically receives model configuration from the Ark Evaluator custom resource, supporting:

- OpenAI-compatible APIs
- Azure OpenAI services
- Custom API endpoints

## Evaluation Criteria

The service evaluates responses on:

1. **Relevance** (0-1): How well responses address the query
2. **Accuracy** (0-1): Factual correctness and reliability
3. **Completeness** (0-1): Comprehensiveness of information
4. **Clarity** (0-1): Readability and understanding
5. **Usefulness** (0-1): Practical value to the user

Responses with scores ≥70 are marked as "passed".
## Notes
- Requires Python with uv package manager
- Evaluates responses across multiple quality dimensions
