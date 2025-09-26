# API Reference

ARK Evaluator provides two main evaluation endpoints for different evaluation approaches: deterministic metrics-based evaluation and LLM-based subjective evaluation.

## Base URL

```
http://ark-evaluator.default.svc.cluster.local:8000
```

## Authentication

ARK Evaluator uses the standard ARK authentication mechanism. Ensure your requests include proper ARK credentials when deployed in a secured environment.

## Common Headers

```
Content-Type: application/json
Accept: application/json
```

## Provider Metric Discovery Endpoints

ARK Evaluator provides APIs to discover supported metrics and their field requirements for different evaluation providers.

### GET /providers/{provider}/metrics

Returns all supported metrics for a specific provider.

**Path Parameters:**
- `provider` - Provider name (e.g., "ragas", "langfuse")

**Response:**
```json
{
  "provider": "ragas",
  "metrics": [
    {
      "name": "relevance",
      "description": "Measures how relevant the answer is to the question",
      "ragas_name": "answer_relevancy"
    },
    {
      "name": "context_precision",
      "description": "Measures precision of retrieved context",
      "ragas_name": "llm_context_precision_without_reference"
    }
  ]
}
```

### GET /providers/{provider}/metrics/{metric}

Returns detailed field requirements for a specific metric.

**Path Parameters:**
- `provider` - Provider name (e.g., "ragas")
- `metric` - Metric name (e.g., "relevance", "context_precision")

**Response:**
```json
{
  "provider": "ragas",
  "metric": {
    "name": "relevance",
    "description": "Measures how relevant the answer is to the question",
    "ragas_name": "answer_relevancy",
    "required_fields": ["user_input", "response"],
    "optional_fields": [],
    "field_mappings": {
      "input_text": "user_input",
      "output_text": "response"
    }
  }
}
```

**Error Responses:**
- `404` - Provider or metric not found
- `500` - Internal server error

## Health Check Endpoints

