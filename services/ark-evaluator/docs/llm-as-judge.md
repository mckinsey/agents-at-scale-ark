# LLM-as-a-Judge Evaluation

ARK Evaluator provides intelligent, LLM-based evaluation through the `/evaluate` endpoint. This evaluation type uses Language Models as judges to assess response quality across multiple subjective dimensions.

## Overview

LLM-as-a-Judge evaluation leverages the reasoning capabilities of advanced language models to evaluate AI-generated responses based on subjective criteria like relevance, accuracy, completeness, clarity, and usefulness. This approach is particularly valuable for assessing qualities that are difficult to measure through purely deterministic means.

## Evaluation Criteria

The service evaluates responses across five key dimensions:

### 1. Relevance (0-1)
How well the response addresses the original query or request:
- **Direct Addressing**: Does the response directly answer the question?
- **Context Appropriateness**: Is the response appropriate for the given context?
- **Topic Alignment**: Does the response stay on topic?

### 2. Accuracy (0-1)
Factual correctness and reliability of the information provided:
- **Factual Correctness**: Are the stated facts accurate?
- **Consistency**: Is the information internally consistent?
- **Source Reliability**: Are claims backed by reliable reasoning?

### 3. Completeness (0-1)
Comprehensiveness and thoroughness of the response:
- **Coverage**: Does the response cover all aspects of the question?
- **Detail Level**: Is the level of detail appropriate?
- **Missing Information**: Are there obvious gaps in the response?

### 4. Clarity (0-1)
Readability, understanding, and communication effectiveness:
- **Language Clarity**: Is the language clear and understandable?
- **Structure**: Is the response well-organized?
- **Accessibility**: Is the response accessible to the target audience?

### 5. Usefulness (0-1)
Practical value and actionability of the response:
- **Actionable Information**: Does the response provide actionable insights?
- **Practical Value**: Is the response useful for the intended purpose?
- **Problem Resolution**: Does the response help solve the user's problem?

## Supported LLM Providers

ARK Evaluator supports multiple LLM providers for evaluation:

### OpenAI Models
- **GPT-4o**: Latest multimodal model with enhanced reasoning
- **GPT-4**: High-quality reasoning for complex evaluations
- **GPT-4-turbo**: Faster inference with maintained quality
- **GPT-3.5-turbo**: Cost-effective option for simpler evaluations

### Azure OpenAI Service
- **GPT-4o**: Available through Azure deployments
- **GPT-4**: Enterprise-grade deployment
- **GPT-4-turbo**: Regional availability with compliance features
- **Custom Deployments**: Support for custom deployment names

### Anthropic Claude
- **Claude-3.5-Sonnet**: Balanced performance and reasoning
- **Claude-3-Opus**: Highest capability for complex evaluations
- **Claude-3-Haiku**: Fast inference for high-throughput scenarios

### Google Gemini
- **Gemini Pro**: Advanced reasoning capabilities
- **Gemini Flash**: Fast inference option

### Ollama (Local Models)
- **Llama 3.1**: Open-source alternative
- **Mistral**: European-focused model option
- **Custom Models**: Support for locally hosted models

## API Usage

### Endpoint
```
POST /evaluate
```

### Request Format

**Direct Evaluation**:
```json
{
  "type": "direct",
  "evaluatorName": "quality-evaluator",
  "config": {
    "input": "What are the benefits of renewable energy?",
    "output": "Renewable energy offers environmental benefits through reduced emissions, economic advantages via job creation and energy independence, and long-term sustainability for future generations."
  },
  "parameters": {
    "provider": "ark",
    "scope": "all",
    "min_score": "0.7"
  }
}
```

**Query-based Evaluation**:
```json
{
  "type": "query",
  "evaluatorName": "agent-evaluator",
  "config": {
    "queryRef": {
      "name": "knowledge-query",
      "namespace": "default"
    }
  },
  "parameters": {
    "provider": "ark",
    "scope": "relevance,accuracy,completeness",
    "threshold": "0.8"
  }
}
```

### Response Format

