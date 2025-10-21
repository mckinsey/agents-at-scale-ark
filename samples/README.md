# Samples Directory

Examples demonstrating QBAF (QuantumBlack Agent Factory) capabilities. Shows how to create agents, teams, tools, and queries using Kubernetes Custom Resources.

## Quick Start

Deploy individual samples:
```bash
kubectl apply -f samples/quickstart/azure-openai-model.yaml
kubectl apply -f samples/agents/simple-agent-with-query.yaml
kubectl apply -f samples/agents/templated.yaml -f samples/agents/shared.yaml
kubectl apply -f samples/workflows/weather-forecast-workflow.yaml
```

## Organized Structure

```
samples/
├── quickstart/         # 🚀 Basic setup and getting started
├── agents/            # 🤖 Agent examples and configurations
├── teams/             # 👥 Team coordination and strategies
├── tools/             # 🛠️ Tool integrations and APIs
├── workflows/         # 🔄 Complete end-to-end workflows
├── queries/           # 🎯 Query patterns and targeting
├── memory/            # 🧠 Memory and conversation persistence
├── models/            # 🧠 Model configurations (LLMs)
└── mcp/               # 🔌 Model Context Protocol integrations
```

## Sample Categories

**⚠️ Important**: Each sample is designed to be deployed individually. Some samples have dependencies - check the Prerequisites section for each sample.

### 🚀 Quickstart Examples

#### `quickstart/azure-openai-model.yaml` - Azure OpenAI Model
Default Azure OpenAI model configuration.
- **Model**: `default` - Azure OpenAI GPT-4.1 Mini
- **Prerequisites**: Azure OpenAI secret (`azure-openai-secret`)
- **Use case**: Basic model setup
- **Deploy**: `kubectl apply -f samples/quickstart/azure-openai-model.yaml`

#### `quickstart/model.yaml` - Model Configuration  
Standalone model configuration.
- **Model**: Azure OpenAI with secrets
- **Prerequisites**: Azure OpenAI secret (`azure-openai-secret`)
- **Use case**: Model management
- **Deploy**: `kubectl apply -f samples/quickstart/model.yaml`

#### `quickstart/filesys.yaml` - File System MCP
File system operations via MCP.
- **MCPServer**: File system server
- **Agent**: File system assistant
- **Prerequisites**: None
- **Use case**: File operations
- **Deploy**: `kubectl apply -f samples/quickstart/filesys.yaml`

### 🤖 Agent Examples

#### `agents/simple-agent-with-query.yaml` - Simple Agent with Query
Basic agent with accompanying query example.
- **Agent**: `sample-agent` - Adds "amazing" to outputs
- **Query**: `sample-query` - Math calculation (2+2)
- **Prerequisites**: Default model or specify `modelRef`
- **Use case**: Single agent setup with query
- **Deploy**: `kubectl apply -f samples/agents/simple-agent-with-query.yaml`

#### `agents/agent-with-generatename.yaml` - Generated Names
Agent with Kubernetes generateName feature.
- **Prerequisites**: Required tools and model
- **Use case**: Dynamic agent naming
- **Deploy**: `kubectl apply -f samples/agents/agent-with-generatename.yaml`

#### `agents/built-in-tools-agent.yaml` - Built-in Tools
Agent with built-in tools.
- **Agent**: Uses `noop` and `terminate` tools
- **Prerequisites**: None (uses built-in tools)
- **Use case**: Built-in tool usage
- **Deploy**: `kubectl apply -f samples/agents/built-in-tools-agent.yaml`

#### `agents/templated.yaml` - Parameterized Agent
Agent with template parameters demonstrating shared configuration.
- **Agent**: `templated` - Uses Go template syntax with parameters
- **Parameters**: Direct value (`prefix`) and ConfigMap reference (`suffix`)
- **ConfigMap**: `shared` - Contains common behavior rules
- **Prerequisites**: None (includes required ConfigMap)
- **Use case**: Template processing with shared configuration
- **Deploy**: `kubectl apply -f samples/agents/templated.yaml -f samples/agents/shared.yaml`

**Template Features Demonstrated:**
- **Direct Values**: `prefix` parameter with immediate customization ("Always say Bazinga")
- **ConfigMap References**: `suffix` parameter from shared configuration
- **Go Template Syntax**: `{{.prefix}}` and `{{.suffix}}` in prompt
- **Shared Behavior**: Common response guidelines stored in ConfigMap for reuse across agents

This example shows how multiple agents can share common behavior patterns while allowing individual customization.