### GET /health
Returns the service health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "ark-evaluator"
}
```

### GET /ready
Returns the service readiness status.

**Response:**
```json
{
  "status": "ready",
  "service": "ark-evaluator"
}
```

## Evaluation Endpoints

### POST /evaluate

LLM-as-a-Judge evaluation endpoint for subjective quality assessment.

#### Request Schema

```json
{
  "type": "direct" | "query" | "baseline" | "batch" | "event",
  "evaluatorName": "string (optional)",
  "config": {
    // Configuration varies by type - see below
  },
  "parameters": {
    // Optional parameters for evaluation behavior
  }
}
```

#### Direct Evaluation Request

```json
{
  "type": "direct",
  "evaluatorName": "quality-evaluator",
  "config": {
    "input": "string - the input/question to evaluate",
    "output": "string - the response to evaluate"
  },
  "parameters": {
    "provider": "ark | ragas | langfuse",
    "scope": "all | relevance,accuracy,completeness,clarity,usefulness",
    "threshold": "0.7",
    "min_score": "0.7",
    "temperature": "0.1",
    "max_tokens": "500",
    "context": "string - additional context for evaluation",
    "context_source": "string - source of the context"
  }
}
```

#### Query Evaluation Request

```json
{
  "type": "query",
  "evaluatorName": "agent-evaluator",
  "config": {
    "queryRef": {
      "name": "string - query name",
      "namespace": "string - query namespace"
    }
  },
  "parameters": {
    "provider": "ark | ragas | langfuse",
    "scope": "all | specific metrics",
    "threshold": "0.7"
  }
}
```

#### RAGAS Provider Parameters

For `provider: "ragas"`, choose either Azure OpenAI or OpenAI configuration:

**Azure OpenAI Configuration:**
```json
{
  "parameters": {
    "provider": "ragas",

    // Azure OpenAI Configuration (required)
    "azure.api_key": "${AZURE_OPENAI_API_KEY}",
    "azure.endpoint": "${AZURE_OPENAI_ENDPOINT}",
    "azure.api_version": "2024-02-01",
    "azure.deployment_name": "gpt-4",
    "azure.embedding_deployment": "text-embedding-ada-002",

    // Evaluation Configuration
    "metrics": "relevance,correctness,faithfulness",
    "threshold": "0.8",
    "temperature": "0.1"
  }
}
```

**OpenAI Configuration:**
```json
{
  "parameters": {
    "provider": "ragas",

    // OpenAI Configuration (required)
    "openai.api_key": "${OPENAI_API_KEY}",
    "openai.base_url": "https://api.openai.com/v1",
    "openai.model": "gpt-4",
    "openai.embedding_model": "text-embedding-ada-002",

    // Evaluation Configuration
    "metrics": "relevance,correctness",
    "threshold": "0.7",
    "temperature": "0.0"
  }
}
```

#### Langfuse Provider Parameters (Hybrid)

For `provider: "langfuse"`, additional parameters are required:

```json
{
  "parameters": {
    "provider": "langfuse",
    "langfuse.host": "https://cloud.langfuse.com",
    "langfuse.public_key": "pk-lf-xxxxx",
    "langfuse.secret_key": "sk-lf-xxxxx",
    
    // Azure OpenAI Configuration
    "langfuse.azure_api_key": "string",
    "langfuse.azure_endpoint": "https://resource.openai.azure.com/",
    "langfuse.azure_deployment": "gpt-4o",
    "langfuse.model_version": "2024-02-01",
    
    // Optional Azure Parameters
    "langfuse.azure_embedding_deployment": "text-embedding-ada-002",
    "langfuse.azure_embedding_model": "text-embedding-ada-002",
    "langfuse.model": "gpt-4o",
    
    // Evaluation Configuration
    "metrics": "relevance,correctness,faithfulness,similarity",
    "threshold": "0.8"
  }
}
```

#### Response Schema

```json
{
  "score": "string - overall score (0.0-1.0)",
  "passed": "boolean - whether evaluation passed threshold",
  "metadata": {
    "provider": "string - evaluation provider used",
    "model": "string - model used for evaluation",
    "evaluation_criteria": {
      "relevance": "number (0.0-1.0)",
      "accuracy": "number (0.0-1.0)",
      "completeness": "number (0.0-1.0)",
      "clarity": "number (0.0-1.0)",
      "usefulness": "number (0.0-1.0)"
    },
    "reasoning": "string - explanation of the evaluation",
    "threshold": "string - threshold used",
    "trace_id": "string - Langfuse trace ID (if using Langfuse)",
    "trace_url": "string - Langfuse trace URL (if using Langfuse)"
  },
  "error": "string | null - error message if evaluation failed",
  "tokenUsage": {
    "promptTokens": "number",
    "completionTokens": "number", 
    "totalTokens": "number"
  }
}
```

### POST /evaluate-metrics

Deterministic metrics-based evaluation endpoint for objective performance assessment.

#### Request Schema

```json
{
  "type": "direct" | "query",
  "config": {
    // Configuration varies by type - see below
  },
  "parameters": {
    // Threshold and weight parameters
  }
}
```

#### Direct Metrics Evaluation Request

```json
{
  "type": "direct",
  "config": {
    "input": "string - the input/question",
    "output": "string - the response to evaluate"
  },
  "parameters": {
    // Performance Thresholds
    "maxTokens": "1000",
    "maxDuration": "30s",
    "minTokensPerSecond": "10.0",
    
    // Cost Management
    "maxCostPerQuery": "0.05",
    "costEfficiencyThreshold": "0.8",
    "tokenEfficiencyThreshold": "0.3",
    
    // Quality Requirements
    "responseCompletenessThreshold": "0.8",
    "minResponseLength": "50",
    "maxResponseLength": "2000",
    
    // Scoring Weights (must sum to 1.0)
    "tokenWeight": "0.3",
    "costWeight": "0.3",
    "performanceWeight": "0.2",
    "qualityWeight": "0.2"
  }
}
```

#### Query Metrics Evaluation Request

```json
{
  "type": "query",
  "config": {
    "queryRef": {
      "name": "string - query name",
      "namespace": "string - query namespace",
      "responseTarget": "agent:agent-name"
    }
  },
  "parameters": {
    // Same parameters as direct evaluation
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

#### Response Schema

```json
{
  "score": "string - overall weighted score (0.0-1.0)",
  "passed": "boolean - whether all thresholds were met",
  "metadata": {
    "reasoning": "string - explanation of the evaluation",
    "evaluation_type": "deterministic_metrics",
    "total_tokens": "number - total tokens used",
    "execution_time": "string - time taken for execution",
    "cost": "string - cost incurred",
    "token_score": "string - token efficiency score",
    "cost_score": "string - cost efficiency score", 
    "performance_score": "string - performance score",
    "quality_score": "string - quality score",
    "threshold_violations": ["string array - failed thresholds"],
    "passed_thresholds": ["string array - passed thresholds"]
  },
  "error": "string | null - error message if evaluation failed",
  "tokenUsage": {
    "promptTokens": "number",
    "completionTokens": "number",
    "totalTokens": "number"
  }
}
```

## Parameter Reference

### Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `threshold` | string | "0.7" | Minimum score for passing evaluation |
| `min_score` | string | "0.7" | Alternative name for threshold |

### LLM Evaluation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | "ark" | Evaluation provider (ark, ragas, langfuse) |
| `scope` | string | "all" | Evaluation criteria to assess |
| `temperature` | string | "0.1" | LLM temperature for consistency |
| `max_tokens` | string | "500" | Maximum tokens for evaluation |
| `context` | string | null | Additional context for evaluation |
| `context_source` | string | null | Source of the provided context |

### RAGAS Parameters

#### Azure OpenAI Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `azure.api_key` | string | Yes | Azure OpenAI API key |
| `azure.endpoint` | string | Yes | Azure OpenAI endpoint URL |
| `azure.api_version` | string | Yes | Azure OpenAI API version |
| `azure.deployment_name` | string | Yes | GPT model deployment name |
| `azure.embedding_deployment` | string | No | Embedding model deployment |

#### OpenAI Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `openai.api_key` | string | Yes | OpenAI API key |
| `openai.base_url` | string | Yes | OpenAI API base URL |
| `openai.model` | string | No | GPT model name (default: "gpt-4") |
| `openai.embedding_model` | string | No | Embedding model (default: "text-embedding-ada-002") |

#### RAGAS Evaluation Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `metrics` | string | "relevance,correctness" | Comma-separated RAGAS metrics |
| `threshold` | string | "0.7" | Passing threshold (0.0-1.0) |
| `temperature` | string | "0.1" | Model temperature |

### Langfuse Parameters (Hybrid)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `langfuse.host` | string | Yes | Langfuse instance URL |
| `langfuse.public_key` | string | Yes | Langfuse public key |
| `langfuse.secret_key` | string | Yes | Langfuse secret key |
| `langfuse.azure_api_key` | string | Yes* | Azure OpenAI API key |
| `langfuse.azure_endpoint` | string | Yes* | Azure OpenAI endpoint |
| `langfuse.azure_deployment` | string | Yes* | Azure deployment name |
| `langfuse.model_version` | string | Yes* | Azure API version |
| `langfuse.azure_embedding_deployment` | string | No | Embedding deployment name |
| `langfuse.azure_embedding_model` | string | No | Embedding model name |
| `langfuse.model` | string | No | Model identifier |
| `metrics` | string | No | RAGAS metrics to evaluate |

*Required when using Azure OpenAI

### Metrics Evaluation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxTokens` | string | "5000" | Maximum allowed tokens |
| `maxDuration` | string | "30s" | Maximum execution time |
| `maxCostPerQuery` | string | "0.10" | Maximum cost per query (USD) |
| `minTokensPerSecond` | string | "10.0" | Minimum throughput |
| `tokenEfficiencyThreshold` | string | "0.3" | Minimum token efficiency |
| `costEfficiencyThreshold` | string | "0.8" | Minimum cost efficiency |
| `responseCompletenessThreshold` | string | "0.8" | Minimum response completeness |
| `minResponseLength` | string | "50" | Minimum response length |
| `maxResponseLength` | string | "2000" | Maximum response length |
| `tokenWeight` | string | "0.3" | Weight for token score |
| `costWeight` | string | "0.3" | Weight for cost score |
| `performanceWeight` | string | "0.2" | Weight for performance score |
| `qualityWeight` | string | "0.2" | Weight for quality score |

## Error Responses

### Standard Error Response

```json
{
  "detail": "string - error description"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource not found |
| 422 | Validation Error - Invalid request format |
| 500 | Internal Server Error - Service error |
| 501 | Not Implemented - Feature not available |

### Error Examples

#### Missing Required Parameters
```json
{
  "detail": "Direct evaluation requires input and output in config"
}
```

#### Invalid Provider
```json
{
  "detail": "No provider registered for evaluation type 'invalid_provider'. Available types: ['ark', 'ragas', 'langfuse']"
}
```

#### Langfuse Configuration Error
```json
{
  "detail": "Missing required Langfuse configuration: langfuse.host, langfuse.public_key"
}
```

#### Azure OpenAI Authentication Error
```json
{
  "detail": "Azure OpenAI authentication failed: Invalid API key"
}
```

## Rate Limits

Rate limiting depends on the underlying LLM providers and Langfuse instance configuration. Consider:

- Azure OpenAI: Tokens per minute (TPM) and requests per minute (RPM) limits
- Langfuse: API rate limits based on your plan
- Local processing: Limited by compute resources

## SDKs and Client Libraries

### Python
```python
import requests

response = requests.post(
    "http://ark-evaluator.default.svc.cluster.local:8000/evaluate",
    json={
        "type": "direct",
        "config": {
            "input": "What is machine learning?",
            "output": "Machine learning is a subset of AI..."
        },
        "parameters": {
            "provider": "ark",
            "scope": "all",
            "threshold": "0.8"
        }
    }
)

result = response.json()
print(f"Score: {result['score']}, Passed: {result['passed']}")
```

### JavaScript
```javascript
const response = await fetch('http://ark-evaluator.default.svc.cluster.local:8000/evaluate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'direct',
    config: {
      input: 'What is machine learning?',
      output: 'Machine learning is a subset of AI...'
    },
    parameters: {
      provider: 'ark',
      scope: 'all',
      threshold: '0.8'
    }
  })
});

const result = await response.json();
console.log(`Score: ${result.score}, Passed: ${result.passed}`);
```

### cURL
```bash
curl -X POST \
  http://ark-evaluator.default.svc.cluster.local:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "direct",
    "config": {
      "input": "What is machine learning?",
      "output": "Machine learning is a subset of AI that enables computers to learn and improve from experience without being explicitly programmed."
    },
    "parameters": {
      "provider": "ark",
      "scope": "all",
      "threshold": "0.8"
    }
  }'
```