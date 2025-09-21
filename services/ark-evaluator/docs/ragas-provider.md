# RAGAS Provider

**Standalone RAGAS evaluation without external dependencies**

The RAGAS Provider offers direct integration with the RAGAS evaluation framework, providing high-performance LLM evaluation without requiring additional tracing or observability services.

## Overview

RAGAS (Retrieval Augmented Generation Assessment) is a framework for evaluating retrieval augmented generation (RAG) pipelines. Our standalone provider gives you:

- **Pure RAGAS evaluation** with all core metrics
- **High performance** without tracing overhead
- **Dual provider support** for Azure OpenAI and OpenAI
- **Simple configuration** with minimal parameters
- **Production ready** with comprehensive error handling

## Quick Start

### Basic Azure OpenAI Configuration

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: ragas-evaluation-azure
spec:
  type: direct
  config:
    input: "What are the benefits of renewable energy?"
    output: "Renewable energy offers environmental and economic benefits..."
    context: "Renewable energy includes solar, wind, and hydroelectric power."
  evaluators:
    - name: ragas-evaluator
      type: direct
      parameters:
        provider: "ragas"

        # Azure OpenAI Configuration
        azure.api_key: "${AZURE_OPENAI_API_KEY}"
        azure.endpoint: "${AZURE_OPENAI_ENDPOINT}"
        azure.api_version: "2024-02-01"
        azure.deployment_name: "gpt-4"
        azure.embedding_deployment: "text-embedding-ada-002"

        # Evaluation Configuration
        metrics: "relevance,correctness,faithfulness"
        threshold: "0.8"
        temperature: "0.1"
```

### Basic OpenAI Configuration

```yaml
parameters:
  provider: "ragas"

  # OpenAI Configuration
  openai.api_key: "${OPENAI_API_KEY}"
  openai.base_url: "https://api.openai.com/v1"
  openai.model: "gpt-4"
  openai.embedding_model: "text-embedding-ada-002"

  # Evaluation Configuration
  metrics: "relevance,correctness"
  threshold: "0.7"
  temperature: "0.0"
```

## Supported Metrics

The RAGAS provider supports all standard RAGAS metrics:

| Metric | Description | Use Case |
|--------|-------------|----------|
| **relevance** | How relevant the response is to the input query | General quality assessment |
| **correctness** | Factual accuracy of the response | Knowledge validation |
| **faithfulness** | How faithful the response is to the provided context | RAG pipeline evaluation |
| **similarity** | Semantic similarity between response and expected answer | Consistency testing |

### Metric Configuration

Specify metrics as a comma-separated string:

```yaml
metrics: "relevance,correctness,faithfulness"  # Multiple metrics
metrics: "relevance"                           # Single metric
metrics: "all"                                 # All available metrics
```

## Provider Configuration

### Azure OpenAI Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `azure.api_key` | ✅ | Azure OpenAI API key | `"${AZURE_OPENAI_API_KEY}"` |
| `azure.endpoint` | ✅ | Azure OpenAI endpoint URL | `"https://myinstance.openai.azure.com/"` |
| `azure.api_version` | ✅ | Azure OpenAI API version | `"2024-02-01"` |
| `azure.deployment_name` | ✅ | GPT model deployment name | `"gpt-4"` |
| `azure.embedding_deployment` | ⚪ | Embedding model deployment | `"text-embedding-ada-002"` |

### OpenAI Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `openai.api_key` | ✅ | OpenAI API key | `"${OPENAI_API_KEY}"` |
| `openai.base_url` | ✅ | OpenAI API base URL | `"https://api.openai.com/v1"` |
| `openai.model` | ⚪ | GPT model name | `"gpt-4"` (default) |
| `openai.embedding_model` | ⚪ | Embedding model name | `"text-embedding-ada-002"` (default) |

### Evaluation Parameters

| Parameter | Required | Description | Default |
|-----------|----------|-------------|---------|
| `provider` | ✅ | Must be `"ragas"` | - |
| `metrics` | ⚪ | Comma-separated metrics | `"relevance,correctness"` |
| `threshold` | ⚪ | Passing threshold (0.0-1.0) | `"0.7"` |
| `temperature` | ⚪ | Model temperature | `"0.1"` |

## API Usage

### REST API Request

```bash
curl -X POST http://ark-evaluator:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "direct",
    "config": {
      "input": "What is machine learning?",
      "output": "Machine learning is a subset of artificial intelligence...",
      "context": "AI and ML are transformative technologies..."
    },
    "parameters": {
      "provider": "ragas",
      "azure.api_key": "your-azure-key",
      "azure.endpoint": "https://your-instance.openai.azure.com/",
      "azure.api_version": "2024-02-01",
      "azure.deployment_name": "gpt-4",
      "metrics": "relevance,correctness,faithfulness",
      "threshold": "0.8"
    }
  }'
