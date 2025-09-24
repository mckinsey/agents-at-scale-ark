# ARK Python SDK

Python SDK for ARK - Agentic Runtime for Kubernetes. This SDK is part of the open source [Agents at Scale ARK](https://github.com/mckinsey/agents-at-scale-ark) project.

This package provides Python bindings for managing ARK agents, models, queries, and other resources in Kubernetes. It is partly generated from the ARK Custom Resource Definitions (CRDs), with additional capabilities layered on top.

## Installation

```bash
pip install ark-sdk
```

## Usage

### Kubernetes Resource Management

```python
from ark_sdk import ARKClientV1alpha1
from ark_sdk.models.agent_v1alpha1 import AgentV1alpha1, AgentV1alpha1Spec

# Initialize client
client = ARKClientV1alpha1(namespace="default")

# Create agent
agent = AgentV1alpha1(
    metadata={"name": "my-agent"},
    spec=AgentV1alpha1Spec(prompt="Hello", modelRef={"name": "gpt-4"})
)
created = client.agents.create(agent)

# Get, update, delete
agent = client.agents.get("my-agent")
agent.spec.prompt = "Updated"
client.agents.update(agent)
client.agents.delete("my-agent")
```

### Execution Engine Development

The SDK now includes utilities for building execution engines:

```python
from ark_sdk import BaseExecutor, ExecutorApp, ExecutionEngineRequest, Message

class MyExecutor(BaseExecutor):
    def __init__(self):
        super().__init__("MyEngine")
    
    async def execute_agent(self, request: ExecutionEngineRequest) -> List[Message]:
        # Your execution logic here
        return [Message(role="assistant", content="Hello from my engine!")]

# Create and run the executor
executor = MyExecutor()
app = ExecutorApp(executor, "MyEngine")
app.run(host="0.0.0.0", port=8000)
```

### Async Operations

```python
# List agents asynchronously
agents = await client.agents.a_list()

# Create query asynchronously
query = await client.queries.a_create(QueryV1alpha1(...))
```

## Execution Engine Types

The SDK provides common types for execution engines:

- `ExecutionEngineRequest` - Request format for agent execution
- `ExecutionEngineResponse` - Response format from execution engines
- `AgentConfig` - Agent configuration structure
- `Message` - Chat message format
- `BaseExecutor` - Abstract base class for execution engines
- `ExecutorApp` - FastAPI application setup for execution engines

## Documentation

For full documentation and examples, visit the [ARK project repository](https://github.com/mckinsey/agents-at-scale-ark).

## Requirements

- Python 3.9+
- Kubernetes cluster with ARK installed
- FastAPI and uvicorn (for execution engine development)