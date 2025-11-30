# Deployment Guide

## Prerequisites

- Kubernetes cluster (MicroK8s recommended)
- kubectl configured to talk to the cluster
- helm installed
- LLM service with API keys and endpoint (Azure OpenAI supported)

## Deploy to cluster

Deploy operator (builds containers locally and installs CRDs + controller via Helm):
```sh
make deploy
```

Apply sample resources:
```sh
kubectl apply -k ../samples/
```

## Local Development

Run controller locally with webhooks:
```sh
make run
```

Build and test:
```sh
make build test lint
```

Generate manifests and code after API changes:
```sh
make manifests generate
# If you are running with a local kube cluster, don't forget to run:
# make deploy
```

## Uninstall

Delete sample resources:
```sh
kubectl delete -k ../samples/
```

Remove ARK controller and CRDs:
```sh
helm uninstall ark-controller -n ark-system
```


## Configuration

### Verbosity and Observability

The operator provides configurable verbosity levels for event recording and observability:

#### Development Configuration

```bash
# Default verbosity (level 0) - only critical operations
cd ark && make dev

# Standard verbosity (level 1) - includes agent/team operations
cd ark && make dev ARGS="--zap-log-level=1"

# Detailed verbosity (level 2) - includes LLM calls
cd ark && make dev ARGS="--zap-log-level=2"

# Debug verbosity (level 3) - includes response content
cd ark && make dev ARGS="--zap-log-level=3"
```

#### Production Configuration

Configure verbosity in your deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ark-controller
  namespace: ark-system
spec:
  template:
    spec:
      containers:
      - name: manager
        image: <registry>/ark:tag
        env:
        - name: ZAPLOGLEVEL
          value: "1"  # Recommended for production
        args:
        - --leader-elect
        - --zap-log-level=$(ZAPLOGLEVEL)
```

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZAPLOGLEVEL` | Log verbosity level (0-3) | `0` |

### Monitoring and Troubleshooting

#### Viewing Events

Monitor system activity through Kubernetes events:

```bash
# View all operator events
kubectl get events -n ark-system

# Monitor query execution
kubectl get events --watch --field-selector involvedObject.kind=Query

# Debug agent execution
kubectl describe agent my-agent
kubectl logs -n ark-system deployment/ark-controller
```

#### Verbosity Level Guide

- **Level 0**: Use for production monitoring - only query/model resolution events
- **Level 1**: Standard operations - includes all agent/team execution
- **Level 2**: Detailed debugging - adds LLM call tracking  
- **Level 3**: Full debugging - includes response content (sensitive data)

**Security Note**: Level 3 logs may contain sensitive data from LLM responses. Use with caution in production environments.