#### `rag-external-vectordb/` - RAG with External Vector Database
Complete RAG implementation with external vector database (pgvector) for persistent knowledge base.
- **Components**: pgvector database, Flask REST API, ARK HTTP Tools, ingestion scripts
- **Agent**: `rag-agent` - Knowledge base Q&A with semantic search
- **Tools**: `retrieve-chunks`, `search-by-metadata`, `get-document-stats`
- **Prerequisites**: 
  - Azure OpenAI account with API key
  - Kubernetes cluster
  - Docker for building retrieval service
- **Use case**: Production-ready RAG with persistent vector storage
- **Quick Deploy**:
  ```bash
  cd samples/rag-external-vectordb
  # Edit retrieval-service/deployment/azure-openai-secret.yaml with your credentials
  make rag-demo
  ```
- **Full Guide**: See `rag-external-vectordb/README.md` for complete setup

**RAG Features Demonstrated:**
- **Persistent Storage**: Vector database survives pod restarts
- **Semantic Search**: Azure OpenAI embeddings (1536 dimensions)
- **Custom HTTP Tools**: Flask REST API exposing retrieval endpoints
- **Data Ingestion**: Python script for loading documents with embeddings
- **End-to-End Workflow**: Database → API → Tools → Agent

For detailed implementation guide, see `docs/content/developer-guide/rag-implementation.mdx`.

### 👥 Team Examples

#### `team.yaml` - Sequential Team
Team with sequential execution.
- **Team**: `team-sample` - Single agent sequential
- **Strategy**: Sequential processing
- **Use case**: Team coordination

#### `sequential.yaml` - Sequential Processing
Multiple instances with sequential execution.
- **Team**: Multiple agents in sequence
- **Use case**: Multi-step workflows

#### `round-robin.yaml` - Round-Robin Strategy
Round-robin team execution with termination.
- **Agent**: `agent-rr` - Adds "Bazinga!", terminates after 3
- **Team**: `team-rr` - Round-robin strategy
- **Query**: Sheldon Cooper reference
- **Use case**: Iterative processing with termination

### 🛠️ Tool Examples

#### `fetcher.yaml` - HTTP Tools
HTTP fetcher tool for API calls.
- **Tool**: Weather API fetcher
- **Use case**: API integration

#### `fetcher-with-parameters.yaml` - Parameterized Tools
HTTP tools with parameters.
- **Tools**:
  - `weather-report-with-params` - Weather API with location
  - `generic-api-tool` - HTTP client
  - `github-repo-info` - GitHub API
- **Features**: URL templates, HTTP methods, headers
- **Use case**: API integrations with parameters

#### `coordinates.yaml` - Geocoding
Location services.
- **Tool**: `get-coordinates` - Geocoding API
- **Use case**: Location services

#### `label-selector-tools.yaml` - Label Selection
Tool organization using labels.
- **Tools**: Weather, news, stock, search APIs with labels
- **Labels**: `category`, `domain`, `priority`
- **Agent**: Uses label selectors
- **Use case**: Dynamic tool selection

### 🌤️ Weather System

#### `weather.yaml` - Weather System
Weather forecasting with tool chaining.
- **Tools**:
  - `get-coordinates` - City to coordinates
  - `get-gridpoints` - Grid point lookup
  - `get-forecast` - Weather forecast
- **Agent**: `weather-agent` - Weather assistant
- **Team**: `weather-team` - Round-robin processing
- **Use case**: Multi-step API workflows

### 🔌 MCP Integration

#### `mcp/github-external-mcp-server-sample.yaml` - Remote MCP Server
GitHub MCP server with authentication.
- **Secret**: GitHub token
- **MCPServer**: Remote GitHub API
- **Agent**: GitHub assistant
- **Features**: Header authentication
- **Use case**: External service integration

#### `mcp/github-stdio-mcp-server-sample.yaml` - Local MCP Server
Local MCP server with stdio.
- **MCPServer**: Local GitHub server
- **Transport**: stdio
- **Use case**: Local development

#### `mcp/local-mcp-server.yaml` - Development MCP Server
Local development server.
- **Use case**: MCP development

#### `filesys.yaml` - File System MCP
File system operations via MCP.
- **MCPServer**: File system server
- **Agent**: File system assistant
- **Use case**: File operations

### 🧠 Model Configuration

#### `models/model-with-properties.yaml` - Model Properties
Comprehensive examples of model configuration with properties.
- **Models**: Azure OpenAI, OpenAI, and Bedrock with custom properties
- **Properties**: Temperature, max_tokens, top_p, penalties, stop sequences
- **Features**: All supported ChatCompletion parameters
- **Use case**: Fine-tuning model behavior
- **Deploy**: `kubectl apply -f samples/models/model-with-properties.yaml`

