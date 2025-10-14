# Model Custom Headers Test

Tests model configuration with custom HTTP headers from multiple sources.

## What it tests
- Custom header with static value
- Custom header resolved from Kubernetes Secret
- Custom header resolved from Kubernetes ConfigMap
- Multiple headers applied simultaneously
- Headers resolved during model initialization
- Headers applied to Azure OpenAI client
- Agent execution with model using custom headers
- Query completion with custom headers in HTTP requests

## Running
```bash
chainsaw test
```

Validates that models accept custom HTTP headers from static values, Secrets, and ConfigMaps, and that these headers are properly resolved and applied to all API requests.
