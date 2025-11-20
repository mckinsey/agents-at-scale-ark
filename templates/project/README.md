# {{projectName}}

Agents at Scale project for building AI agents and teams.

## Quick Start (5 minutes)

```bash
# 1. Navigate to your project
cd {{ .Values.projectName }}

# 2. Set your API keys
source .env  # Edit this file first with your API keys

# 3. Deploy to your ARK cluster
devspace dev

# 4. Check your deployment
kubectl get agents,teams,queries --namespace {{ .Values.namespace }}
```

That's it! Your agents, teams, and queries are all running on Agents at Scale.

## What You Get

### Core Examples

- **`agents/sample-agent.yaml`** - Basic AI agent
- **`teams/sample-team.yaml`** - Simple team (single agent)
- **`queries/sample-query.yaml`** - Query to test your agent
- **`models/azure-model.yaml`** - Model and secret configuration

### Production Ready

- **Helm chart** that deploys agents, teams, queries, models, and tools
- **CI/CD pipeline** with GitHub Actions
- **Security** best practices and RBAC
- **Makefile** with all necessary commands

## Project Structure

```
{{ .Values.projectName }}/
├── agents/                 # Agent definitions
├── teams/                  # Team definitions
├── queries/                # Queries
├── models/                 # Model configurations
├── mcp-servers/            # MCP servers
├── tools/                  # Custom tools deployed as part of this project
├── scripts/                # Setup and utility scripts
├── docs/                   # Additional documentation
└── .github/                # CI/CD workflows
```

## Core Concepts

### Agents

Individual AI assistants with specific roles:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: sample-agent
spec:
  description: Sample agent demonstrating basic functionality
  prompt: 'You are a helpful AI assistant...'
  modelRef:
    name: azure-gpt4
```

### Teams

Groups of agents that collaborate:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: sample-team
spec:
  members:
    - name: sample-agent
      type: agent
  strategy: 'sequential'
```

### Queries

Inputs to agents or teams:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: sample-query
spec:
  input: 'Hello! Can you help me understand what you can do?'
  targets:
    - type: agent
      name: sample-agent
```

## Prerequisites

- Kubernetes cluster with ARK installed
- kubectl configured
- API key for OpenAI/Azure/Anthropic

## Commands

```bash
# Quick commands
make help          # Show all available commands
make quickstart   # 5-minute setup and deploy
make status        # Check deployment status

# Development
make dev           # Run in development mode
make test          # Run tests
make build         # Build all components

# Deployment
make install       # Deploy to ARK cluster
make upgrade       # Upgrade deployment
make uninstall     # Remove from cluster

# Utilities
make logs          # View logs
make debug         # Show debugging info
```

## Configuration

### Environment Variables

```bash
# Required: At least one API key
export OPENAI_API_KEY="your-key"
# OR
export AZURE_OPENAI_API_KEY="your-azure-key"
# OR
export ANTHROPIC_API_KEY="your-anthropic-key"

# Optional: Customize deployment
export NAMESPACE="your-namespace"
export PROJECT_NAME="your-project"
```

### Customize Values

Edit `chart/values.yaml` to configure:

- Model providers and API keys
- Resource limits and scaling
- Security policies
- Ingress settings

## Adding More

### More Agents

Create additional agents in `agents/`:

```yaml
# agents/my-agent.yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: my-agent
spec:
  description: My custom agent
  prompt: 'You are a specialist in...'
  modelRef:
    name: azure-gpt4
```

### More Teams

Create teams in `teams/` that reference your agents:

```yaml
# teams/my-team.yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: my-team
spec:
  members:
    - name: sample-agent
      type: agent
    - name: my-agent
      type: agent
  strategy: 'round-robin'
```

### MCP Servers

Create production-ready MCP servers using the ark CLI generator:

```bash
# Generate a new MCP server with full Kubernetes deployment
ark generate mcp-server my-server

# Choose from Node.js, Deno, Go, or Python
# Includes Dockerfile, Helm chart, and deployment scripts
# Creates example agents and queries for testing
```

This creates a complete MCP server in `mcp-servers/my-server/` with:

- Multi-technology support (Node.js, Deno, Go, Python)
- Production-ready Kubernetes deployment
- Authentication and configuration options
- Comprehensive documentation and examples

### Custom Tools

Create tools as Kubernetes YAML files in `tools/my-tool.yaml`:

```yaml
# tools/my-tool.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "{{ .Values.projectName }}.fullname" . }}-my-tool
  labels:
    {{- include "{{ .Values.projectName }}.labels" . | nindent 4 }}
    component: tool
spec:
  replicas: 1
  selector:
    matchLabels:
      {{- include "{{ .Values.projectName }}.selectorLabels" . | nindent 6 }}
      component: tool
  template:
    spec:
      containers:
      - name: my-tool
        image: "{{ .Values.image.registry }}/{{ .Values.project.name }}-my-tool:{{ .Values.image.tag }}"
        ports:
        - containerPort: 8000
          name: http
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "{{ .Values.projectName }}.fullname" . }}-my-tool
spec:
  ports:
  - port: 8000
    targetPort: http
  selector:
    {{- include "{{ .Values.projectName }}.selectorLabels" . | nindent 4 }}
    component: tool
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: MCPServer
metadata:
  name: my-tool
spec:
  address:
    valueFrom:
      serviceRef:
        name: {{ include "{{ .Values.projectName }}.fullname" . }}-my-tool
        port: 8000
        path: /mcp
  transport: sse
```

See `tools/example-tool.yaml.disabled` for a complete example.

**Tools vs MCP Servers:**

- **Tools** = Simple Kubernetes resources deployed as part of this project (YAML files in `tools/`)
- **MCP Servers** = Independent services with their own Helm charts, more complex deployments (generated in `mcp-servers/`)

## Different Model Providers

### Azure OpenAI

```bash
export AZURE_OPENAI_API_KEY="your-key"
# Model files are copied from samples/models/ during project creation
# Edit the copied files and set API keys in .env
```

### OpenAI

```bash
export OPENAI_API_KEY="your-key"
# Copy from samples: cp ../samples/models/openai.yaml models/
```

### AWS Bedrock

```bash
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
# Copy from samples: cp ../samples/models/claude.yaml models/
```

## Testing

```bash
# Validate configurations
make test

# Test specific components
make test-manifests  # Validate YAML files
make test-tools      # Test custom tools

# Manual testing
kubectl apply -f queries/sample-query.yaml
kubectl get query sample-query -o yaml
```

## Troubleshooting

### Common Issues

**Agent not responding**: Check model configuration and API keys

```bash
kubectl get models
kubectl describe agent sample-agent
```

**Tool not available**: Verify MCP server deployment

```bash
kubectl get mcpservers
kubectl logs -l component=tool
```

**Team issues**: Check agent references and team strategy

```bash
kubectl describe team sample-team
```

### Debug Commands

```bash
make debug         # Show debugging information
make logs          # View all logs
make status        # Check deployment status
```

## CI/CD

The template includes GitHub Actions for:

- **Linting** YAML and code
- **Building** container images
- **Testing** manifests and tools
- **Security scanning** with Trivy
- **Deploying** to staging/production

## Next Steps

1. **Customize the sample agent** in `agents/sample-agent.yaml`
2. **Add more agents** as separate YAML files
3. **Create teams** to coordinate multiple agents
4. **Build custom tools** when you need specialized functionality
5. **Set up CI/CD** for automated deployment

## Resources

- [ARK Documentation](https://mckinsey.github.io/agents-at-scale-ark/)
- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)
- [ARK Samples](../../samples/)

---

**Need help?** Check the troubleshooting section above or create an issue.
