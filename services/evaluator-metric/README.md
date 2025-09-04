# Metric Evaluator Service

Evaluation service specially built to assert deterministic KPIs such as token consumption, cost efficiency, execution performance, and response quality.

## Overview

The Metric Evaluator Service is designed to evaluate LLM agents based on objective, measurable criteria. It integrates with the ARK SDK to extract performance data from completed Query CRDs and applies configurable thresholds to determine if agent responses meet specified performance standards.

## Features

- **Multi-criteria Assessment**: Evaluates responses across key dimensions
- **Model Flexibility**: Supports OpenAI and Azure OpenAI model configurations
- **REST API**: Simple HTTP interface for evaluation requests
- **Kubernetes Native**: Deployed as Ark Evaluator custom resource
- **Post-execution Metrics Analysis**: Extracts performance data from completed LLM agent executions
- **Cost Tracking**: Built-in cost calculation and efficiency metrics from token usage

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

Default weights:
- Token: 30%
- Cost: 30% 
- Performance: 20%
- Quality: 20%

## API Endpoints

### Health Checks
- `GET /health` - Service health status
- `GET /ready` - Service readiness status

### Evaluation
- `POST /evaluate` - Unified evaluation endpoint for LLM agents

#### Request Format

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

**Query-based Evaluation** (evaluate LLM agents via existing Query CRDs):
```json
{
  "type": "query",
  "config": {
    "queryRef": {
      "name": "my-query",
      "namespace": "default",
      "responseTarget": "agent-1"
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

#### Response Format

```json
{
  "score": "0.85",
  "passed": true,
  "metadata": {
    "reasoning": "",
    "evaluation_type": "performance_metrics",
    "total_tokens": 1250,
    "execution_time": "2.5s",
    "cost": "0.045",
    "token_score": "0.90",
    "token_score": "0.80",
    "performance_score": "0.85",
    "quality_score": "0.85",
    "totalTokens": 1250,
    "threshold_violations": ["costEfficiencyThreshold"],
    "passed_thresholds": ["maxTokens", "maxDuration", "maxCostPerQuery"],
    
  },
  "error": null,
  "tokenUsage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0
  }
}
```

## Configuration

### Ark Evaluator Custom Resource

The service receives configuration through Ark Evaluator custom resources:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: performance-evaluator
  namespace: default
spec:
  description: "Performance metrics evaluator for production queries"
  address:
    value: http://evaluator-metric.default.svc.cluster.local:8000
  selector:
    resourceType: "Query"
    apiGroup: "ark.mckinsey.com"
    matchLabels:
      environment: "production"
      metrics-enabled: "true"
  parameters:
    - name: maxTokens
      value: "5000"
    - name: maxDuration
      value: "30s"
    - name: maxCostPerQuery
      value: "0.10"
    - name: tokenWeight
      value: "0.3"
    - name: costWeight
      value: "0.3"
    - name: performanceWeight
      value: "0.2"
    - name: qualityWeight
      value: "0.2"
    - name: responseCompletenessThreshold
      value: "0.8"
    - name: minResponseLength
      value: "50"
    - name: maxResponseLength
      value: "2000"
```

### Configuration Parameters

#### Performance Thresholds
- `maxTokens`: Maximum total tokens allowed (default: 5000)
- `maxDuration`: Maximum execution time (e.g., "30s", "2m", "1h")
- `minTokensPerSecond`: Minimum throughput requirement (default: 10.0)

#### Cost Management
- `maxCostPerQuery`: Maximum cost per query in USD (default: 0.10)
- `costEfficiencyThreshold`: Minimum cost efficiency score (default: 0.8)
- `tokenEfficiencyThreshold`: Minimum token efficiency ratio (default: 0.3)

#### Quality Requirements
- `responseCompletenessThreshold`: Minimum response completeness (default: 0.8)
- `minResponseLength`: Minimum response length in characters (default: 50)
- `maxResponseLength`: Maximum response length in characters (default: 2000)

#### Scoring Weights
- `tokenWeight`: Weight for token score (default: 0.3)
- `costWeight`: Weight for cost score (default: 0.3)
- `performanceWeight`: Weight for performance score (default: 0.2)
- `qualityWeight`: Weight for quality score (default: 0.2)

### ConfigMap Integration

