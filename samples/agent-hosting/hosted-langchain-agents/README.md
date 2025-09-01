# Hosted LangChain Agents

LangChain weather agent hosted via A2A protocol.

## Overview

This sample demonstrates how to host existing LangChain agents using the A2A (Agent-to-Agent) protocol. It includes:

- **Weather Agent**: LangChain agent with weather forecasting tools
- **Skill-Specific Endpoints**: Direct routing to `/skills/weather_forecast/jsonrpc`
- **A2A Protocol Compliance**: Proper agent discovery and JSON-RPC handling

## Weather Tools

The weather agent uses two tools that mirror the standard ARK weather functionality:

1. **get_coordinates_tool**: Get city coordinates and weather grid info using OpenMeteo API
2. **get_forecast_tool**: Get detailed weather forecast using National Weather Service API

## Usage

```bash
# Show all available recipes
make help

# Install/uninstall - sets up your local machine or cluster
make install
make uninstall

# Run in development mode
make dev
```

## Development

The service requires these environment variables:
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
- `AZURE_API_BASE`: Azure OpenAI base URL
- `LLM_MODEL_NAME`: Model name (default: gpt-4o)
- `AZURE_API_VERSION`: API version (default: 2024-12-01-preview)

## A2A Endpoints

When deployed, the service exposes:

- `/.well-known/agent.json` - Agent discovery endpoint
- `/jsonrpc` - Base JSON-RPC endpoint
- `/skills/weather_forecast/jsonrpc` - Weather forecast skill endpoint
- `/health` - Health check endpoint

## Agent Targeting

The A2AServer creates an agent named `hosted-langchain-agents-weather-forecast` that can be targeted in queries:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: weather-query
spec:
  input: "What is the weather forecast for Chicago?"
  targets:
    - type: agent
      name: hosted-langchain-agents-weather-forecast
```

## Architecture

The A2AServer automatically discovers agents from the hosted service and creates corresponding Agent resources with the reserved 'a2a' execution engine. Each agent includes:

- **Labels**: `a2a/server` linking to the A2AServer
- **Annotations**: `ark.mckinsey.com/a2a-server-name`, `ark.mckinsey.com/a2a-server-address`, and `ark.mckinsey.com/a2a-server-skills` with server details
- **Execution Engine**: Set to 'a2a' for dedicated A2A execution routing

When queries target these agents, the 'a2a' execution engine routes directly to the dedicated A2A execution module running in-cluster, which communicates with the hosted service.