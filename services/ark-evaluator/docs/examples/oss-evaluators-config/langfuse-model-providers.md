# Langfuse Model Provider Configuration Guide

This guide shows how to configure different model providers with the enhanced Langfuse evaluator in ARK.

## Supported Model Providers

### 1. OpenAI

**Basic Configuration:**
```yaml
parameters:
  langfuse.model: "gpt-4o-mini"
  langfuse.model_provider: "openai"
  langfuse.model_version: "2024-07-18"
```

**Supported Models:**
- `gpt-4o`, `gpt-4o-mini`, `gpt-4o-2024-08-06`
- `o1-preview`, `o1-mini`
- `gpt-4-turbo`, `gpt-4`, `gpt-4-0613`
- `gpt-3.5-turbo`, `gpt-3.5-turbo-0125`

### 2. Azure OpenAI

**Configuration:**
```yaml
parameters:
  langfuse.model: "gpt-4o"
  langfuse.model_provider: "azure-openai"
  langfuse.model_version: "2024-08-06"
  langfuse.azure_endpoint: "https://my-resource.openai.azure.com/"
  langfuse.azure_deployment: "my-gpt-4o-deployment"
```

**Required Parameters:**
- `langfuse.azure_endpoint` - Your Azure OpenAI service endpoint URL
- `langfuse.azure_deployment` - Your deployment name (NOT the model name)

**Authentication Options:**

**Option 1: Using Kubernetes Secrets (Recommended for cluster deployments):**
```yaml
parameters:
  langfuse.azure_api_key:
    secretRef:
      name: azure-openai-secret
      key: token
```

**Option 2: Using Environment Variables:**
```bash
AZURE_OPENAI_ENDPOINT="https://my-resource.openai.azure.com/"
AZURE_OPENAI_API_KEY="your-azure-api-key"
OPENAI_API_TYPE="azure"
OPENAI_API_VERSION="2023-09-01-preview"
```

**Important Notes:**
- The `langfuse.model` should be the actual model name (e.g., "gpt-4o")
- The `langfuse.azure_deployment` should be your deployment name (NOT the model name)
- When using Kubernetes secrets, the API key is automatically injected from the secret

### 3. Anthropic (Claude)

**Configuration:**
```yaml
parameters:
  langfuse.model: "claude-3-5-sonnet-20241022"
  langfuse.model_provider: "anthropic"
  langfuse.model_version: "20241022"
```

**Supported Models:**
- `claude-3-7-sonnet-20250219`
- `claude-3-5-sonnet-20241022`, `claude-3-5-sonnet-20240620`
- `claude-3-opus-20240229`, `claude-3-sonnet-20240229`
- `claude-3-5-haiku-20241022`, `claude-3-haiku-20240307`
- `claude-2.1`, `claude-2.0`, `claude-instant-1.2`

**API Configuration:**
```bash
ANTHROPIC_API_KEY="sk-ant-your-api-key"
```

### 4. Google Vertex AI (Gemini)

**Configuration:**
```yaml
parameters:
  langfuse.model: "gemini-1.5-pro"
  langfuse.model_provider: "google-vertex-ai"
  langfuse.model_version: "1.5"
  langfuse.vertex_project: "my-gcp-project"
  langfuse.vertex_location: "us-central1"
```

**Supported Models:**
- `gemini-2.5-pro-exp-03-25`
- `gemini-2.0-pro-exp-02-05`, `gemini-2.0-flash-001`
- `gemini-1.5-pro`, `gemini-1.5-flash`
- `gemini-1.0-pro`

**Setup Requirements:**
1. Create GCP Service Account with "Vertex AI User" role
2. Generate JSON key file
3. Configure in Langfuse LLM API Keys section with `vertex-ai` adapter
4. Paste entire JSON key content as secret key

### 5. Google AI Studio (Gemini)

**Configuration:**
```yaml
parameters:
  langfuse.model: "gemini-1.5-pro"
  langfuse.model_provider: "google-ai-studio"
  langfuse.model_version: "1.5"
```

**API Configuration:**
```bash
GOOGLE_API_KEY="your-google-ai-studio-api-key"
```

### 6. Amazon Bedrock

**Configuration:**
```yaml
parameters:
  langfuse.model: "anthropic.claude-3-sonnet-20240229-v1:0"
  langfuse.model_provider: "amazon-bedrock"
  langfuse.bedrock_region: "us-east-1"
```

**Supported Models:**
- All Amazon Bedrock models are supported
- Model names follow the format: `provider.model-name-version:identifier`
- Examples:
  - `anthropic.claude-3-opus-20240229-v1:0`
  - `anthropic.claude-3-sonnet-20240229-v1:0`
  - `anthropic.claude-3-haiku-20240307-v1:0`

**Required Permissions:** `bedrock:InvokeModel`

### 7. OpenAI-Compatible APIs

For any service that supports OpenAI API schema (Groq, OpenRouter, LiteLLM, etc.):

