# Code-First Agent Example

Run custom Python code as an Ark agent using an OCI container.

## Quickstart

```bash
make help
```

## Development (DevSpace)

Hot-reload development with live code sync:

```bash
devspace dev
```

Edit `executor.py` -- changes sync automatically and uvicorn reloads. The DevSpace config creates a Deployment, Service, ExecutionEngine, and Agent using the Helm chart in `chart/`.

## Production (Container Mode)

Build and deploy as an Ark-managed container:

```bash
docker build -t ghcr.io/myorg/code-first-example:latest .
docker push ghcr.io/myorg/code-first-example:latest
kubectl apply -f manifests.yaml
```

This uses `ExecutionEngine` type `container` -- Ark creates and manages the Deployment and Service.

## How It Works

1. `executor.py` implements `BaseExecutor` from `ark-executor-common`
2. Ark calls `POST /execute` with model credentials, prompt, and user input
3. Your code uses any SDK to generate a response

## Consuming Ark Models

```python
from ark_executor_common import resolve_api_key, resolve_base_url

api_key = resolve_api_key(request.agent.model)
base_url = resolve_base_url(request.agent.model)
```
