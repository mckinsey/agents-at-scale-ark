# Research-Analysis-Creation Tutorial

Learn how to build a complete research workflow using ARK's multi-agent capabilities through a hands-on, step-by-step tutorial. This tutorial follows an evaluation-driven methodology where each component is tested individually before progressing to the next step.

## What You'll Build

A sequential team of three specialized agents that work together to:
- **Researcher Agent**: Searches the web for information using DuckDuckGo
- **Analyst Agent**: Processes research data and generates insights  
- **Creator Agent**: Consolidates findings into professional documents

## ARK Project Structure Best Practice

This tutorial follows ARK's recommended project structure:

```
samples/walkthrough/
├── README.md (this tutorial)
├── agents/
│   ├── tests/
│   │   ├── queries/                          # Individual agent test queries
│   │   │   ├── analyst-query.yaml           # Query for analyst agent testing
│   │   │   ├── creator-query.yaml           # Query for creator agent testing
│   │   │   └── researcher-query.yaml        # Query for researcher agent testing
│   │   ├── chainsaw-analyst-test.yaml       # Individual analyst agent test
│   │   ├── chainsaw-creator-test.yaml       # Individual creator agent test
│   │   └── chainsaw-researcher-test.yaml    # Individual researcher agent test  
│   ├── README.md                            # Agent component guide
│   ├── analyst-agent.yaml
│   ├── creator-agent.yaml
│   └── researcher-agent.yaml
├── teams/
│   ├── tests/
│   │   └── chainsaw-test.yaml               # Test team creation
│   ├── README.md                            # Team component guide
│   └── research-team.yaml
├── tools/
│   ├── tests/
│   │   ├── queries/
│   │   │   └── web-search-query.yaml        # Query for tool testing
│   │   └── chainsaw-test.yaml               # Test tool functionality with query execution
│   ├── README.md                            # Tool component guide
│   └── web-search-tool.yaml
├── tests/                                   # End-to-end integration test
│   ├── chainsaw-test.yaml
│   └── manifests/...
├── kustomization.yaml                       # Declarative deployment
└── research-query.yaml                      # Sample query
```

**Key Benefits:**
- **Component isolation**: Test each piece individually
- **Progressive complexity**: Build from simple to complex
- **Evaluation-driven**: Validate before proceeding
- **Maintainable**: Clear organization and documentation

## Prerequisites

Install ARK by following the [quickstart guide](../../docs/content/developer-guide/01-quickstart.mdx):

```bash
# Quick installation (installs tools, sets up cluster, chainsaw, deploys controller)
devspace dev
```

Verify installation:
```bash
# Check ARK controller is running
kubectl get pods -n ark-system
```

### Environment Variables for Testing

The tests in this tutorial require Azure OpenAI credentials to execute queries. Set these environment variables before running any tests:

```bash
# Required for all chainsaw tests in this tutorial
export E2E_TEST_AZURE_OPENAI_KEY="your-azure-openai-api-key"
export E2E_TEST_AZURE_OPENAI_BASE_URL="https://your-resource.openai.azure.com/"
```
You can obtain these credentials from your Azure OpenAI service. If you don't have Azure OpenAI access, you can still follow the tutorial to understand the concepts, but the test execution steps will not work.

## Step 1: Create and Test Web Search Tool

### What You'll Learn
- How to define ARK tools for external APIs
- Tool schema definition and parameter configuration
- Testing individual tools with chainsaw

### Create the Tool
The web search tool uses DuckDuckGo's API to search the web and return structured results.

```bash
# View the tool definition
cat samples/walkthrough/tools/web-search-tool.yaml
```

Key features:
- DuckDuckGo API integration for web searches
- Configurable number of results (default: 5)
- Returns titles, snippets, and URLs in structured format

### Test the Tool
```bash
# Run tool-specific tests with query execution
chainsaw test samples/walkthrough/tools/tests/

# Expected: Tool created and functionality validated through query execution
```

The tool test includes:
- Tool resource creation and schema validation
- Query execution from `queries/web-search-query.yaml`
- Direct tool targeting to verify DuckDuckGo API integration
- Response content validation for search results
- Tool readiness verification for agent integration

