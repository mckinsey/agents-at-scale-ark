# Langfuse + RAGAS Hybrid Integration

ARK Evaluator provides hybrid evaluation capabilities that combine RAGAS evaluation with Langfuse tracing and observability. This provider offers comprehensive evaluation with full tracing capabilities.

## Overview

**Note**: For standalone RAGAS evaluation without tracing overhead, see the [RAGAS Provider](ragas-provider.md) documentation.

This hybrid integration combines three powerful technologies:
- **Langfuse**: Tracing and evaluation platform for LLM applications with full observability
- **RAGAS**: Specialized evaluation framework providing the actual evaluation metrics
- **Azure OpenAI**: Enterprise-grade AI models with enhanced security and compliance

The hybrid approach provides sophisticated evaluation capabilities with automatic tracing, metrics collection, comprehensive scoring, and complete evaluation lineage in Langfuse.

## Provider Comparison

| Feature | Langfuse Provider (Hybrid) | RAGAS Provider (Standalone) |
|---------|---------------------------|------------------------------|
| **Evaluation Engine** | ✅ RAGAS metrics | ✅ RAGAS metrics |
| **Performance** | 🐌 Slower (includes tracing) | ⚡ Faster (no tracing overhead) |
| **Observability** | ✅ Full Langfuse tracing | ❌ None |
| **Dependencies** | 📦📦 RAGAS + Langfuse | 📦 RAGAS only |
| **Configuration** | 🟡 Medium complexity | 🟢 Simple |
| **Use Case** | Development, debugging, monitoring | Production, batch processing |

### When to Use Langfuse Provider

✅ **Choose Langfuse Provider when you need:**
- Complete evaluation tracing and observability
- Debugging and development workflows
- Evaluation lineage and audit trails
- Integration with Langfuse dashboards
- Research and experimentation

### When to Use RAGAS Provider

✅ **Choose RAGAS Provider when you need:**
- High-performance evaluation without overhead
- Simple, minimal configuration
- Batch processing or high-throughput scenarios
- Production evaluation pipelines
- Minimal dependencies

## Architecture

### Components

1. **Langfuse Provider**: Manages Langfuse client connections and trace creation
2. **RAGAS Adapter**: Handles RAGAS evaluation execution with UV loop compatibility
3. **Azure OpenAI Configurator**: Manages Azure-specific configurations and environment variables
4. **UV Loop Handler**: Ensures compatibility between different async environments

### UV Loop Compatibility

The integration includes sophisticated handling for UV loop environments:
- **Detection**: Automatically detects uvloop presence
- **Thread Isolation**: Runs RAGAS evaluation in separate threads when needed
- **Clean Environment**: Creates isolated asyncio environments for RAGAS execution
- **Environment Management**: Properly manages Azure environment variables in thread contexts

## Supported Evaluation Metrics

### RAGAS Metrics
- **Answer Relevancy**: How relevant the answer is to the question
- **Answer Correctness**: Factual accuracy of the generated answer
- **Answer Similarity**: Semantic similarity between generated and reference answers
- **Faithfulness**: Whether the answer is grounded in the given context
- **Context Precision**: Quality of retrieved context (for RAG applications)
- **Context Recall**: Completeness of retrieved context (for RAG applications)