**Configuration:**
```yaml
parameters:
  langfuse.model: "llama-3-8b-8192"
  langfuse.model_provider: "groq"
  langfuse.model_version: "8192"
  langfuse.base_url: "https://api.groq.com/openai/v1"
```

**Examples:**

#### Groq
```yaml
langfuse.model: "llama-3-8b-8192"
langfuse.model_provider: "groq"
langfuse.base_url: "https://api.groq.com/openai/v1"
```

#### Ollama (Local)
```yaml
langfuse.model: "llama3"
langfuse.model_provider: "ollama"
langfuse.base_url: "http://localhost:11434/v1"
```

#### Hugging Face Inference API
```yaml
langfuse.model: "meta-llama/Meta-Llama-3-8B-Instruct"
langfuse.model_provider: "huggingface"
langfuse.base_url: "https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct/v1/"
```

## Complete Evaluator Configuration Examples

### Azure OpenAI Evaluator
```yaml
apiVersion: evaluator.arkdata.io/v1alpha1
kind: Evaluator
metadata:
  name: azure-openai-langfuse-evaluator
spec:
  provider: langfuse
  parameters:
    langfuse.host: "http://langfuse.telemetry.127.0.0.1.nip.io:8080"
    langfuse.public_key: 
      secretRef:
        name: langfuse-credentials
        key: public-key
    langfuse.secret_key:
      secretRef:
        name: langfuse-credentials
        key: secret-key
    langfuse.model: "gpt-4o"
    langfuse.model_provider: "azure-openai"
    langfuse.azure_deployment: "production-gpt-4o"
    langfuse.azure_endpoint: "https://my-resource.openai.azure.com/"
    langfuse.project: "ark-azure-production"
    metrics: "relevance,correctness,toxicity"
    threshold: "0.8"
```

### Anthropic Claude Evaluator
```yaml
apiVersion: evaluator.arkdata.io/v1alpha1
kind: Evaluator
metadata:
  name: anthropic-claude-langfuse-evaluator
spec:
  provider: langfuse
  parameters:
    langfuse.host: "http://langfuse.telemetry.127.0.0.1.nip.io:8080"
    langfuse.public_key: 
      secretRef:
        name: langfuse-credentials
        key: public-key
    langfuse.secret_key:
      secretRef:
        name: langfuse-credentials
        key: secret-key
    langfuse.model: "claude-3-5-sonnet-20241022"
    langfuse.model_provider: "anthropic"
    langfuse.model_version: "20241022"
    langfuse.project: "ark-anthropic-production"
    metrics: "relevance,correctness,safety"
    threshold: "0.75"
```

### Google Vertex AI Evaluator
```yaml
apiVersion: evaluator.arkdata.io/v1alpha1
kind: Evaluator
metadata:
  name: vertex-ai-gemini-langfuse-evaluator
spec:
  provider: langfuse
  parameters:
    langfuse.host: "http://langfuse.telemetry.127.0.0.1.nip.io:8080"
    langfuse.public_key: 
      secretRef:
        name: langfuse-credentials
        key: public-key
    langfuse.secret_key:
      secretRef:
        name: langfuse-credentials
        key: secret-key
    langfuse.model: "gemini-1.5-pro"
    langfuse.model_provider: "google-vertex-ai"
    langfuse.vertex_project: "my-gcp-project-id"
    langfuse.vertex_location: "us-central1"
    langfuse.project: "ark-gemini-production"
    metrics: "relevance,coherence,factuality"
    threshold: "0.7"
```

## Model Provider Selection Guide

### Choose OpenAI when:
- You need the most reliable and consistent model performance
- Cost is not the primary concern
- You're building production applications requiring high accuracy

### Choose Azure OpenAI when:
- You need enterprise-grade security and compliance
- You're already using Azure infrastructure
- You require data residency guarantees

### Choose Anthropic (Claude) when:
- You need strong reasoning and analysis capabilities
- Safety and alignment are critical concerns
- You're working with complex, nuanced content

### Choose Google Vertex AI (Gemini) when:
- You need multimodal capabilities (text + images)
- You're already using Google Cloud Platform
- Cost efficiency is important

### Choose Amazon Bedrock when:
- You need access to multiple model providers through one API
- You're using AWS infrastructure
- You want to avoid vendor lock-in

### Choose OpenAI-Compatible APIs when:
- Cost is the primary concern (e.g., Groq for speed, Ollama for local)
- You need specialized or fine-tuned models
- You want to experiment with different model providers

## Automatic Cost and Token Tracking

Langfuse automatically tracks costs and tokens for:
- **OpenAI**: All models with accurate pricing
- **Anthropic**: All Claude models with USD cost calculation
- **Azure OpenAI**: Same as OpenAI with Azure pricing
- **Other providers**: Token counting where possible, manual cost configuration required

## Model Names Reference

To ensure accurate cost tracking and model identification, use exact model names as they appear in Langfuse's 'Models' tab. The model names must match exactly for automatic cost calculation to work.