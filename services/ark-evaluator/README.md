# ARK Evaluator

Unified AI evaluation service supporting both deterministic metrics assessment and LLM-as-a-Judge evaluation with comprehensive integration capabilities.

## Overview

ARK Evaluator provides two complementary evaluation approaches:

### 🎯 **Deterministic Evaluation** (`/evaluate-metrics`)
Objective, metrics-based assessment for measurable performance criteria:
- **Token efficiency** and usage optimization
- **Cost analysis** and budget compliance  
- **Performance metrics** (latency, throughput)
- **Quality thresholds** (completeness, response length)

### 🧠 **LLM-as-a-Judge Evaluation** (`/evaluate`)
Intelligent, model-based assessment for subjective quality criteria:
- **Relevance** and accuracy scoring
- **Completeness** and clarity assessment
- **Multiple LLM providers** (OpenAI, Azure OpenAI, Claude, Gemini)
- **Advanced integrations** (Langfuse + RAGAS with Azure OpenAI)

## Quick Start

### Build & Deploy
```bash
# From project root
make ark-evaluator-deps     # Install dependencies (including ark-sdk)
make ark-evaluator-build    # Build Docker image  
make ark-evaluator-install  # Deploy to cluster
```

### Development
```bash
make ark-evaluator-dev      # Run service locally
make ark-evaluator-test     # Run tests
```

### Basic Usage

**Deterministic Metrics Evaluation:**
```bash
curl -X POST http://ark-evaluator:8000/evaluate-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "type": "direct",
    "config": {
      "input": "What is machine learning?",
      "output": "Machine learning is a subset of AI..."
    },
    "parameters": {
      "maxTokens": "1000",
      "maxCostPerQuery": "0.05",
      "tokenWeight": "0.3"
    }
  }'
```

**LLM-as-a-Judge Evaluation:**
```bash
curl -X POST http://ark-evaluator:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "direct",
    "config": {
      "input": "Explain renewable energy benefits",
      "output": "Renewable energy offers cost savings..."
    },
    "parameters": {
      "provider": "ark",
      "scope": "relevance,accuracy,clarity",
      "threshold": "0.8"
    }
  }'
```

## Architecture

ARK Evaluator consolidates evaluation capabilities from multiple sources:

- **ARK Native**: Default LLM-as-a-Judge with configurable providers
- **Metrics Engine**: Deterministic evaluation from integrated evaluator-metric service
- **RAGAS Provider**: Standalone RAGAS evaluation with Azure OpenAI/OpenAI support
- **Langfuse Provider**: Hybrid RAGAS evaluation with Langfuse tracing and observability
- **OSS Integrations**: Extensible framework for additional evaluation platforms

## Documentation

### 📋 **Core Evaluation Types**
- **[Deterministic Evaluation](docs/deterministic-evaluation.md)** - Metrics-based assessment with objective scoring
- **[LLM-as-a-Judge](docs/llm-as-judge.md)** - Model-based subjective evaluation across multiple providers

### 🔧 **OSS Evaluation Providers**
- **[RAGAS Provider](docs/ragas-provider.md)** - Standalone RAGAS evaluation without dependencies
- **[Langfuse Integration](docs/langfuse-integration.md)** - Hybrid RAGAS evaluation with Langfuse tracing

### 📖 **Reference Documentation**
- **[API Reference](docs/api-reference.md)** - Complete endpoint documentation with examples
- **[Configuration Guide](docs/configuration.md)** - Parameter reference and setup instructions
- **[Examples](docs/examples/)** - Sample requests and configurations

### 🚀 **Development & Roadmap**
- **[Roadmap](docs/roadmap.md)** - Planned features and timeline

## Evaluation Capabilities

### Deterministic Metrics (via `/evaluate-metrics`)

Objective performance assessment across three key dimensions:

