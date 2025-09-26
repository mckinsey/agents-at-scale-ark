# Configuration Guide

This guide covers all configuration options, parameters, and setup instructions for ARK Evaluator.

## Service Configuration

### Environment Variables

ARK Evaluator uses standard ARK environment configurations plus service-specific variables:

```bash
# ARK Integration
ARK_NAMESPACE=default
ARK_EVALUATOR_NAME=ark-evaluator

# Service Configuration  
PORT=8000
LOG_LEVEL=INFO
WORKERS=4

# Optional: Provider-specific environment variables
OPENAI_API_KEY=sk-...
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
```

### Kubernetes Deployment

ARK Evaluator is deployed as a standard Kubernetes service with ARK CRD integration:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: comprehensive-evaluator
  namespace: default
spec:
  description: "Comprehensive evaluation service with metrics and LLM capabilities"
  address:
    value: http://ark-evaluator.default.svc.cluster.local:8000
  selector:
    resourceType: "Query"
    apiGroup: "ark.mckinsey.com"
    matchLabels:
      evaluation: "enabled"
  parameters:
    # Default evaluation parameters
    - name: provider
      value: "ark"
    - name: threshold
      value: "0.8"
    - name: scope
      value: "all"
```

## Evaluation Parameters

### Common Parameters

These parameters apply to all evaluation types:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `threshold` | string | "0.7" | Minimum score for passing evaluation |
| `min_score` | string | "0.7" | Alternative name for threshold |
| `debug` | string | "false" | Enable debug logging |

### Deterministic Evaluation Parameters

#### Performance Thresholds

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `maxTokens` | string | "5000" | Maximum total tokens allowed | "1000", "2500" |
| `maxDuration` | string | "30s" | Maximum execution time | "10s", "2m", "1h" |
| `minTokensPerSecond` | string | "10.0" | Minimum throughput requirement | "15.0", "25.5" |

#### Cost Management

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `maxCostPerQuery` | string | "0.10" | Maximum cost per query (USD) | "0.05", "0.25" |
| `costEfficiencyThreshold` | string | "0.8" | Minimum cost efficiency score | "0.7", "0.9" |
| `tokenEfficiencyThreshold` | string | "0.3" | Minimum token efficiency ratio | "0.4", "0.6" |

#### Quality Requirements

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `responseCompletenessThreshold` | string | "0.8" | Minimum response completeness | "0.7", "0.9" |
| `minResponseLength` | string | "50" | Minimum response length (characters) | "100", "200" |
| `maxResponseLength` | string | "2000" | Maximum response length (characters) | "1500", "3000" |

#### Scoring Weights

Weights must sum to 1.0:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tokenWeight` | string | "0.3" | Weight for token score |
| `costWeight` | string | "0.3" | Weight for cost score |
| `performanceWeight` | string | "0.2" | Weight for performance score |
| `qualityWeight` | string | "0.2" | Weight for quality score |

**Example Configuration:**
```json
{
  "parameters": {
    "maxTokens": "2000",
    "maxDuration": "45s",
    "maxCostPerQuery": "0.08",
    "tokenWeight": "0.25",
    "costWeight": "0.25",
    "performanceWeight": "0.25",
    "qualityWeight": "0.25"
  }
}
```

### LLM-as-a-Judge Parameters

#### Provider Selection

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `provider` | string | "ark" | "ark", "ragas", "langfuse" | Evaluation provider to use |

#### Evaluation Scope

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `scope` | string | "all" | "all", specific metrics | Evaluation criteria to assess |

**Specific scope examples:**
- `"relevance,accuracy"` - Only relevance and accuracy
- `"all"` - All five criteria (relevance, accuracy, completeness, clarity, usefulness)
- `"relevance,accuracy,completeness,clarity,usefulness"` - Explicit all criteria

#### Model Behavior

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `temperature` | string | "0.1" | LLM temperature for consistency | "0.0", "0.2" |
| `max_tokens` | string | "500" | Maximum tokens for evaluation | "300", "800" |
| `seed` | string | null | Seed for reproducible results | "12345" |

