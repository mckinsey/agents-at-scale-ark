# ARK Kubernetes Operator

**NEVER add comments** to generated code unless explicitly requested by the user

**ALWAYS run `make lint-fix` after generating or modifying Go code** to ensure code quality and fix auto-correctable linting issues

## Architecture

Kubernetes operator managing AI agents, models, queries, and multi-agent teams. Built with controller-runtime framework.

## Project Structure

### API Types (`/api/v1alpha1/`)
- **`agent_types.go`** - AI agents with prompts, models, tools, execution engines
- **`query_types.go`** - Execution requests with parameters, memory, attachments
- **`team_types.go`** - Multi-agent coordination with strategies (sequential, round-robin, graph, selector)
- **`model_types.go`** - AI model configs (OpenAI, Azure OpenAI, AWS Bedrock)
- **`tool_types.go`** - Extensible tools (built-in, HTTP fetchers, MCP servers)
- **`memory_types.go`** - Persistent conversation storage
- **`mcpserver_types.go`** - Model Context Protocol server integrations
- **`blobstorage_types.go`** - File/attachment storage system
- **`evaluation_types.go`** - AI evaluation and assessment framework

### Controllers (`/internal/controller/`)
- **`query_controller.go`** - Core orchestrator, handles execution and target resolution
- **`agent_controller.go`** - Agent lifecycle, model validation, tool resolution
- **`team_controller.go`** - Multi-agent coordination strategies
- **`model_controller.go`** - AI model configuration validation
- **`memory_controller.go`** - Conversation storage management
- **`blobstorage_controller.go`** - File attachment handling

### AI/ML Logic (`/internal/genai/`)
- **`agent.go`** - OpenAI-compatible chat completion execution
- **`model_*.go`** - Provider implementations (OpenAI, Azure, Bedrock)
- **`team_*.go`** - Multi-agent coordination strategies
- **`tools.go`** - Built-in tools, HTTP fetchers, MCP tool calling
- **`memory_*.go`** - Memory backend implementations
- **`query_parameters.go`** - Template resolution for dynamic prompts

### Webhooks (`/internal/webhook/v1/`)
- **`agent_webhook.go`** - Validates model refs, tool configs, parameters
- **`query_webhook.go`** - Validates targets, selectors, parameter consistency
- **`team_webhook.go`** - Validates member refs, strategy configs
- **`model_webhook.go`** - Validates provider-specific configurations
- **`tool_webhook.go`** - Validates tool types and MCP server refs

### Configuration (`/config/`)
- **`crd/bases/`** - Auto-generated CRD manifests
- **`rbac/`** - Per-resource RBAC roles (admin/editor/viewer)
- **`manager/`** - Operator deployment configuration
- **`webhook/`** - Admission webhook setup
- **`certmanager/`** - TLS certificate automation

## Build Commands

```bash
# Development
make dev           # Run in development mode
make generate      # Generate DeepCopy code
make manifests     # Generate CRDs and RBAC

# Build and Test
make build         # Build manager binary
make test          # Run tests with coverage
make fmt           # Format Go code
make vet           # Run Go vet

# Container and Deployment  
make docker-build  # Build Docker image
make deploy        # Deploy to K8s cluster

# Samples
make install-samples  # Deploy sample resources
```

## Key Patterns

### ValueSource Configuration
Resources support flexible configuration through `ValueSource`:
- Direct values
- ConfigMap/Secret references  
- Service references

### Parameter Templating
Dynamic prompt/input processing using Go templates with resource context.

### Multi-Agent Strategies
- **Sequential** - Execute agents in order
- **Round-robin** - Distribute queries across agents
- **Graph** - DAG-based execution flow
- **Selector** - Label-based agent targeting

### Tool Integration
- Built-in tools (web search, calculations)
- HTTP fetcher tools for API integration
- MCP server tools for external service integration

## Testing

### Unit Tests
```bash
make test          # Run all tests
go test ./internal/controller/... -v
go test ./internal/webhook/... -v
```