| Dimension | Metrics | Use Cases |
|-----------|---------|-----------|
| **Token Score** | Efficiency, limits, throughput | Cost optimization, resource planning |
| **Cost Score** | Per-query cost, efficiency ratios | Budget management, ROI analysis |
| **Performance Score** | Latency, response time, throughput | SLA compliance, optimization |

### LLM-as-a-Judge (via `/evaluate`)

Intelligent quality assessment using advanced language models:

| Criteria | Description | Models Supported |
|----------|-------------|------------------|
| **Relevance** | How well response addresses the query | GPT-4o, Claude-3.5, Gemini Pro |
| **Accuracy** | Factual correctness and reliability | All supported LLM providers |
| **Completeness** | Comprehensiveness of information | Custom scoring thresholds |
| **Clarity** | Readability and communication effectiveness | Multi-provider consensus |
| **Usefulness** | Practical value and actionability | Domain-specific evaluation |

### Supported LLM Providers

#### ✅ **Currently Available**
- **Azure OpenAI**: GPT-4o, GPT-4-turbo, GPT-3.5-turbo with enterprise features
- **ARK Native**: Configurable model endpoints with unified interface

#### 🔄 **In Development** ([Roadmap](docs/roadmap.md))
- **OpenAI**: Direct API integration
- **Anthropic Claude**: Claude-3.5-Sonnet, Claude-3-Opus
- **Google Gemini**: Gemini Pro, Gemini Flash  
- **Ollama**: Local model deployment

### Provider Metric Discovery APIs

ARK Evaluator includes APIs to dynamically discover supported metrics and their requirements:

#### **GET /providers/{provider}/metrics**
List all supported metrics for a provider with descriptions:
```bash
curl http://ark-evaluator:8000/providers/ragas/metrics
```

#### **GET /providers/{provider}/metrics/{metric}**
Get detailed field requirements for specific metrics:
```bash
curl http://ark-evaluator:8000/providers/ragas/metrics/relevance
```

**Supported Providers:**
- `ragas` - RAGAS evaluation metrics (relevance, context_precision, etc.)
- `langfuse` - Langfuse integration capabilities

### Advanced Evaluation Frameworks

#### ✅ **Standalone RAGAS Provider**
Direct RAGAS evaluation without external dependencies:
- **Pure RAGAS**: Relevancy, correctness, faithfulness, similarity metrics
- **Dual Provider Support**: Azure OpenAI and OpenAI configurations
- **High Performance**: Optimized evaluation without tracing overhead
- **Simple Configuration**: Minimal parameters for quick setup

#### ✅ **Langfuse + RAGAS Hybrid**
Comprehensive evaluation with tracing and advanced metrics:
- **RAGAS Evaluation**: All RAGAS metrics with full evaluation capabilities
- **Langfuse Tracing**: Complete evaluation lineage and observability
- **Azure OpenAI**: Full integration with embeddings and LLM evaluation
- **UV Loop Compatibility**: Thread-safe execution for complex environments

#### 🔄 **Planned Integrations** ([Roadmap](docs/roadmap.md))
- **Opik**: Comet's evaluation platform
- **DeepEval**: Comprehensive evaluation framework  
- **UpTrain**: Data and model evaluation platform
- **Custom Evaluators**: Pluggable evaluation framework

## Configuration

### Environment Integration
ARK Evaluator integrates seamlessly with ARK's configuration system:
- **Model Configuration**: Automatic inheritance from ARK Evaluator resources
- **Provider Abstraction**: Unified interface across all evaluation methods
- **Resource Management**: Leverages ARK's scheduling and resource management

### Parameter Examples

**Deterministic Evaluation:**
```yaml
parameters:
  maxTokens: "2000"
  maxDuration: "30s" 
  maxCostPerQuery: "0.08"
  tokenWeight: "0.3"
  costWeight: "0.3"
  performanceWeight: "0.2"
  qualityWeight: "0.2"
```

**LLM Evaluation:**
```yaml
parameters:
  provider: "ark"
  scope: "relevance,accuracy,completeness"
  threshold: "0.8"
  temperature: "0.1"
```

