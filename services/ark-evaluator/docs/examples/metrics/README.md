# Evaluator-Metric Configuration Examples

This directory contains sample evaluator configurations for the evaluator-metric service, demonstrating different deployment patterns and use cases.

## Configuration Files

### Basic Configuration
- **`sample-evaluator.yaml`** - Basic evaluator with ConfigMap parameter reference
  - Uses selector to match queries with `model: gpt-4` label
  - Demonstrates ConfigMap integration with `includeAllKeys: true`

### Specialized Evaluators
- **`sample-cost-evaluator.yaml`** - Cost-focused evaluation
  - Targets expensive models (GPT-4, GPT-4 Turbo)
  - Includes cost efficiency thresholds and token limits
  - ConfigMap with model pricing data

- **`sample-performance-evaluator.yaml`** - Performance-focused evaluation  
  - Strict latency and duration requirements
  - Targets premium tier queries with SLA requirements
  - ConfigMap with tiered performance thresholds

### Environment-Specific

- **`production-evaluator.yaml`** - Production-ready configuration
  - Uses service reference instead of direct URL
  - Comprehensive metrics with production thresholds
  - Multi-tier support (standard, premium, enterprise)

- **`development-evaluator.yaml`** - Development environment
  - Relaxed thresholds for testing and experimentation
  - Higher token and cost limits
  - Detailed logging enabled

### Advanced Configurations

- **`multi-model-evaluator.yaml`** - Model-specific thresholds
  - Different evaluation criteria per model
  - Supports GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, Claude models
  - Comprehensive ConfigMap with per-model settings

- **`batch-evaluator.yaml`** - Batch evaluation support
  - Configuration for parent/child evaluation aggregation
  - Weighted scoring and batch processing parameters
  - Supports different parent pass strategies

## Key Configuration Patterns

### Address Configuration

**Direct URL (testing):**
```yaml
address:
  value: http://evaluator-metric.default.svc.cluster.local:8000
```

**Service Reference (production):**
```yaml
address:
  valueFrom:
    serviceRef:
      name: evaluator-metric
      port: "http" 
      path: "/evaluate/direct"
```

### Selector Patterns

**Label-based selection:**
```yaml
selector:
  resourceType: "Query"
  apiGroup: "ark.mckinsey.com"
  matchLabels:
    model: "gpt-4"
    environment: "production"
```

**Expression-based selection:**
```yaml
matchExpressions:
  - key: tier
    operator: In
    values: ["standard", "premium"]
  - key: metrics-enabled
    operator: Exists
```

### Parameter Configuration

**Inline parameters:**
```yaml
parameters:
  - name: maxTokens
    value: "5000"
  - name: maxDuration
    value: "30s"
```

**ConfigMap reference (all keys):**
```yaml
parameters:
  valueFrom:
    configMapRef:
      name: metrics-config
      includeAllKeys: true
```

## Deployment

Apply any configuration:
```bash
kubectl apply -f sample-evaluator.yaml
```

Verify evaluator is created:
```bash
kubectl get evaluators
kubectl describe evaluator evaluator-with-params-ref
```

## Testing

Use the test queries in `test-queries.yaml` to validate evaluator behavior:
```bash
kubectl apply -f test-queries.yaml
```

Monitor evaluation results:
```bash
kubectl get evaluations
kubectl logs -l app.kubernetes.io/name=evaluator-metric
```