### Custom Mappings
- **Helpfulness**: Mapped to answer relevancy as a proxy measure
- **Clarity**: Mapped to answer similarity for readability assessment
- **Toxicity**: Custom implementation (RAGAS doesn't provide built-in toxicity detection)

## Azure OpenAI Configuration

### Required Parameters

```json
{
  "parameters": {
    "provider": "langfuse",
    "langfuse.host": "https://cloud.langfuse.com",
    "langfuse.public_key": "pk-lf-xxxxx",
    "langfuse.secret_key": "sk-lf-xxxxx",
    "langfuse.azure_api_key": "your-azure-api-key",
    "langfuse.azure_endpoint": "https://your-resource.openai.azure.com/",
    "langfuse.azure_deployment": "gpt-4o",
    "langfuse.model_version": "2024-02-01"
  }
}
```

### Optional Azure Parameters

```json
{
  "parameters": {
    "langfuse.azure_embedding_deployment": "text-embedding-ada-002",
    "langfuse.azure_embedding_model": "text-embedding-ada-002",
    "langfuse.model": "gpt-4o"
  }
}
```

### Environment Variable Management

The integration automatically manages Azure OpenAI environment variables:
- `AZURE_OPENAI_API_KEY`: Set from `langfuse.azure_api_key`
- `AZURE_OPENAI_ENDPOINT`: Set from `langfuse.azure_endpoint`
- `OPENAI_API_VERSION`: Set from `langfuse.model_version`

Variables are set in thread-safe contexts and automatically cleaned up after evaluation.

## API Usage

### Endpoint
```
POST /evaluate
```

### Basic Langfuse Evaluation

```json
{
  "type": "direct",
  "evaluatorName": "langfuse-ragas-evaluator",
  "config": {
    "input": "What are the key benefits of renewable energy for businesses?",
    "output": "Renewable energy offers businesses significant cost savings through reduced electricity bills, enhanced sustainability credentials for ESG reporting, energy independence from grid fluctuations, and potential revenue streams through energy storage and grid services."
  },
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
    "threshold": "0.8"
  }
}
```

### Advanced Configuration with Context

```json
{
  "type": "direct",
  "evaluatorName": "rag-evaluator",
  "config": {
    "input": "How can companies implement sustainable practices?",
    "output": "Companies can implement sustainable practices through energy efficiency programs, waste reduction initiatives, sustainable supply chain management, and employee engagement programs focused on environmental responsibility."
  },
  "parameters": {
    "provider": "langfuse",
    "langfuse.host": "https://your-langfuse-instance.com",
    "langfuse.public_key": "pk-lf-xxxxx",
    "langfuse.secret_key": "sk-lf-xxxxx",
    "langfuse.azure_api_key": "your-azure-key",
    "langfuse.azure_endpoint": "https://your-resource.openai.azure.com/",
    "langfuse.azure_deployment": "gpt-4o",
    "langfuse.azure_embedding_deployment": "text-embedding-ada-002",
    "langfuse.model_version": "2024-02-01",
    "metrics": "all",
    "context": "Based on corporate sustainability reports and environmental best practices from leading organizations",
    "context_source": "sustainability_knowledge_base",
    "threshold": "0.75"
  }
}
```

## Response Format

```json
{
  "score": "0.85",
  "passed": true,
  "metadata": {
    "provider": "langfuse",
    "trace_id": "cm2abc123def456",
    "trace_url": "https://cloud.langfuse.com/trace/cm2abc123def456",
    "scores": {
      "relevance": 0.89,
      "correctness": 0.82,
      "faithfulness": 0.84,
      "similarity": 0.87
    },
    "threshold": "0.8",
    "ragas_version": "0.1.x",
    "azure_deployment": "gpt-4o",
    "embedding_deployment": "text-embedding-ada-002"
  },
  "error": null,
  "tokenUsage": {
    "promptTokens": 245,
    "completionTokens": 120,
    "totalTokens": 365
  }
}
```

## Langfuse Tracing Features

### Automatic Trace Creation
- **Trace Generation**: Automatic trace creation for each evaluation
- **Span Hierarchy**: Organized spans for evaluation steps
- **Metadata**: Rich metadata including model information and parameters
- **Scoring**: Automatic score recording in Langfuse

### Trace Structure
```
Evaluation Trace
├── Generation Span (LLM evaluation)
│   ├── Input: Original question/prompt
│   ├── Output: Generated response
│   └── Model: Azure OpenAI deployment info
└── Evaluation Spans
    ├── Relevance Score
    ├── Correctness Score
    ├── Faithfulness Score
    └── Overall Score
```

## Azure OpenAI Features

### Supported Models
- **GPT-4o**: Latest multimodal capabilities
- **GPT-4-turbo**: Fast inference with high quality
- **GPT-4**: Stable, reliable performance
- **GPT-3.5-turbo**: Cost-effective option

### Embedding Support
- **text-embedding-ada-002**: Default embedding model
- **Custom Deployments**: Support for custom embedding deployments
- **Automatic Configuration**: Seamless embedding integration with RAGAS

### Enterprise Features
- **Private Endpoints**: Support for private Azure endpoints
- **Compliance**: Built-in compliance with enterprise requirements
- **Regional Data**: Data residency control through Azure regions
- **Security**: Enterprise-grade security and access controls

## Configuration Best Practices

### 1. Model Selection
- **GPT-4o**: Best for complex evaluations requiring reasoning
- **GPT-4-turbo**: Balance of speed and quality
- **GPT-3.5-turbo**: High-volume, cost-conscious scenarios

### 2. Embedding Configuration
- Use consistent embedding deployments across evaluations
- Ensure embedding model matches your domain
- Test connectivity before production deployment

### 3. Parameter Tuning
```json
{
  "temperature": 0.1,  // Low temperature for consistent evaluation
  "max_tokens": 500,   // Sufficient for detailed evaluation
  "timeout": 30        // Appropriate timeout for complex evaluations
}
```

### 4. Error Handling
- Monitor Azure deployment quotas
- Implement retry logic for transient failures
- Set up alerting for evaluation failures

## Troubleshooting

### Common Issues

#### 1. UV Loop Conflicts
**Symptom**: `RuntimeError: This event loop is already running`
**Solution**: The integration automatically handles this with thread isolation

#### 2. Azure Authentication
**Symptom**: `Authentication failed`
**Solutions**:
- Verify API key is correct
- Check endpoint URL format
- Ensure deployment name matches Azure configuration

#### 3. Embedding Connectivity
**Symptom**: `Embedding model not found`
**Solutions**:
- Verify embedding deployment name
- Check embedding model availability in region
- Ensure sufficient quota for embeddings

#### 4. RAGAS Import Errors
**Symptom**: `ModuleNotFoundError: No module named 'ragas'`
**Solutions**:
- Install RAGAS dependencies: `uv add ragas`
- Verify compatible versions
- Check import paths

### Debug Configuration

Enable debug logging for detailed information:
```json
{
  "parameters": {
    "debug": "true",
    "log_level": "DEBUG"
  }
}
```

## Integration Examples

### 1. RAG Application Evaluation
```json
{
  "type": "direct",
  "config": {
    "input": "What is the impact of climate change on agriculture?",
    "output": "Climate change affects agriculture through altered precipitation patterns, increased temperatures, and extreme weather events, leading to reduced crop yields and food security challenges."
  },
  "parameters": {
    "provider": "langfuse",
    "metrics": "faithfulness,relevance,correctness",
    "context": "IPCC climate reports and agricultural impact studies"
  }
}
```

### 2. Customer Support Quality Assessment
```json
{
  "type": "query",
  "config": {
    "queryRef": {
      "name": "support-query",
      "namespace": "customer-service"
    }
  },
  "parameters": {
    "provider": "langfuse",
    "metrics": "relevance,clarity,helpfulness",
    "threshold": "0.8"
  }
}
```

## Future Roadmap

### Planned Enhancements

1. **Additional LLM Providers**
   - OpenAI GPT models
   - Anthropic Claude integration
   - Google Gemini support
   - Local model support via Ollama

2. **Enhanced Evaluation Libraries**
   - **Opik**: Comet's evaluation platform integration
   - **DeepEval**: Comprehensive evaluation framework
   - **UpTrain**: Data and model evaluation platform
   - **Custom Evaluators**: Framework for custom evaluation logic

3. **Advanced Features**
   - Multi-judge consensus evaluation
   - Custom metric definition
   - Evaluation result caching
   - Batch evaluation optimization
   - Real-time evaluation streaming

4. **Integration Improvements**
   - Enhanced Langfuse features
   - Better error handling and retry logic
   - Performance optimizations
   - Extended Azure OpenAI capabilities

### Contributing
See the main project documentation for contribution guidelines and development setup.