### Expected Results
- Tool resource exists in cluster with correct schema
- Tool successfully executes web searches via DuckDuckGo API
- Query responses contain structured search results with titles, snippets, and URLs
- Tool is validated and ready for agent use

---

## Step 2: Create and Test Agents

### What You'll Learn
- How to create specialized agents with different capabilities
- Agent prompt engineering and structured output
- Model references and tool integration

### Create the Agents

#### Researcher Agent
Searches the web for information and structures findings:

```bash
# View the researcher agent
cat samples/walkthrough/agents/researcher-agent.yaml
```

Features:
- Web search tool integration
- Structured JSON output format
- Research methodology in prompt

#### Analyst Agent
Processes research data and generates insights:

```bash
# View the analyst agent  
cat samples/walkthrough/agents/analyst-agent.yaml
```

Features:
- Data validation and consistency checking
- Insight generation and trend analysis
- Recommendation synthesis

#### Creator Agent
Consolidates findings into professional documents:

```bash
# View the creator agent
cat samples/walkthrough/agents/creator-agent.yaml
```

Features:
- Document generation capabilities
- File system integration
- Professional formatting

### Test the Agents

**Option 1: Test all agents together**
```bash
# Run all agent tests together
chainsaw test samples/walkthrough/agents/tests/
```

**Option 2: Test each agent individually with dedicated queries**
```bash
# Navigate to the tests directory first
cd samples/walkthrough/agents/tests/

# Test researcher agent with web search functionality
chainsaw test . --test-file chainsaw-researcher-test.yaml

# Test analyst agent with data analysis capabilities  
chainsaw test . --test-file chainsaw-analyst-test.yaml

# Test creator agent with document generation (requires MCP filesystem server)
chainsaw test . --test-file chainsaw-creator-test.yaml
```

Each individual test includes:
- Complete environment setup (Azure model, RBAC permissions)
- Agent creation and validation
- Dedicated query file from `queries/` folder for realistic testing
- Query execution with agent-specific scenarios
- Response content validation and functional capability verification
- Proper cleanup after test completion

**Query Files Structure:**
- `queries/researcher-query.yaml`: Kubernetes research scenario
- `queries/analyst-query.yaml`: Data analysis with sample metrics
- `queries/creator-query.yaml`: Document creation with analysis data

### Expected Results
- All agent resources exist in cluster
- Agents reference the default model correctly
- Agents are ready for team integration

---

## Step 3: Create and Test Sequential Team

### What You'll Learn
- How to create teams with sequential strategy
- Team member configuration and execution flow
- Team testing and validation

### Create the Team
The sequential team orchestrates the three agents in order:

```bash
# View the team definition
cat samples/walkthrough/teams/research-team.yaml
```

Features:
- Sequential execution: Researcher → Analyst → Creator
- Automatic data passing between agents
- Maximum 3 turns for completion

### Test the Team
```bash
# Run team-specific tests
chainsaw test samples/walkthrough/teams/tests/

# Expected: Team created with correct members
```

### Expected Results
- Team resource exists in cluster
- Team references all three agents correctly
- Team strategy is configured as sequential

---

## Step 4: Execute Complete Research Workflow

### What You'll Learn
- How to deploy complete ARK applications
- End-to-end workflow execution
- Result monitoring and validation

### Deploy the Complete Workflow

First, set up the MCP filesystem server for document storage:
```bash
# Build and load the filesys MCP server image
cd mcp-servers/filesystem-mcp
docker build -t filesystem-mcp-server:latest .
# Load image into cluster (choose based on your setup)
kind load docker-image filesystem-mcp-server:latest        # For kind
minikube image load filesystem-mcp-server:latest           # For minikube
cd ../..

# Deploy filesystem MCP server
helm install mcp-filesystem mcp-servers/filesystem-mcp/chart --set image.repository=filesystem-mcp-server --set image.tag=latest

# Verify it's ready (should show READY=True)
kubectl get mcpservers
```

**Recommended: Deploy components in order to avoid dependency issues**

```bash
# Deploy the complete research workflow (in dependency order):
# 1. Deploy tools, agents, and team
kubectl apply -f samples/walkthrough/tools/web-search-tool.yaml
kubectl apply -f samples/walkthrough/agents/
kubectl apply -f samples/walkthrough/teams/

# 2. Wait for team to be ready, then deploy query
kubectl apply -f samples/walkthrough/research-query.yaml
```

