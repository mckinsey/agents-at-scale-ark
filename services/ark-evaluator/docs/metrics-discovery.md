# Metrics Discovery Guide

ARK Evaluator provides dynamic metric discovery APIs that allow you to programmatically explore available evaluation metrics and their requirements across different OSS evaluation providers.

## Overview

The metrics discovery system enables:
- **Dynamic Provider Discovery**: Find out which providers are available
- **Metric Enumeration**: List all metrics supported by each provider
- **Field Requirements**: Understand what input fields each metric needs
- **Integration Planning**: Build dynamic evaluation workflows

## API Endpoints

### List Provider Metrics

**Endpoint:** `GET /providers/{provider}/metrics`

Returns all supported metrics for a specific provider.

#### Example: RAGAS Metrics

```bash
curl http://ark-evaluator:8000/providers/ragas/metrics
```

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
      "name": "correctness",
      "description": "Evaluates factual accuracy of the response",
      "ragas_name": "answer_correctness"
    },
    {
      "name": "context_precision",
      "description": "Measures precision of retrieved context",
      "ragas_name": "llm_context_precision_without_reference"
    },
    {
      "name": "faithfulness",
      "description": "Measures factual consistency with given context",
      "ragas_name": "faithfulness"
    }
  ]
}
```

### Get Metric Details

**Endpoint:** `GET /providers/{provider}/metrics/{metric}`

Returns detailed field requirements for a specific metric.

#### Example: Relevance Metric Details

```bash
curl http://ark-evaluator:8000/providers/ragas/metrics/relevance
```

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

#### Example: Context Precision Details

```bash
curl http://ark-evaluator:8000/providers/ragas/metrics/context_precision
```

**Response:**
```json
{
  "provider": "ragas",
  "metric": {
    "name": "context_precision",
    "description": "Measures precision of retrieved context",
    "ragas_name": "llm_context_precision_without_reference",
    "required_fields": ["user_input", "response", "retrieved_contexts"],
    "optional_fields": [],
    "field_mappings": {
      "input_text": "user_input",
      "output_text": "response",
      "context": "retrieved_contexts"
    }
  }
}
```

## Supported Providers

### RAGAS Provider

**Provider ID:** `ragas`

The RAGAS provider supports evaluation metrics from the RAGAS (Retrieval-Augmented Generation Assessment) framework.

**Available Metrics:**
- `relevance` - Answer relevancy to the question
- `correctness` - Factual accuracy assessment
- `similarity` - Semantic similarity measurement
- `faithfulness` - Consistency with provided context
- `context_precision` - Precision of retrieved context
- `context_recall` - Recall of retrieved context

**Field Requirements:**
- **Basic metrics** (relevance, correctness, similarity): Require `user_input` and `response`
- **Context metrics** (context_precision, faithfulness): Additionally require `retrieved_contexts`
- **Ground truth metrics** (correctness): May optionally use `reference` field

### Langfuse Provider

**Provider ID:** `langfuse`

The Langfuse provider supports integration with Langfuse observability platform.

*Note: Specific metric details for Langfuse provider are under development.*

## Integration Patterns

### Dynamic Metric Selection

Use the discovery APIs to build dynamic evaluation workflows:

```python
import requests

# Discover available metrics
response = requests.get("http://ark-evaluator:8000/providers/ragas/metrics")
available_metrics = response.json()["metrics"]

# Select metrics based on available data
selected_metrics = []
for metric in available_metrics:
    metric_details = requests.get(
        f"http://ark-evaluator:8000/providers/ragas/metrics/{metric['name']}"
    ).json()["metric"]

    # Check if we have required fields
    if all(field in our_data for field in metric_details["required_fields"]):
        selected_metrics.append(metric["name"])

# Use selected metrics in evaluation
evaluation_request = {
    "type": "direct",
    "config": {
        "input": our_data["input"],
        "output": our_data["output"]
    },
    "parameters": {
        "provider": "ragas",
        "metrics": ",".join(selected_metrics)
    }
}
```

### Validation Workflows

Validate your data against metric requirements before evaluation:

```python
def validate_data_for_metrics(data, metrics):
    """Validate that data contains required fields for metrics."""
    validation_results = {}

    for metric in metrics:
        metric_details = requests.get(
            f"http://ark-evaluator:8000/providers/ragas/metrics/{metric}"
        ).json()["metric"]

        missing_fields = [
            field for field in metric_details["required_fields"]
            if field not in data
        ]

        validation_results[metric] = {
            "valid": len(missing_fields) == 0,
            "missing_fields": missing_fields
        }

    return validation_results
```

### Multi-Provider Evaluation

Compare metrics across different providers:

```python
providers = ["ragas", "langfuse"]
all_metrics = {}

for provider in providers:
    response = requests.get(f"http://ark-evaluator:8000/providers/{provider}/metrics")
    if response.status_code == 200:
        all_metrics[provider] = response.json()["metrics"]

# Find common metrics across providers
common_metrics = set(all_metrics["ragas"]).intersection(set(all_metrics["langfuse"]))
```

## Error Handling

### Provider Not Found

**Request:** `GET /providers/unknown/metrics`

**Response:** `404 Not Found`
```json
{
  "detail": "Provider unknown not found or doesn't support metric queries"
}
```

### Metric Not Found

**Request:** `GET /providers/ragas/metrics/unknown_metric`

**Response:** `404 Not Found`
```json
{
  "detail": "Metric unknown_metric not found for provider ragas"
}
```

## Best Practices

1. **Cache Discovery Results**: Metric definitions don't change frequently, cache the results
2. **Validate Before Evaluation**: Always check field requirements before submitting evaluation requests
3. **Handle Provider Availability**: Not all providers may be available in every deployment
4. **Graceful Degradation**: Fall back to basic metrics if advanced metrics aren't available
5. **Monitor API Health**: Check provider availability as part of your monitoring

## Future Enhancements

- Support for custom metric definitions
- Metric dependency graphs
- Performance characteristics per metric
- Cost estimates for metric evaluation
- Batch metric discovery operations