#### Context Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `context` | string | null | Additional context for evaluation |
| `context_source` | string | null | Source identifier for the context |

**Example Configuration:**
```json
{
  "parameters": {
    "provider": "ark",
    "scope": "relevance,accuracy,clarity",
    "threshold": "0.8",
    "temperature": "0.1",
    "context": "Technical documentation context",
    "context_source": "tech_docs_kb"
  }
}
```

### RAGAS Provider Parameters

The RAGAS provider offers standalone RAGAS evaluation without external dependencies. Choose either Azure OpenAI or OpenAI configuration.

#### Azure OpenAI Configuration

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `azure.api_key` | string | Yes | Azure OpenAI API key | `"${AZURE_OPENAI_API_KEY}"` |
| `azure.endpoint` | string | Yes | Azure OpenAI endpoint URL | `"https://myinstance.openai.azure.com/"` |
| `azure.api_version` | string | Yes | Azure OpenAI API version | `"2024-02-01"` |
| `azure.deployment_name` | string | Yes | GPT model deployment name | `"gpt-4"` |
| `azure.embedding_deployment` | string | No | Embedding model deployment | `"text-embedding-ada-002"` |

#### OpenAI Configuration

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `openai.api_key` | string | Yes | OpenAI API key | `"${OPENAI_API_KEY}"` |
| `openai.base_url` | string | Yes | OpenAI API base URL | `"https://api.openai.com/v1"` |
| `openai.model` | string | No | GPT model name | `"gpt-4"` (default) |
| `openai.embedding_model` | string | No | Embedding model name | `"text-embedding-ada-002"` (default) |

#### Evaluation Configuration

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `metrics` | string | `"relevance,correctness"` | Comma-separated RAGAS metrics | `"relevance,correctness,faithfulness"` |
| `threshold` | string | `"0.7"` | Passing threshold (0.0-1.0) | `"0.8"` |
| `temperature` | string | `"0.1"` | Model temperature | `"0.0"` |

**Supported RAGAS Metrics:**
- `relevance` - How relevant the response is to the input
- `correctness` - Factual accuracy of the response
- `faithfulness` - How faithful the response is to provided context
- `similarity` - Semantic similarity between response and expected answer

#### Example Configuration

```yaml
parameters:
  provider: "ragas"

  # Azure OpenAI (choose one)
  azure.api_key: "${AZURE_OPENAI_API_KEY}"
  azure.endpoint: "${AZURE_OPENAI_ENDPOINT}"
  azure.api_version: "2024-02-01"
  azure.deployment_name: "gpt-4"

  # OR OpenAI (choose one)
  # openai.api_key: "${OPENAI_API_KEY}"
  # openai.base_url: "https://api.openai.com/v1"
  # openai.model: "gpt-4"

  # Evaluation settings
  metrics: "relevance,correctness,faithfulness"
  threshold: "0.8"
  temperature: "0.1"
```

### Langfuse Provider Parameters (Hybrid)

#### Required Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `langfuse.host` | string | Langfuse instance URL | "https://cloud.langfuse.com" |
| `langfuse.public_key` | string | Langfuse public key | "pk-lf-xxxxx" |
| `langfuse.secret_key` | string | Langfuse secret key | "sk-lf-xxxxx" |

#### Azure OpenAI Configuration

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `langfuse.azure_api_key` | string | Yes* | Azure OpenAI API key | "your-azure-key" |
| `langfuse.azure_endpoint` | string | Yes* | Azure OpenAI endpoint | "https://resource.openai.azure.com/" |
| `langfuse.azure_deployment` | string | Yes* | Azure deployment name | "gpt-4o" |
| `langfuse.model_version` | string | Yes* | Azure API version | "2024-02-01" |

*Required when using Azure OpenAI

#### Optional Azure Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `langfuse.azure_embedding_deployment` | string | "text-embedding-ada-002" | Embedding deployment name |
| `langfuse.azure_embedding_model` | string | "text-embedding-ada-002" | Embedding model name |
| `langfuse.model` | string | null | Model identifier for Langfuse |