```

### Response Format

```json
{
  "score": "0.85",
  "passed": true,
  "metadata": {
    "provider": "ragas",
    "metrics_evaluated": "relevance,correctness,faithfulness",
    "scores": "{'relevance': 0.87, 'correctness': 0.85, 'faithfulness': 0.83}",
    "average_score": "0.85",
    "execution_time_seconds": "2.34",
    "model_provider": "azure_openai",
    "model_model": "gpt-4"
  },
  "tokenUsage": {
    "promptTokens": 150,
    "completionTokens": 50,
    "totalTokens": 200
  }
}
```

## Error Handling

The RAGAS provider includes comprehensive error handling:

### Missing Dependencies

```json
{
  "score": "0.0",
  "passed": false,
  "error": "ragas library is not installed. Please install it with: pip install ragas datasets",
  "metadata": {
    "provider": "ragas",
    "error_type": "import_error"
  }
}
```

### Configuration Errors

```json
{
  "score": "0.0",
  "passed": false,
  "error": "Missing required parameters for RAGAS evaluation",
  "metadata": {
    "provider": "ragas",
    "required_azure": "azure.api_key,azure.endpoint,azure.api_version",
    "required_openai": "openai.api_key,openai.base_url",
    "provided": "provider"
  }
}
```

### Evaluation Failures

```json
{
  "score": "0.0",
  "passed": false,
  "error": "RAGAS evaluation failed: Invalid model configuration",
  "metadata": {
    "provider": "ragas",
    "execution_time_seconds": "0.15"
  }
}
```

## Performance Characteristics

### Benchmarks

- **Evaluation Time**: 1-5 seconds per evaluation (depending on model and metrics)
- **Memory Usage**: ~100MB baseline + model-dependent overhead
- **Throughput**: 10-20 evaluations/minute (with proper rate limiting)

### Optimization Tips

1. **Reduce metrics**: Use only necessary metrics for faster evaluation
2. **Optimize temperature**: Lower temperature (0.0-0.1) for consistent results
3. **Batch evaluations**: Process multiple evaluations in parallel when possible
4. **Model selection**: GPT-3.5-turbo for faster evaluation, GPT-4 for higher accuracy

## Comparison with Langfuse Provider

| Feature | RAGAS Provider | Langfuse Provider |
|---------|---------------|-------------------|
| **Performance** | ⚡ Fast (no tracing overhead) | 🐌 Slower (includes tracing) |
| **Dependencies** | 📦 RAGAS only | 📦📦 RAGAS + Langfuse |
| **Observability** | ❌ None | ✅ Full tracing |
| **Complexity** | 🟢 Simple | 🟡 Medium |
| **Use Case** | Production evaluation | Development & debugging |

## When to Use RAGAS Provider

### ✅ **Choose RAGAS Provider When:**
- You need **high-performance evaluation** without tracing overhead
- You want **simple, minimal configuration**
- You're running **batch evaluations** or high-throughput scenarios
- You don't need observability/tracing features
- You want to **minimize dependencies**

### ❌ **Choose Langfuse Provider When:**
- You need **comprehensive tracing** and observability
- You want to **debug evaluation pipelines**
- You're doing **research and development**
- You need **detailed evaluation logs**

## Troubleshooting

### Common Issues

#### 1. "Missing required parameters" Error

**Problem**: Provider validation fails
**Solution**: Ensure all required parameters are provided for your chosen provider (Azure or OpenAI)

```yaml
# Azure OpenAI - all required
azure.api_key: "your-key"
azure.endpoint: "your-endpoint"
azure.api_version: "2024-02-01"