#### `models/default.yaml` - Default Model
Basic Azure OpenAI model configuration.
- **Model**: Default Azure OpenAI setup
- **Prerequisites**: Azure OpenAI secret
- **Use case**: Standard model setup

#### `models/claude.yaml` - Anthropic Claude
AWS Bedrock Claude model configuration.
- **Model**: Claude via Bedrock
- **Prerequisites**: AWS credentials
- **Use case**: Claude integration

#### `models/gemini.yaml` - Google Gemini  
Google Gemini model configuration.
- **Model**: Gemini via Vertex AI
- **Prerequisites**: Google Cloud credentials
- **Use case**: Gemini integration


### 🧠 Memory Examples

#### `memory/memory-query-test.yaml` - Initial Memory Query
Initial conversation with memory persistence.
- **Query**: Introduces user information to agent
- **Memory**: `postgres-memory`
- **SessionId**: `test-session-001`
- **Use case**: Starting a persistent conversation

#### `memory/memory-followup-query.yaml` - Memory Followup
Follow-up query testing memory recall.
- **Query**: Tests agent memory of previous conversation
- **Memory**: `postgres-memory`
- **SessionId**: `test-session-001` (same session)
- **Use case**: Testing conversation continuity

#### `memory/memory-session-isolation.yaml` - Session Isolation
Demonstrates isolated user sessions.
- **Query**: User Alice introduces herself
- **Memory**: `postgres-memory`
- **SessionId**: `user-alice-session`
- **Use case**: User-specific conversation isolation

#### `memory/memory-different-session.yaml` - Different Session
Different user in separate session.
- **Query**: User Bob introduces himself, asks about Alice
- **Memory**: `postgres-memory`
- **SessionId**: `user-bob-session`
- **Use case**: Session isolation verification

#### `memory/memory-shared-session.yaml` - Shared Session
Shared conversation session for team collaboration.
- **Query**: Team project information
- **Memory**: `postgres-memory`
- **SessionId**: `team-project-session`
- **Use case**: Collaborative conversation memory

#### `memory/postgres-memory.yaml` - Memory Service
PostgreSQL-based memory service configuration.
- **Memory**: HTTP-based memory service
- **Backend**: PostgreSQL with session isolation
- **Use case**: Persistent conversation storage

### 🎯 Query Patterns

#### `queries/basic-query.yaml` - Simple Query
Basic query targeting a single agent.
- **Target**: Single agent
- **Query**: Simple math calculation
- **Use case**: Basic agent interaction

#### `queries/query-multiple-targets.yaml` - Multi-Target Queries
Querying multiple agents and teams.
- **Targets**: Multiple agents and teams
- **Query**: Single input to multiple processors
- **Use case**: Parallel processing

#### `queries/query-with-label-selectors.yaml` - Label Selector Queries
Dynamic target selection using label selectors.
- **Selector**: Label-based target discovery
- **Mixed mode**: Explicit targets + label selector
- **Query**: Selects agents and teams by labels
- **Use case**: Dynamic resource discovery

#### `queries/query-selectors-only.yaml` - Selector-Only Query
Query using only label selectors (no explicit targets).
- **Selector**: `matchLabels` for analyst role
- **Query**: Market trend analysis
- **Use case**: Pure label-based targeting


#### `queries/query-with-parameters.yaml` - Templated Query
Query with template parameters from multiple sources.
- **Parameters**: Direct values, ConfigMap refs, Secret refs
- **Template**: Go template syntax with dynamic values
- **Resources**: Supporting ConfigMaps and Secrets included
- **Use case**: Reusable queries with dynamic content

#### `queries/query-customer-specific.yaml` - Customer Onboarding
Enterprise customer onboarding with comprehensive parameters.
- **Parameters**: Customer details, configuration, and sensitive URLs
- **Security**: API endpoints and URLs stored in Secrets
- **Configuration**: Shared settings in ConfigMaps by industry/tier
- **Use case**: Customer-specific templated workflows

### 📋 Query Target Selection

Queries support three ways to select targets:

#### 1. Explicit Targets
```yaml
spec:
  targets:
    - type: agent
      name: specific-agent
    - type: team
      name: specific-team
```

#### 2. Label Selectors
```yaml
spec:
  selector:
    matchLabels:
      role: analyst
      tier: production
```

#### 3. Mixed Mode (Both)
```yaml
spec:
  targets:
    - type: agent
      name: backup-agent
  selector:
    matchExpressions:
      - key: category
        operator: In
        values: ["weather", "climate"]
```

**Label Selector Features:**
- **Dynamic Discovery**: Automatically finds agents/teams with matching labels
- **Unified Selection**: One selector finds both agents and teams
- **Kubernetes Standard**: Uses standard `LabelSelector` syntax
- **Match Expressions**: Supports `In`, `NotIn`, `Exists`, `DoesNotExist` operators
- **Match Labels**: Simple key-value matching

