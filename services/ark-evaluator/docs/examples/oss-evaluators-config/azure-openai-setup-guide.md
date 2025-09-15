# Azure OpenAI with Langfuse Setup Guide

This guide shows you exactly how to configure Azure OpenAI with Langfuse using your existing Kubernetes cluster secrets.

## Your Current Setup

You already have the Azure OpenAI secret in your cluster:
```bash
kubectl get secrets
# Shows: azure-openai-secret with 'token' key
```

## Configuration Steps

### 1. Update Your Azure OpenAI Evaluator Configuration

Use this configuration in your evaluator YAML:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Evaluator
metadata:
  name: langfuse-azure-openai-evaluator
  namespace: ark-system
  labels:
    ark.mckinsey.com/provider: langfuse
    ark.mckinsey.com/service: evaluation
spec:
  description: "Azure OpenAI evaluator with Langfuse tracing"
  address:
    valueFrom:
      serviceRef:
        name: ark-evaluator
        namespace: ark-system
        port: "http"
        path: "/evaluate"
  parameters:
    # Provider selection
    - name: provider
      value: langfuse
    
    # Langfuse connection (using your existing langfuse-credentials secret)
    - name: langfuse.host
      value: "http://langfuse.telemetry.127.0.0.1.nip.io:8080"
    - name: langfuse.public_key
      valueFrom:
        secretKeyRef:
          name: langfuse-credentials
          key: public-key
    - name: langfuse.secret_key
      valueFrom:
        secretKeyRef:
          name: langfuse-credentials
          key: secret-key
    
    # Azure OpenAI Configuration
    - name: langfuse.model
      value: "gpt-4o"                                           # Your actual model
    - name: langfuse.model_provider
      value: "azure-openai"
    - name: langfuse.azure_endpoint
      value: "https://your-resource.openai.azure.com/"         # Replace with your endpoint
    - name: langfuse.azure_deployment
      value: "your-deployment-name"                            # Replace with your deployment name
    - name: langfuse.azure_api_key                             # Uses your existing secret
      valueFrom:
        secretKeyRef:
          name: azure-openai-secret
          key: token
    
    # Optional: Additional configuration
    - name: langfuse.project
      value: "ark-azure-production"
    - name: langfuse.environment
      value: "production"
    - name: metrics
      value: "relevance,correctness,toxicity"
    - name: threshold
      value: "0.75"
```

### 2. Required Information You Need

**From Azure Portal, get:**
- **Azure Endpoint URL**: Found in your Azure OpenAI resource overview
  - Format: `https://YOUR-RESOURCE-NAME.openai.azure.com/`
- **Deployment Name**: The name you gave your model deployment (not the model name)
  - Found in "Model deployments" section of your Azure OpenAI resource

**What you DON'T need to change:**
- ✅ Your `azure-openai-secret` is already configured correctly
- ✅ The secret key name `token` is already correct
- ✅ API key will be automatically injected from the secret

### 3. Apply the Configuration

```bash
# Apply your Azure OpenAI evaluator
kubectl apply -f langfuse-azure-openai-evaluator.yaml

# Verify it's running
kubectl get evaluators
kubectl describe evaluator langfuse-azure-openai-evaluator
```

## Parameter Reference

| Parameter | Description | Required | Example |
|-----------|-------------|----------|---------|
| `langfuse.model` | Actual model name | ✅ | `"gpt-4o"` |
| `langfuse.model_provider` | Must be "azure-openai" | ✅ | `"azure-openai"` |
| `langfuse.azure_endpoint` | Your Azure endpoint URL | ✅ | `"https://my-resource.openai.azure.com/"` |
| `langfuse.azure_deployment` | Your deployment name | ✅ | `"my-gpt-4o-deployment"` |
| `langfuse.azure_api_key` | Reference to your secret | ✅ | `secretRef: azure-openai-secret/token` |

## Validation

The system will validate that:
1. Both `azure_endpoint` and `azure_deployment` are provided
2. The secret reference exists and can be accessed
3. All Langfuse connection parameters are valid

If any validation fails, you'll see clear error messages in the evaluator logs:
```bash
kubectl logs -l app=langfuse-azure-openai-evaluator
```

## Benefits of This Approach

- 🔐 **Secure**: API keys stored in Kubernetes secrets, not in YAML files
- 🔄 **Flexible**: Easy to rotate keys by updating the secret
- 📊 **Observable**: Full Langfuse tracing for all Azure OpenAI calls
- 🏗️ **Cloud-native**: Follows Kubernetes best practices for secret management

## Troubleshooting

**If the evaluator fails to start:**
1. Check the secret exists: `kubectl get secret azure-openai-secret`
2. Verify the secret has the `token` key: `kubectl get secret azure-openai-secret -o yaml`
3. Check evaluator logs: `kubectl logs -l app=langfuse-azure-openai-evaluator`
4. Ensure your Azure endpoint URL ends with `/`
5. Verify your deployment name matches what's in Azure Portal