# OR OpenAI - all required
openai.api_key: "your-key"
openai.base_url: "https://api.openai.com/v1"
```

#### 2. "RAGAS library not installed" Error

**Problem**: RAGAS dependencies missing
**Solution**: Install RAGAS in your environment

```bash
pip install ragas datasets
```

#### 3. Model Authentication Errors

**Problem**: Invalid API keys or endpoints
**Solution**: Verify your credentials and endpoints

```bash
# Test Azure OpenAI connection
curl -H "api-key: $AZURE_OPENAI_API_KEY" \
  "$AZURE_OPENAI_ENDPOINT/openai/models?api-version=2024-02-01"

# Test OpenAI connection
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  "https://api.openai.com/v1/models"
```

#### 4. Evaluation Timeouts

**Problem**: Evaluations taking too long
**Solution**: Optimize configuration or increase timeouts

```yaml
# Faster evaluation settings
temperature: "0.0"           # Reduces randomness
metrics: "relevance"         # Single metric only
openai.model: "gpt-3.5-turbo" # Faster model
```

## Examples

### Example Configurations

See [examples/oss-evaluators-config/ragas/](../examples/oss-evaluators-config/ragas/) for complete configuration examples.

### Integration Examples

```python
# Programmatic usage
from evaluator.core.manager import EvaluationManager
from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

manager = EvaluationManager()

request = UnifiedEvaluationRequest(
    type=EvaluationType.DIRECT,
    config=EvaluationConfig(
        input="What is the capital of France?",
        output="The capital of France is Paris.",
        context="France is a country in Western Europe."
    ),
    parameters={
        "provider": "ragas",
        "azure.api_key": "your-key",
        "azure.endpoint": "your-endpoint",
        "azure.api_version": "2024-02-01",
        "azure.deployment_name": "gpt-4",
        "metrics": "relevance,correctness,faithfulness",
        "threshold": "0.8"
    }
)

response = await manager.evaluate(request)
print(f"Score: {response.score}, Passed: {response.passed}")
```

## Migration from Langfuse Provider

To migrate from Langfuse provider to standalone RAGAS:

### Before (Langfuse + RAGAS)
```yaml
parameters:
  provider: "langfuse"
  langfuse.host: "https://cloud.langfuse.com"
  langfuse.public_key: "your-public-key"
  langfuse.secret_key: "your-secret-key"
  metrics: "relevance,correctness"
```

### After (Standalone RAGAS)
```yaml
parameters:
  provider: "ragas"          # Changed provider
  # Remove Langfuse parameters
  # Add model provider parameters
  azure.api_key: "your-azure-key"
  azure.endpoint: "your-endpoint"
  azure.api_version: "2024-02-01"
  azure.deployment_name: "gpt-4"
  metrics: "relevance,correctness"  # Same metrics
```

### Benefits of Migration
- ⚡ **50-70% faster evaluation** (no tracing overhead)
- 📦 **Simpler dependencies** (no Langfuse client required)
- 🔧 **Easier configuration** (fewer parameters)
- 💰 **Cost reduction** (no Langfuse service costs)

---

**Next Steps:**
- Try the [example configurations](../examples/oss-evaluators-config/ragas/)
- Read the [Configuration Guide](configuration.md) for advanced parameters
- Check the [API Reference](api-reference.md) for complete endpoint documentation