### 🎛️ Query Template Parameters

Queries support dynamic template parameters for reusable and secure query patterns:

#### Parameter Sources
```yaml
spec:
  parameters:
    # Direct values
    - name: environment
      value: "production"
    
    # ConfigMap references  
    - name: database_url
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: db-url
    
    # Secret references
    - name: api_key
      valueFrom:
        secretKeyRef:
          name: api-secrets
          key: service-key
```

#### Template Syntax
```yaml
spec:
  input: |
    Analyze {{.data_type}} in {{.environment}}:
    - Database: {{.database_url}}
    - API Key: {{.api_key}}
```

**Parameter Features:**
- **Go Templates**: Full Go template syntax support in query inputs
- **Multiple Sources**: Direct values, ConfigMaps, and Secrets
- **Security**: Sensitive data stored in Secrets, not query definitions
- **Validation**: Admission webhook validates all parameter references
- **Reusability**: Share parameter values across multiple queries
- **Flexibility**: Mix parameter sources within a single query


### ⚙️ Configuration

#### `config-manager/manager-setup.yaml` - System Configuration
Configuration management.
- **Use case**: System administration

#### `model.yaml` - Model Configuration
Standalone model configuration.
- **Model**: Azure OpenAI with secrets
- **Use case**: Model management

## Usage Patterns

### Getting Started
1. `complete-example.yaml` - Complete example
2. `agent.yaml` - Simple configuration
3. `weather.yaml` - Multi-tool workflow
4. `queries/basic-query.yaml` - Simple query
5. `queries/query-with-parameters.yaml` - Templated query

### Tool Development
1. `fetcher.yaml` - Basic HTTP API
2. `fetcher-with-parameters.yaml` - Complex APIs
3. `label-selector-tools.yaml` - Tool organization

### Team Coordination
1. `team.yaml` - Basic teams
2. `round-robin.yaml` - Iterative processing
3. `sequential.yaml` - Complex workflows

### External Integrations
1. MCP samples in `mcp/` - External services
2. `models/ollama.yaml` - Self-hosted models
3. `filesys.yaml` - File operations

## Prerequisites

1. **Kubernetes cluster** with QBAF operator deployed
2. **Individual deployment**: Deploy samples one by one based on your needs
3. **API credentials** as secrets (only for samples that require them):

   ```bash
   # For Azure OpenAI samples
   kubectl create secret generic azure-openai-secret \
     --from-literal=api-key="your-key" \
     --from-literal=api-version="2024-02-15-preview"
   
   # For GitHub MCP samples
   kubectl create secret generic github-token \
     --from-literal=token="your-github-pat"
   ```

4. **Model dependencies**: Some samples require specific models to be deployed first
5. **Tool dependencies**: Some agents require tools to be deployed before the agent

## Recommended Deployment Order

For first-time users, deploy samples in this order:

1. **Setup secrets** (if using Azure OpenAI):
   ```bash
   kubectl create secret generic azure-openai-secret \
     --from-literal=api-key="your-key" \
     --from-literal=api-version="2024-02-15-preview"
   ```

2. **Deploy a model**:
   ```bash
   kubectl apply -f samples/quickstart/azure-openai-model.yaml
   ```

3. **Deploy a simple agent**:
   ```bash
   kubectl apply -f samples/agents/simple-agent-with-query.yaml
   ```

4. **Try more complex examples**:
   ```bash
   kubectl apply -f samples/tools/weather-api-tool.yaml
   kubectl apply -f samples/workflows/weather-forecast-workflow.yaml
   ```

## Monitoring

```bash
kubectl get agents
kubectl get teams
kubectl get queries
kubectl describe query query-sample
kubectl get mcpservers
kubectl logs -l app=agent-go-controller-manager
```

## Architecture Patterns

- **Single Agent**: AI agent with model
- **Multi-Agent Teams**: Agent collaboration
- **Tool Integration**: External API integration
- **MCP Protocol**: Model Context Protocol
- **Local Models**: Self-hosted deployment
- **Label Selection**: Dynamic resource discovery
- **Secret Management**: Credential handling
- **Service Discovery**: Kubernetes service integration

## Customization

1. Modify prompts in agent specs
2. Change models by updating references
3. Add tools by creating Tool resources
4. Adjust team strategies (sequential, round-robin)
5. Configure timeouts and parameters

## Contributing

1. Place samples in appropriate subdirectory
2. Update this README
3. Include metadata and labels
4. Test with `kubectl apply -k samples/`
5. Update `kustomization.yaml`

See [project documentation](runtime/docs/).
