# Deterministic Evaluation

ARK Evaluator provides deterministic, metrics-based evaluation through the `/evaluate-metrics` endpoint. This evaluation type asserts objective KPIs such as token consumption, cost efficiency, execution performance, and response quality.

## Overview

Deterministic evaluation is designed to evaluate LLM agents based on objective, measurable criteria. It integrates with the ARK SDK to extract performance data from completed Query CRDs and applies configurable thresholds to determine if agent responses meet specified performance standards.

## Architecture

### Core Components

1. **MetricEvaluator**: Main orchestrator that coordinates evaluation processes
2. **MetricsCalculator**: Computes weighted scores across four dimensions:
   - **Token Score**: Token usage efficiency and limits
   - **Cost Score**: Cost per query and efficiency metrics
   - **Performance Score**: Execution time and throughput
   - **Quality Score**: Response completeness and error rates
3. **ArkClient**: ARK SDK integration for loading Query CRDs
4. **QueryResolver**: Kubernetes API client for query data extraction

### Scoring System

The service calculates an overall score (0.0-1.0) for LLM agent performance using weighted metrics:

```python
overall_score = (
    token_score * token_weight +
    cost_score * cost_weight +
    performance_score * performance_weight +
    quality_score * quality_weight
)
```

**Default weights:**
- Token: 30%
- Cost: 30% 
- Performance: 20%
- Quality: 20%

## Evaluation Dimensions

### 1. Token Score
Evaluates token usage efficiency and adherence to limits:
- **Token Efficiency**: Ratio of useful tokens to total tokens consumed
- **Token Limit Compliance**: Whether response stays within specified token limits
- **Throughput**: Tokens processed per second

### 2. Cost Score
Assesses cost efficiency and budget compliance:
- **Cost per Query**: Total cost incurred for the evaluation
- **Cost Efficiency**: Value derived relative to cost incurred
- **Budget Compliance**: Adherence to cost thresholds

### 3. Performance Score
Measures execution speed and responsiveness:
- **Execution Time**: Total time from request to completion
- **Response Time**: Time to first token/response
- **Throughput**: Requests processed per unit time

### 4. Quality Score
Evaluates response completeness and error rates:
- **Response Completeness**: How complete and comprehensive the response is
- **Error Rate**: Frequency of errors or incomplete responses
- **Response Length**: Whether response length is appropriate

## API Usage

### Endpoint
```
POST /evaluate-metrics
```

### Request Format

**Direct Evaluation** (evaluate input/output pairs):
```json
{
  "type": "direct",
  "config": {
    "input": "What is the capital of France?",
    "output": "The capital of France is Paris."
  },
  "parameters": {
    "maxTokens": "1000",
    "maxDuration": "30s",
    "maxCostPerQuery": "0.05",
    "tokenWeight": "0.3",
    "costWeight": "0.3",
    "performanceWeight": "0.2",
    "qualityWeight": "0.2"
  }
}
```

**Query-based Evaluation** (evaluate existing Query CRDs):
```json
{
  "type": "query",
  "config": {
    "queryRef": {
      "name": "my-query",
      "namespace": "default",
      "responseTarget": "agent:agent-1"
    }
  },
  "parameters": {
    "tokenEfficiencyThreshold": "0.3",
    "maxCostPerQuery": "0.10",
    "maxDuration": "2m",
    "minTokensPerSecond": "10.0",
    "minResponseLength": "50",
    "maxResponseLength": "2000",
    "responseCompletenessThreshold": "0.8",
    "tokenWeight": "0.3",
    "costWeight": "0.3",
    "performanceWeight": "0.2",
    "qualityWeight": "0.2"
  }
}
```

### Response Format

```json
{
  "score": "0.85",
  "passed": true,
  "metadata": {
    "reasoning": "All performance thresholds met",
    "evaluation_type": "deterministic_metrics",
    "total_tokens": 1250,
    "execution_time": "2.5s",
    "cost": "0.045",
    "token_score": "0.90",
    "cost_score": "0.80",
    "performance_score": "0.85",
    "quality_score": "0.85",
    "threshold_violations": [],
    "passed_thresholds": ["maxTokens", "maxDuration", "maxCostPerQuery"]
  },
  "error": null,
  "tokenUsage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 1250
  }
}
```

## Configuration Parameters

### Performance Thresholds
- `maxTokens`: Maximum total tokens allowed (default: 5000)
- `maxDuration`: Maximum execution time (e.g., "30s", "2m", "1h")
- `minTokensPerSecond`: Minimum throughput requirement (default: 10.0)

### Cost Management
- `maxCostPerQuery`: Maximum cost per query in USD (default: 0.10)
- `costEfficiencyThreshold`: Minimum cost efficiency score (default: 0.8)
- `tokenEfficiencyThreshold`: Minimum token efficiency ratio (default: 0.3)

### Quality Requirements
- `responseCompletenessThreshold`: Minimum response completeness (default: 0.8)
- `minResponseLength`: Minimum response length in characters (default: 50)
- `maxResponseLength`: Maximum response length in characters (default: 2000)

### Scoring Weights
- `tokenWeight`: Weight for token score (default: 0.3)
- `costWeight`: Weight for cost score (default: 0.3)
- `performanceWeight`: Weight for performance score (default: 0.2)
- `qualityWeight`: Weight for quality score (default: 0.2)

**Note**: Weights must sum to 1.0

## Use Cases

### 1. Production Monitoring
Monitor live LLM agents for:
- Cost overruns
- Performance degradation
- Quality regressions
- Token efficiency issues

### 2. A/B Testing
Compare different models or configurations:
- Cost effectiveness
- Performance characteristics
- Quality metrics
- Overall efficiency

### 3. SLA Compliance
Ensure agents meet service level agreements:
- Response time requirements
- Quality thresholds
- Cost budgets
- Throughput expectations

### 4. Optimization
Identify optimization opportunities:
- Token usage patterns
- Performance bottlenecks
- Cost optimization potential
- Quality improvement areas

## Integration with ARK

Deterministic evaluation integrates seamlessly with ARK's Query CRDs, automatically extracting:
- Token usage statistics
- Execution timing data
- Cost information
- Response quality metrics

This allows for post-execution analysis of completed queries without additional instrumentation.

## Best Practices

1. **Set Realistic Thresholds**: Base thresholds on historical performance data
2. **Weight According to Priority**: Adjust weights based on business priorities
3. **Monitor Trends**: Track metrics over time to identify patterns
4. **Combine with LLM Evaluation**: Use alongside subjective evaluation for comprehensive assessment
5. **Regular Threshold Review**: Periodically review and adjust thresholds as models improve