For complex configurations, use ConfigMap references:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: configmap-evaluator
spec:
  parameters:
    valueFrom:
      configMapRef:
        name: metrics-config
        includeAllKeys: true
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: metrics-config
data:
  maxTokens: "5000"
  maxDuration: "3m"
  maxCostPerQuery: "0.10"
  tokenWeight: "0.3"
  costWeight: "0.3"
  performanceWeight: "0.2"
  qualityWeight: "0.2"
```

## Development

### Quick Start

```bash
# From project root directory
make evaluator-metric-build    # Build Docker image
make evaluator-metric-test     # Run tests
make evaluator-metric-dev      # Run locally in development mode
```

### Complete Workflow

```bash
# From project root - all commands use the centralized build system
make evaluator-metric-deps     # Install dependencies (including ark-sdk)
make evaluator-metric-test     # Run test suite
make evaluator-metric-build    # Build Docker image
make evaluator-metric-install  # Deploy to Kubernetes cluster
```

### Local Development

```bash
# Install dependencies
make evaluator-metric-deps

# Run tests
make evaluator-metric-test

# Run locally with hot reload
make evaluator-metric-dev
```

### Update Deployment

```bash
# After making changes
make evaluator-metric-build    # Rebuild image
make evaluator-metric-install  # Update deployment
# OR manually:
kubectl rollout restart deployment evaluator-metric -n default
```

### Clean and Rebuild

```bash
make evaluator-metric-clean-stamps  # Remove stamps (forces rebuild)
make evaluator-metric-build         # Fresh build
```

## Build System

This service uses the centralized Makefile build system which provides:

- **Dynamic ark-sdk management**: Version controlled via `/version.txt`
- **Proper dependency tracking**: Rebuilds only when needed
- **Consistent tooling**: Same commands across all services
- **Docker integration**: Automated image building and pushing

The ark-sdk dependency is automatically resolved from the central build, eliminating manual version management. When the version changes in `version.txt`, all services automatically use the updated version.

## Examples

### Basic Evaluator

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: basic-metrics-evaluator
spec:
  description: "Basic performance metrics evaluator"
  address:
    value: http://evaluator-metric.default.svc.cluster.local:8000
  selector:
    resourceType: "Query"
    apiGroup: "ark.mckinsey.com"
    matchLabels:
      model: "gpt-4"
  parameters:
    - name: maxTokens
      value: "5000"
    - name: maxDuration
      value: "30s"
```

### Cost-Focused Evaluator

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: cost-evaluator
spec:
  description: "Cost optimization evaluator for expensive models"
  address:
    value: http://evaluator-metric.default.svc.cluster.local:8000
  selector:
    resourceType: "Query"
    apiGroup: "ark.mckinsey.com"
    matchExpressions:
      - key: model
        operator: In
        values: ["gpt-4", "gpt-4-turbo"]
  parameters:
    - name: maxCostPerQuery
      value: "0.10"
    - name: costEfficiencyThreshold
      value: "0.8"
    - name: costWeight
      value: "0.5"
    - name: tokenWeight
      value: "0.3"
    - name: performanceWeight
      value: "0.1"
    - name: qualityWeight
      value: "0.1"
```

### High-Performance Evaluator

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: high-performance-evaluator
spec:
  description: "Strict performance requirements for premium tier"
  address:
    value: http://evaluator-metric.default.svc.cluster.local:8000
  selector:
    resourceType: "Query"
    apiGroup: "ark.mckinsey.com"
    matchLabels:
      performance-tier: "premium"
  parameters:
    - name: maxDuration
      value: "10s"
    - name: minTokensPerSecond
      value: "20.0"
    - name: performanceWeight
      value: "0.4"
    - name: tokenWeight
      value: "0.2"
    - name: costWeight
      value: "0.2"
    - name: qualityWeight
      value: "0.2"
```


## Configuration

The service automatically receives evaluation parameters from the Ark Evaluator custom resource
it has a dependency on the ark python sdk to load model definition and other information about queries etc..

## Troubleshooting

### Common Issues

1. **Query not found**: Ensure the Query CRD exists and is accessible
2. **Permission denied**: Check RBAC permissions for the service account
3. **Invalid parameters**: Verify parameter names and values in the Evaluator CRD
4. **High evaluation latency**: Check network connectivity to Kubernetes API