#### RAGAS Configuration

| Parameter | Type | Default | Description | Options |
|-----------|------|---------|-------------|---------|
| `metrics` | string | "all" | RAGAS metrics to evaluate | See RAGAS metrics section |

**RAGAS Metrics Options:**
- `"all"` - All supported metrics
- `"relevance,correctness,faithfulness,similarity"` - Specific metrics
- Individual metrics: `"relevance"`, `"correctness"`, `"faithfulness"`, `"similarity"`, `"helpfulness"`, `"clarity"`

**Example Configuration:**
```json
{
  "parameters": {
    "provider": "langfuse",
    "langfuse.host": "https://cloud.langfuse.com",
    "langfuse.public_key": "pk-lf-xxxxx",
    "langfuse.secret_key": "sk-lf-xxxxx",
    "langfuse.azure_api_key": "your-azure-key",
    "langfuse.azure_endpoint": "https://your-resource.openai.azure.com/",
    "langfuse.azure_deployment": "gpt-4o",
    "langfuse.model_version": "2024-02-01",
    "metrics": "relevance,correctness,faithfulness",
    "threshold": "0.85"
  }
}
```

## Request Configuration

### Request Types

ARK Evaluator supports multiple evaluation request types:

#### Direct Evaluation
Evaluate a specific input/output pair:

```json
{
  "type": "direct",
  "config": {
    "input": "question or prompt",
    "output": "response to evaluate"
  }
}
```

#### Query Evaluation
Evaluate based on an existing ARK Query CRD:

```json
{
  "type": "query", 
  "config": {
    "queryRef": {
      "name": "query-name",
      "namespace": "query-namespace",
      "responseTarget": "agent:agent-name"  // For metrics evaluation
    }
  }
}
```

#### Batch Evaluation
Evaluate multiple items (planned feature):

```json
{
  "type": "batch",
  "config": {
    "items": [
      {"input": "...", "output": "..."},
      {"input": "...", "output": "..."}
    ]
  }
}
```

### Configuration Validation

ARK Evaluator validates all configuration parameters:

#### Required Fields
- **Direct evaluation**: `config.input` and `config.output`
- **Query evaluation**: `config.queryRef.name` and `config.queryRef.namespace`
- **Langfuse provider**: All Langfuse and Azure OpenAI parameters

#### Parameter Validation
- **Weights**: Must sum to 1.0 for deterministic evaluation
- **Thresholds**: Must be between 0.0 and 1.0
- **Duration**: Must be valid time format (e.g., "30s", "2m", "1h")
- **Numbers**: Must be valid numeric strings

#### Error Responses
Invalid configurations return detailed error messages:

```json
{
  "detail": "Validation error: tokenWeight + costWeight + performanceWeight + qualityWeight must equal 1.0"
}
```

## Best Practices

### Performance Optimization

1. **Choose Appropriate Thresholds**
   - Start with conservative values
   - Adjust based on historical data
   - Monitor threshold violation patterns

2. **Weight Configuration**
   - Align weights with business priorities  
   - Use equal weights (0.25 each) as baseline
   - Adjust based on use case importance

3. **Provider Selection**
   - Use ARK native for consistency
   - Use Langfuse for advanced analytics
   - Consider cost implications of different providers

### Security Configuration

1. **API Keys**
   - Store securely in Kubernetes secrets
   - Rotate keys regularly
   - Use separate keys for different environments

2. **Network Security**
   - Deploy within cluster networks
   - Use service mesh for additional security
   - Monitor API access patterns

3. **Data Privacy**
   - Configure data retention policies
   - Ensure compliance with data regulations
   - Use private endpoints where required

### Monitoring Configuration

1. **Logging**
   - Set appropriate log levels
   - Monitor evaluation success rates
   - Track performance metrics

2. **Alerting**
   - Configure alerts for evaluation failures
   - Monitor cost thresholds
   - Set up quality regression alerts