```json
{
  "score": "0.85",
  "passed": true,
  "metadata": {
    "provider": "ark",
    "model": "gpt-4o",
    "evaluation_criteria": {
      "relevance": 0.9,
      "accuracy": 0.85,
      "completeness": 0.8,
      "clarity": 0.9,
      "usefulness": 0.8
    },
    "reasoning": "The response directly addresses the question about renewable energy benefits, providing accurate information across environmental, economic, and sustainability dimensions. The explanation is clear and well-structured, making it highly useful for understanding the topic.",
    "threshold": "0.7"
  },
  "error": null,
  "tokenUsage": {
    "promptTokens": 150,
    "completionTokens": 75,
    "totalTokens": 225
  }
}
```

## Configuration

### Provider Selection
Control which LLM provider to use for evaluation:

```json
{
  "parameters": {
    "provider": "ark"  // Uses ARK's default configuration
  }
}
```

### Evaluation Scope
Specify which criteria to evaluate:

```json
{
  "parameters": {
    "scope": "all"  // All five criteria
    // OR
    "scope": "relevance,accuracy,clarity"  // Specific criteria
  }
}
```

### Quality Thresholds
Set minimum acceptable scores:

```json
{
  "parameters": {
    "min_score": "0.7",        // Overall minimum score
    "threshold": "0.8",        // Alternative parameter name
    "relevance_min": "0.8",    // Criterion-specific minimums
    "accuracy_min": "0.9"
  }
}
```

### Model-Specific Parameters
Configure model behavior:

```json
{
  "parameters": {
    "temperature": "0.1",      // Lower temperature for consistency
    "max_tokens": "500",       // Limit evaluation length
    "seed": "12345"           // For reproducible results
  }
}
```

## Use Cases

### 1. Content Quality Assessment
Evaluate generated content for:
- Blog posts and articles
- Marketing copy
- Documentation
- Customer support responses

### 2. Chatbot Response Quality
Assess conversational AI responses for:
- Customer service interactions
- Educational chatbots
- Virtual assistants
- FAQ systems

### 3. Model Comparison
Compare different models across:
- Response quality metrics
- Consistency over time
- Performance across domains
- Cost-effectiveness ratios

### 4. Prompt Engineering
Optimize prompts by evaluating:
- Output quality changes
- Consistency improvements
- Specific criterion performance
- Overall effectiveness

### 5. A/B Testing
Compare different approaches:
- Model versions
- Prompt strategies
- Configuration parameters
- Response generation techniques

## Best Practices

### 1. Evaluation Consistency
- Use consistent prompts for comparable results
- Set appropriate temperature values (0.0-0.2 for consistency)
- Consider using seeds for reproducible evaluations

### 2. Criterion Selection
- Choose relevant criteria for your use case
- Don't over-evaluate (focus on 2-4 key criteria)
- Align criteria with business objectives

### 3. Threshold Setting
- Start with conservative thresholds (0.7-0.8)
- Adjust based on historical performance
- Consider different thresholds per criterion

### 4. Cost Management
- Use appropriate model tiers for your needs
- Consider evaluation frequency vs. cost
- Implement sampling for high-volume scenarios

### 5. Validation
- Periodically validate evaluations against human judgment
- Monitor evaluation consistency over time
- Adjust criteria weights based on business priorities

## Integration with ARK

LLM-as-a-Judge evaluation integrates with ARK's evaluation framework:

1. **Model Configuration**: Automatically inherits model settings from ARK Evaluator resources
2. **Provider Abstraction**: Works with any configured LLM provider
3. **Unified Interface**: Consistent API regardless of underlying model
4. **Resource Management**: Leverages ARK's resource scheduling and management

## Limitations

1. **Subjectivity**: Evaluations may vary between different judge models
2. **Context Limits**: Limited by the judge model's context window
3. **Domain Knowledge**: Quality depends on the judge model's domain expertise
4. **Cost**: Can be expensive for high-volume evaluations
5. **Latency**: Real-time evaluation may introduce response delays

## Future Enhancements

- Multi-judge consensus evaluation
- Custom criterion definition
- Domain-specific evaluation templates
- Human-in-the-loop validation
- Evaluation result caching