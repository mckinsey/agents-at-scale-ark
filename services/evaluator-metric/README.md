# Metric Evaluator Service

Evaluation service using approach for Ark platform, specially focused on asserting cost and performance.

## Overview

TODO

## Features

- **Multi-criteria Assessment**: Evaluates responses across key dimensions
- **Model Flexibility**: Supports OpenAI and Azure OpenAI model configurations
- **REST API**: Simple HTTP interface for evaluation requests
- **Kubernetes Native**: Deployed as Ark Evaluator custom resource

## API Endpoints

### Health Checks
- `GET /health` - Service health status
- `GET /ready` - Service readiness status

### Evaluation
- `POST /evaluate` - Evaluate query responses

#### Request Format
```json
@TODO
```

#### Response Format
```json
@TODO
```

## Development

### Quick Start
```bash
# From project root directory
make evaluator-metric-build    # Build Docker image
make evaluator-metric-test     # Run tests
make evaluator-metric-dev      # Run locally in development mode
```

### Complete Workflow
```bash
# From project root - all commands use the centralized build system
make evaluator-metric-deps     # Install dependencies (including ark-sdk)
make evaluator-metric-test     # Run test suite
make evaluator-metric-build    # Build Docker image
make evaluator-metric-install  # Deploy to Kubernetes cluster
```

### Update Deployment
```bash
# After making changes
make evaluator-metric-build    # Rebuild image
make evaluator-metric-install  # Update deployment
# OR manually:
kubectl rollout restart deployment evaluator-metric -n default
```

### Clean and Rebuild
```bash
make evaluator-metric-clean-stamps  # Remove stamps (forces rebuild)
make evaluator-metric-build         # Fresh build
```

## Build System

This service uses the centralized Makefile build system which provides:

- **Dynamic ark-sdk management**: Version controlled via `/version.txt`
- **Proper dependency tracking**: Rebuilds only when needed
- **Consistent tooling**: Same commands across all services
- **Docker integration**: Automated image building and pushing

The ark-sdk dependency is automatically resolved from the central build,
eliminating manual version management. When the version changes in `version.txt`,
all services automatically use the updated version.


## Configuration

The service automatically receives evaluation parameters from the Ark Evaluator custom resource
it has a dependency on the ark python sdk to load model definition and other information about queries etc..