3. **Metrics Collection**
   - Use Prometheus metrics
   - Track evaluation latency
   - Monitor provider availability

### Environment-Specific Configuration

#### Development
```yaml
parameters:
  threshold: "0.6"          # Lower threshold for development
  debug: "true"             # Enable debug logging
  temperature: "0.2"        # Higher temperature for variety
```

#### Staging
```yaml
parameters:
  threshold: "0.75"         # Production-like threshold
  maxCostPerQuery: "0.15"   # Higher cost limit for testing
  debug: "false"            # Standard logging
```

#### Production
```yaml
parameters:
  threshold: "0.8"          # Strict threshold
  maxCostPerQuery: "0.05"   # Tight cost control
  temperature: "0.1"        # Consistent evaluation
  debug: "false"            # Standard logging
```

## Configuration Examples

### Complete Deterministic Evaluation
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: performance-evaluator
spec:
  address:
    value: http://ark-evaluator:8000/evaluate-metrics
  parameters:
    - name: maxTokens
      value: "2000"
    - name: maxDuration  
      value: "30s"
    - name: maxCostPerQuery
      value: "0.08"
    - name: tokenWeight
      value: "0.3"
    - name: costWeight
      value: "0.3" 
    - name: performanceWeight
      value: "0.2"
    - name: qualityWeight
      value: "0.2"
```

### Complete LLM Evaluation
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator  
metadata:
  name: quality-evaluator
spec:
  address:
    value: http://ark-evaluator:8000/evaluate
  parameters:
    - name: provider
      value: "ark"
    - name: scope
      value: "relevance,accuracy,completeness"
    - name: threshold
      value: "0.8"
    - name: temperature
      value: "0.1"
```

### Complete Langfuse Integration
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: langfuse-evaluator
spec:
  address:
    value: http://ark-evaluator:8000/evaluate
  parameters:
    - name: provider
      value: "langfuse"
    - name: langfuse.host
      value: "https://cloud.langfuse.com"
    - name: langfuse.public_key
      valueFrom:
        secretKeyRef:
          name: langfuse-credentials
          key: public_key
    - name: langfuse.secret_key
      valueFrom:
        secretKeyRef:
          name: langfuse-credentials
          key: secret_key
    - name: langfuse.azure_api_key
      valueFrom:
        secretKeyRef:
          name: azure-openai-credentials
          key: api_key
    - name: langfuse.azure_endpoint
      value: "https://your-resource.openai.azure.com/"
    - name: langfuse.azure_deployment
      value: "gpt-4o"
    - name: langfuse.model_version
      value: "2024-02-01"
    - name: metrics
      value: "relevance,correctness,faithfulness"
    - name: threshold
      value: "0.85"
```

## Troubleshooting Configuration Issues

### Common Configuration Errors

1. **Weight Sum Error**
   ```
   Error: tokenWeight + costWeight + performanceWeight + qualityWeight must equal 1.0
   Solution: Ensure all weights sum exactly to 1.0
   ```

2. **Missing Required Parameters**
   ```
   Error: Missing required Langfuse configuration: langfuse.host
   Solution: Provide all required Langfuse parameters
   ```

3. **Invalid Duration Format**
   ```
   Error: Invalid duration format: '30seconds'
   Solution: Use valid formats like '30s', '2m', '1h'
   ```

4. **Authentication Errors**
   ```
   Error: Azure OpenAI authentication failed
   Solution: Verify API key and endpoint are correct
   ```

### Configuration Validation

Test your configuration with the validation endpoint:

```bash
curl -X POST http://ark-evaluator:8000/validate-config \
  -H "Content-Type: application/json" \
  -d '{"parameters": {...}}'
```

### Debug Configuration

Enable debug mode to see detailed configuration parsing:

```json
{
  "parameters": {
    "debug": "true",
    "log_level": "DEBUG"
  }
}
```

This will provide detailed logs about parameter parsing, validation, and provider selection.