**Alternative (may fail due to timing issues):**
```bash
# This approach may fail due to dependency timing issues
kubectl apply -k samples/walkthrough/
```

### Execute a Research Query
```bash
# Run a research query on Kubernetes adoption
kubectl apply -f samples/walkthrough/research-query.yaml

# Monitor progress - from running to done
kubectl get queries research-query -w
```

### Test the Complete Workflow
```bash
# Run end-to-end integration tests
chainsaw test samples/walkthrough/tests/

# Expected: Complete workflow executes successfully
```

### Expected Results
1. **Research Phase**: Web search results with sources and structured findings
2. **Analysis Phase**: Validated insights, trends, and recommendations  
3. **Creation Phase**: Professional document saved to file system

The complete workflow typically takes 2-3 minutes depending on research complexity.

---

## Step 5: Validate and Explore Results

### View Query Results
```bash
# Get detailed query results
kubectl get queries research-query -o yaml

# Check response content
kubectl get queries research-query -o jsonpath='{.status.response.content}'

# Or view the full response structure (JSON format)
kubectl get queries research-query -o jsonpath='{.status.response}' | jq '.'
```

### Access Generated Documents
```bash
# Port forward to file browser
kubectl port-forward svc/mcp-filesystem-filebrowser 8080:8080

# Open in browser and check the logs for credentials
kubectl logs deployment/mcp-filesystem-filebrowser | grep "User 'admin' initialized"
open http://localhost:8080

# Default credentials (check logs for actual password):
# Username: admin
# Password: [randomly generated - check logs above]
```

## Quick Start (Skip Tutorial)

If you want to deploy everything at once without the step-by-step tutorial:

```bash
# 1. Build and load the filesys MCP server image
cd mcp-servers/filesystem-mcp
docker build -t filesystem-mcp-server:latest .
kind load docker-image filesystem-mcp-server:latest
cd ../..

# Deploy MCP filesystem server
helm install mcp-filesystem mcp-servers/filesystem-mcp/chart --set image.repository=filesystem-mcp-server --set image.tag=latest

# Verify it's ready (should show READY=True)
kubectl get mcpservers

# 2. Deploy complete workflow (two-step approach to avoid dependency issues)
kubectl apply -f samples/walkthrough/tools/web-search-tool.yaml
kubectl apply -f samples/walkthrough/agents/
kubectl apply -f samples/walkthrough/teams/

# 3. Execute research query
kubectl apply -f samples/walkthrough/research-query.yaml

```

## Customization

### Modify Research Topic
Edit the query to research different topics:

```yaml
# research-query.yaml
spec:
  input: "Artificial Intelligence trends in healthcare 2024"
```

### Use Custom Models
Reference specific models for different agents:

```yaml
# In agent YAML files
spec:
  modelRef:
    name: your-custom-model
```

## Cleanup

```bash
# Remove the research workflow using kustomization.yaml
kubectl delete -k samples/walkthrough/

# Remove the MCP filesystem server  
helm uninstall mcp-filesystem

# Remove any test resources
kubectl delete queries --all
```

## Next Steps

- Explore other ARK samples in the `samples/` directory
- Learn about different team strategies (round-robin, graph-based)
- Integrate custom MCP servers for specialized tools
- Build more complex multi-agent workflows

## Troubleshooting

### Common Issues

**Agents not responding:**
```bash
# Check agent status
kubectl get agents
kubectl describe agent researcher

# Verify model is ready
kubectl get models
```

**If queries don't complete:**
```bash
# Check query status
kubectl describe query research-query

# Check agent and team status
kubectl get agents,teams

# View controller logs
kubectl logs -n ark-system deployment/ark-controller-manager
```

**Team execution fails:**
```bash  
# Check team configuration
kubectl describe team research-analysis-team

# View query events
kubectl get events --field-selector involvedObject.name=research-query
```

**MCP tools not working:**
```bash
# Check tool status
kubectl get tools
kubectl describe tool web-search

# Verify MCP server connectivity
kubectl get pods | grep mcp
```