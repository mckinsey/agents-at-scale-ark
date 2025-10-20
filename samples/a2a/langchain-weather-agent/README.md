# LangChain Weather Agent

A weather forecasting agent built with LangChain, exposed via the A2A protocol for integration with ARK.

For full documentation on building A2A servers, see the [Building A2A Servers](https://github.com/mckinsey/agents-at-scale-ark/blob/main/docs/content/developer-guide/building-a2a-servers.mdx) guide.

## Overview

This sample demonstrates how to:
- Build a LangChain agent with custom tools
- Expose the agent using the A2A (Agent-to-Agent) protocol
- Deploy to Kubernetes with hot-reload development support
- Connect to Azure OpenAI for LLM capabilities

The agent uses OpenMeteo APIs to fetch weather data for any city and responds to natural language queries.

## Prerequisites

**For local testing:**
- Python 3.11 or 3.12
- Azure OpenAI API access

**For Kubernetes deployment:**
- Kubernetes cluster with ARK installed:
  - ARK controller (for A2AServer discovery and Agent creation)
  - ARK execution engine (for query routing and execution)
- `devspace` CLI (install from [devspace.sh](https://devspace.sh))

**Note:** If you haven't installed ARK yet, see the [ARK installation guide](https://github.com/mckinsey/agents-at-scale-ark#installation)

## Configuration

This sample uses Azure OpenAI directly and does NOT require ARK Model resources. Configure using environment variables or Kubernetes secrets.

### Environment Variables

Create a `.env` file from the example:

```bash
cd samples/a2a/langchain-weather-agent
cp env.example .env
```

Edit `.env` with your Azure OpenAI credentials:

```bash
AZURE_OPENAI_API_KEY=your-azure-openai-api-key-here
AZURE_API_BASE=https://your-resource.openai.azure.com
LLM_MODEL_NAME=gpt-4o-mini
AZURE_API_VERSION=2024-04-01-preview
```

**Important Notes:**
- `LLM_MODEL_NAME` must match your Azure OpenAI **deployment name** (not the base model name)
- Common deployment names: `gpt-4o-mini`, `gpt-4o`, `gpt-35-turbo`, `gpt-4`
- Check your Azure portal to find your available deployment names

## Deploying to Kubernetes

### Step 1: Navigate to Sample Directory

```bash
cd samples/a2a/langchain-weather-agent
```

### Step 2: Create Secret

Create a Kubernetes secret with your Azure OpenAI credentials.

**Copy from your `.env` file:**

```bash
# Load environment variables from .env (in current directory)
source .env

# Create the secret
kubectl create secret generic langchain-azure-openai-secret \
  --from-literal=api-key="${AZURE_OPENAI_API_KEY}" \
  --from-literal=base-url="${AZURE_API_BASE}" \
  --namespace="${NAMESPACE:-default}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Or manually:**

```bash
kubectl create secret generic langchain-azure-openai-secret \
  --from-literal=api-key='YOUR_AZURE_OPENAI_API_KEY' \
  --from-literal=base-url='https://your-resource.openai.azure.com'
```

### Step 3: Update manifests.yaml (if needed)

Check that the model name in `manifests.yaml` matches your deployment:

```yaml
- name: LLM_MODEL_NAME
  value: "gpt-4o-mini"  # Update this to match your Azure deployment name
```

### Step 4: Deploy with DevSpace

Deploy to your cluster with hot-reload support:

```bash
devspace dev
```

This will:
1. Build the container image
2. Deploy to Kubernetes (Deployment, Service, A2AServer)
3. Enable live code reloading
4. Stream logs to your terminal

**What happens:**
- The `A2AServer` resource tells ARK to discover your agent
- ARK connects to the service and reads the agent card
- ARK automatically creates an `Agent` resource
- You can now query the agent through ARK

### Step 5: Verify Deployment

Check that resources were created (in a new terminal):

```bash
# Check the deployment
kubectl get deployments
# NAME                      READY   UP-TO-DATE   AVAILABLE
# langchain-weather-agent   1/1     1            1

# Check the service
kubectl get services
# NAME                      TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)
# langchain-weather-agent   ClusterIP   10.96.204.83    <none>        80/TCP

# Check the A2AServer
kubectl get a2aservers
# NAME                      READY   DISCOVERING   ADDRESS
# langchain-weather-agent   True    False         http://langchain-weather-agent...

# Check if ARK created an Agent
kubectl get agents
# NAME                      MODEL   AVAILABLE
# langchain-weather-agent           True
```

**Important:** It may take a few seconds for ARK to discover the agent. If you don't see the agent immediately, wait 10-30 seconds and check again:

```bash
# Watch for the agent to be created
kubectl get agents -w
```

### Step 6: Query the Agent

Once the agent appears, you can query it through ARK:

```bash
ark agent query langchain-weather-agent "What's the weather in Chicago?"
```

Or create a Query resource:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: chicago-weather
spec:
  input: "What is the weather forecast for Chicago?"
  targets:
    - type: agent
      name: langchain-weather-agent
```

### Cleanup

To remove the deployment (run from the sample directory):

```bash
cd samples/a2a/langchain-weather-agent
devspace purge
kubectl delete secret langchain-azure-openai-secret
```

## Architecture

The sample consists of:

- **`a2a_server.py`**: A2A protocol implementation with agent card and request handlers
- **`langchain_agents.py`**: LangChain agent setup with Azure OpenAI and tools
- **`weather_tools.py`**: Weather data fetching using OpenMeteo API
- **`manifests.yaml`**: Kubernetes resources (Deployment, Service, A2AServer)
- **`devspace.yaml`**: Hot-reload development configuration

## How It Works

1. **A2AServer Resource**: ARK discovers the agent by connecting to the A2A server endpoint
2. **Agent Discovery**: ARK reads the agent card from `/.well-known/agent.json`
3. **Agent Creation**: ARK automatically creates an Agent resource
4. **Query Routing**: When queries target this agent, ARK routes them to the A2A server
5. **LangChain Execution**: The server invokes the LangChain agent, which uses tools to fetch weather data
6. **Response**: Results are returned through the A2A protocol

## Key Differences from ARK Native Agents

- **Self-contained LLM**: Uses Azure OpenAI directly, not ARK Model resources
- **External Execution**: LangChain agent runs in your container, not in ARK's executor
- **Custom Tools**: Implements weather tools outside ARK's tool framework
- **A2A Protocol**: Communication happens via JSON-RPC over HTTP

## Troubleshooting

### Agent not appearing in `kubectl get agents`

1. **Check A2AServer status:**
   ```bash
   kubectl get a2aserver langchain-weather-agent -o yaml
   ```
   Look for `status.ready: true`

2. **Check ARK can reach the service:**
   ```bash
   kubectl logs -n ark-system -l app=ark-controller -f
   ```
   Look for logs about discovering the agent

3. **Test the agent card endpoint:**
   ```bash
   kubectl run curl --image=curlimages/curl -it --rm -- \
     curl http://langchain-weather-agent.default.svc.cluster.local/.well-known/agent.json
   ```

### Authentication errors (403/401)

- Verify your `AZURE_OPENAI_API_KEY` is valid and not expired
- Check that `LLM_MODEL_NAME` matches an actual deployment in your Azure OpenAI resource

### Testing the A2A server locally (without Kubernetes)

If you want to debug the A2A server implementation before deploying to Kubernetes:

```bash
make dev
```

The server will be available at `http://0.0.0.0:8000`. Test the A2A protocol directly:

```bash
# View the agent card
curl http://localhost:8000/.well-known/agent.json | jq .

# Health check
curl http://localhost:8000/health

# Test a weather query directly via JSON-RPC
curl -X POST http://localhost:8000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-1",
        "contextId": "ctx-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "What is the weather in Chicago?"}]
      }
    },
    "id": 1
  }' | jq -r '.result.parts[0].text'
```

**Note:** ARK cannot discover agents running on localhost. This is only for testing the A2A server implementation.

## Development Tips

- Use `devspace dev` for hot-reload during development
- Check logs: `kubectl logs -l app=langchain-weather-agent -f`
- Test locally before deploying: `make dev`
- The agent card defines what ARK sees about your agent
- Model names must match your Azure OpenAI deployment names exactly