**Standalone RAGAS (Azure OpenAI):**
```yaml
parameters:
  provider: "ragas"
  azure.api_key: "${AZURE_OPENAI_API_KEY}"
  azure.endpoint: "${AZURE_OPENAI_ENDPOINT}"
  azure.api_version: "2024-02-01"
  azure.deployment_name: "gpt-4"
  metrics: "relevance,correctness,faithfulness"
  threshold: "0.8"
```

**Standalone RAGAS (OpenAI):**
```yaml
parameters:
  provider: "ragas"
  openai.api_key: "${OPENAI_API_KEY}"
  openai.base_url: "https://api.openai.com/v1"
  openai.model: "gpt-4"
  metrics: "relevance,correctness"
  threshold: "0.7"
```

**Langfuse + RAGAS Hybrid:**
```yaml
parameters:
  provider: "langfuse"
  langfuse.host: "https://cloud.langfuse.com"
  langfuse.public_key: "${LANGFUSE_PUBLIC_KEY}"
  langfuse.secret_key: "${LANGFUSE_SECRET_KEY}"
  metrics: "relevance,correctness,faithfulness"
```

## Use Cases

### 1. **Production Monitoring**
- Real-time quality assessment of LLM responses
- Cost and performance tracking
- SLA compliance monitoring
- Quality regression detection

### 2. **Model Comparison & A/B Testing**
- Compare different models across objective and subjective metrics
- Cost-effectiveness analysis
- Performance benchmarking
- Quality consistency evaluation

### 3. **Content Quality Assurance**
- Automated content evaluation for publishing
- Customer support response assessment
- Documentation quality scoring
- Educational content validation

### 4. **Development & Optimization**
- Prompt engineering validation
- Model parameter tuning
- Response quality optimization
- Cost optimization strategies

## Integration Examples

### ARK Native Evaluation
```bash
# Direct quality assessment
POST /evaluate
{
  "type": "direct", 
  "parameters": {"provider": "ark", "scope": "all"}
}
```

### Deterministic Metrics  
```bash
# Performance and cost analysis
POST /evaluate-metrics
{
  "type": "query",
  "config": {"queryRef": {"name": "production-query"}},
  "parameters": {"maxCostPerQuery": "0.10"}
}
```

### Standalone RAGAS Evaluation
```bash
# Pure RAGAS evaluation (high performance)
POST /evaluate
{
  "type": "direct",
  "config": {
    "input": "What is renewable energy?",
    "output": "Renewable energy comes from natural sources..."
  },
  "parameters": {
    "provider": "ragas",
    "azure.api_key": "your-key",
    "azure.endpoint": "your-endpoint",
    "metrics": "relevance,correctness,faithfulness",
    "threshold": "0.8"
  }
}
```

### Langfuse + RAGAS Hybrid
```bash
# RAGAS evaluation with Langfuse tracing
POST /evaluate
{
  "parameters": {
    "provider": "langfuse",
    "langfuse.host": "https://cloud.langfuse.com",
    "langfuse.public_key": "your-public-key",
    "metrics": "faithfulness,relevance"
  }
}
```

## Migration Notes

ARK Evaluator consolidates functionality from:
- **evaluator-llm**: LLM-as-a-Judge capabilities → `/evaluate` endpoint
- **evaluator-metric**: Deterministic metrics → `/evaluate-metrics` endpoint

**Backward Compatibility**: All existing ARK evaluations continue to work without changes.

## Health & Monitoring

```bash
GET /health   # Service health status
GET /ready    # Service readiness status  
```

## Contributing

See the main ARK project documentation for contribution guidelines.

## Support

- **Documentation**: [docs/](docs/) folder for detailed guides
- **Examples**: [docs/examples/](docs/examples/) for sample configurations
- **Issues**: GitHub issues for bug reports and feature requests
- **Roadmap**: [docs/roadmap.md](docs/roadmap.md) for planned features

---

**ARK Evaluator** - Comprehensive AI Evaluation for Production Systems