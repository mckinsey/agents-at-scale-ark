# ARK System Deep Dive

## Executive Summary

**ARK (Agentic Runtime for Kubernetes)** is a Kubernetes-native platform for orchestrating AI agent teams. It provides CRDs (Custom Resource Definitions) for agents, teams, queries, tools, models, and memory, enabling declarative management of agentic workloads.

**Core Value Proposition**: Abstract away infrastructure plumbing so teams can build agentic applications faster and reliably on Kubernetes.

---

## System Architecture

### Architecture Overview: Kubernetes Operator + Supporting Services

ARK follows a **hybrid architecture** pattern:

1. **Core Controller (Go)**: Kubernetes operator that manages the lifecycle of ARK resources
2. **Supporting Services (Python/TypeScript)**: Standalone services that provide APIs, UIs, and specialized functionality

This design separates concerns:
- **Controller**: Watches Kubernetes resources, executes agents/teams, manages state (Go for performance and K8s integration)
- **Services**: Provide REST APIs, web UIs, and domain-specific features (Python/TypeScript for ecosystem/library access)

### High-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                     │
│                                                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │         ARK Controller (Go) - Kubernetes Operator  │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  Watches: Agent, Team, Query, Tool, Model   │  │ │
│  │  │  Executes: Agent/Team logic, LLM calls       │  │ │
│  │  │  Manages: State, memory, events, telemetry  │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  ark-api     │  │  Dashboard   │  │  Memory      │ │
│  │  (Python)    │  │  (React)      │  │  (TypeScript)│ │
│  │  REST API    │  │  Web UI      │  │  Service     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  MCP Server  │  │  Evaluator   │  │  Other       │ │
│  │  (Python)     │  │  (Python)    │  │  Services    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Kubernetes CRDs: Agent, Team, Query, Tool, Model │ │
│  │  (Stored in etcd, managed by controller)            │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### What is a Kubernetes Controller?

A **controller** (also called an **operator**) is a special Kubernetes component that implements the **control loop pattern**:

1. **Watch**: Continuously monitors Kubernetes resources (via the Kubernetes API)
2. **Reconcile**: Compares desired state (what you declared) with actual state (what exists)
3. **Act**: Takes actions to make actual state match desired state
4. **Repeat**: Loops forever, reacting to changes

**Example**: When you create a `Query` CRD, the `QueryReconciler` controller:
1. **Watch**: Detects the new Query resource via Kubernetes API watch
2. **Reconcile**: Compares desired state (Query with `status.phase: Pending`) vs actual state
3. **Act**: 
   - Reads Query spec (target agent, input message)
   - Loads Agent CRD
   - Executes agent with LLM
   - Saves conversation to memory
4. **Update**: Sets `status.phase: Done` and `status.responses: [...]`
5. **Repeat**: Controller watches for new Queries or changes to existing ones

**Real Code Example** (simplified):
```go
// From query_controller.go
func (r *QueryReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. Fetch the Query resource
    query := &arkv1alpha1.Query{}
    r.Get(ctx, req.NamespacedName, query)
    
    // 2. Check current state
    if query.Status.Phase == statusDone {
        return ctrl.Result{}, nil  // Already done, nothing to do
    }
    
    // 3. Update status to Running
    query.Status.Phase = statusRunning
    r.Update(ctx, query)
    
    // 4. Execute the query (agent/team)
    responses, err := r.executeAgent(ctx, query, ...)
    
    // 5. Update status with results
    query.Status.Phase = statusDone
    query.Status.Responses = responses
    r.Update(ctx, query)
    
    return ctrl.Result{}, nil
}
```

This function is called **automatically** by controller-runtime whenever:
- A new Query is created
- An existing Query is modified
- The controller restarts (reconciles all existing Queries)

**Why Go for the Controller?**
- **Performance**: Go is fast and efficient for concurrent operations
- **Kubernetes Ecosystem**: Most K8s tools/libraries are written in Go
- **controller-runtime**: Mature framework (`sigs.k8s.io/controller-runtime`) provides battle-tested patterns
- **Resource Management**: Low overhead for long-running processes watching many resources

### Entry Point: `ark/cmd/main.go`

The controller is a **Kubernetes operator** built with:
- **controller-runtime**: Kubernetes controller framework that provides:
  - Watch/Reconcile infrastructure
  - RBAC management
  - Event recording
  - Leader election (for HA)
- **Go 1.21+**: Programming language
- **Kubebuilder**: Code generator for CRDs, controllers, and webhooks

**Key Controllers Registered**:
1. **`QueryReconciler`** - **Core orchestrator**: Handles query execution, agent/team invocation, memory management
2. `AgentReconciler` - Validates Agent CRDs, ensures agents are properly configured
3. `TeamReconciler` - Validates Team CRDs, ensures team members exist
4. `ToolReconciler` - Manages Tool CRDs, validates tool configurations
5. `ModelReconciler` - Manages Model CRDs, validates model configurations
6. `MemoryReconciler` - Manages Memory CRDs (storage backends)
7. `ExecutionEngineReconciler` - Manages external execution engines
8. `MCPServerReconciler` - Discovers and manages MCP (Model Context Protocol) servers
9. `A2AServerReconciler` - Manages Agent-to-Agent protocol servers
10. `EvaluatorReconciler` - Manages evaluation resources

**How Controllers Work Together**:
- **QueryReconciler** is the "brain" - it reads Query CRDs and orchestrates execution
- Other controllers are "validators" - they ensure resources are valid before QueryReconciler uses them
- Example flow: User creates Query → QueryReconciler reads Query → Reads Agent CRD → AgentReconciler already validated it → Execute agent

**Webhooks** (validation and mutation):
- **Admission Webhooks**: Validate resources **before** they're stored in Kubernetes
- **Mutation Webhooks**: Automatically modify resources (e.g., set defaults)
- Resources with webhooks: Team, Agent, Query, Tool, Model, MCPServer, Evaluator, Evaluation, A2AServer, ExecutionEngine

### Controller vs Services: Why the Split?

**Controller (Go)**:
- **Purpose**: Core orchestration logic, resource management
- **Runs**: Inside Kubernetes cluster as a Deployment
- **Responsibilities**:
  - Watches CRDs (Agent, Team, Query, etc.)
  - Executes agent/team logic
  - Makes LLM API calls
  - Manages state transitions
  - Records events and telemetry

**Services (Python/TypeScript)**:
- **Purpose**: User-facing APIs, UIs, specialized functionality
- **Runs**: Separate Deployments in Kubernetes
- **Responsibilities**:
  - **ark-api**: REST API for creating/managing resources
  - **ark-dashboard**: Web UI for interacting with ARK
  - **ark-cluster-memory**: Conversation persistence service
  - **ark-mcp**: MCP protocol server
  - **ark-evaluator**: Evaluation framework

**Communication Pattern**:
```
User → ark-api (REST) → Creates Query CRD → Kubernetes API
                                              ↓
                                    QueryReconciler (Controller)
                                              ↓
                                    Executes Agent/Team
                                              ↓
                                    Updates Query Status
                                              ↓
                                    User polls ark-api for results
```

**Why Not All in Go?**
- **Python**: Rich AI/ML ecosystem (OpenAI SDK, LangChain, evaluation frameworks)
- **TypeScript**: Better for web UIs, React ecosystem, type safety for frontend
- **Separation of Concerns**: Controller focuses on orchestration, services focus on user experience

---

## Core Execution Flow

### Query Execution Lifecycle

```
User/Client
    │
    ├─► Creates Query CRD
    │   └─► spec.targets: [agent/team/model/tool]
    │   └─► spec.input: user message
    │   └─► spec.sessionId: optional session ID
    │
    ▼
Query Controller (Reconcile)
    │
    ├─► Status: Pending → Running
    │
    ├─► Setup Phase:
    │   ├─► Create impersonated K8s client (for RBAC)
    │   ├─► Initialize Memory interface (from Memory CRD)
    │   ├─► Create EventStream (for SSE streaming)
    │   └─► Create TokenUsageCollector (for telemetry)
    │
    ├─► Load History from Memory
    │   └─► Previous messages in conversation
    │
    ├─► Execute Each Target (async goroutine):
    │   │
    │   ├─► Agent Target:
    │   │   ├─► Load Agent CRD
    │   │   ├─► MakeAgent() → Build Agent struct
    │   │   ├─► agent.Execute()
    │   │   │   ├─► Execute locally (with LLM)
    │   │   │   ├─► Execute via ExecutionEngine
    │   │   │   └─► Execute via A2A (Agent-to-Agent)
    │   │   └─► Save messages to Memory
    │   │
    │   ├─► Team Target:
    │   │   ├─► Load Team CRD
    │   │   ├─► MakeTeam() → Build Team struct
    │   │   ├─► team.Execute()
    │   │   │   ├─► Based on strategy (sequential/round-robin/selector/graph)
    │   │   │   ├─► Execute each member in sequence
    │   │   │   └─► Accumulate messages
    │   │   └─► Save messages to Memory
    │   │
    │   ├─► Model Target:
    │   │   └─► Direct LLM call (no agent)
    │   │
    │   └─► Tool Target:
    │       └─► Execute tool function
    │
    ├─► Collect Responses
    │
    ├─► Update Query Status:
    │   ├─► Status: Running → Done/Error
    │   └─► Status.Responses: Array of responses
    │
    └─► Emit Events (K8s Events + Telemetry)
```

### Key Files:
- **`ark/internal/controller/query_controller.go`**: Main reconciliation logic
- **`ark/internal/genai/team.go`**: Team execution orchestration
- **`ark/internal/genai/agent.go`**: Agent execution logic
- **`ark/internal/genai/query.go`**: Query message preparation

---

## Team Execution Strategies

Teams orchestrate multiple agents (members) to work together. Four strategies are supported:

### 1. Sequential Strategy

**How it works**: Members execute in order, one after another.

```go
// From team.go:executeSequential()
for i, member := range t.Members {
    err := t.executeMemberAndAccumulate(ctx, member, userInput, &messages, &newMessages, i)
    // Continue to next member
}
```

**Use case**: Fixed workflow where each agent must complete before the next starts.

**Example**:
```yaml
strategy: sequential
members:
  - name: researcher
  - name: analyst
  - name: writer
```

---

### 2. Round-Robin Strategy

**How it works**: Cycle through members in order, repeating until termination.

```go
// From team.go:executeRoundRobin()
for turn := 0; ; turn++ {
    memberIndex := turn % len(t.Members)
    member := t.Members[memberIndex]
    // Execute member
    // Check for termination conditions
}
```

**Use case**: Collaborative conversation where each member takes turns.

**Example**:
```yaml
strategy: round-robin
maxTurns: 10  # Optional limit
members:
  - name: researcher
  - name: analyst
  - name: writer
```

---

### 3. Graph Strategy

**How it works**: Deterministic workflow following graph edges (one-to-one transitions).

```go
// From team_graph.go:executeGraph()
transitionMap := make(map[string]string)  // One-to-one mapping
for _, edge := range t.Graph.Edges {
    transitionMap[edge.From] = edge.To
}

currentMember := t.Members[0]
for {
    // Execute current member
    nextMember := transitionMap[currentMember]
    if nextMember == "" {
        break  // No more transitions
    }
    currentMember = nextMember
}
```

**Key constraints**:
- **One-to-one**: Only one edge allowed per `from` node
- **Deterministic**: No AI involved, follows exact path
- **Current node**: `from` node
- **Next node**: `to` node from edge

**Use case**: Fixed workflow with clear dependencies.

**Example**:
```yaml
strategy: graph
graph:
  edges:
    - from: researcher
      to: analyst
    - from: analyst
      to: writer
members:
  - name: researcher
  - name: analyst
  - name: writer
```

**Validation**: Prevents multiple edges from same `from` node (line 182-184 in `team_webhook.go`).

---

### 4. Selector Strategy

**How it works**: AI selector agent chooses the next member to execute.

```go
// From team_selector.go:executeSelector()
for turn := 0; ; turn++ {
    // Build prompt with:
    // - All team members (candidates)
    // - Roles/descriptions
    // - Conversation history
    
    // Call selector agent (AI)
    selectedMember := selectorAgent.Execute(ctx, prompt)
    
    // Execute selected member
    // Continue loop
}
```

**Key components**:
- **Selector Agent**: AI agent specified in `selector.agent` field
- **Selector Prompt**: Customizable prompt template (default provided)
- **Candidates**: All team members (unless graph-constrained)

**Use case**: Dynamic conversation where AI decides optimal next speaker.

**Example**:
```yaml
strategy: selector
selector:
  agent: coordinator  # The AI agent that selects next member
  selectorPrompt: "..."  # Optional custom prompt
members:
  - name: researcher
  - name: analyst
  - name: writer
```

---

### 5. Graph-Selector Hybrid (Feature Branch: `feat/graph-selector-hybrid`)

**How it works**: AI selector agent constrained to legal graph transitions.

```go
// From team_selector.go:executeSelector() (enhanced)
legalTransitions := make(map[string][]string)  // One-to-many
if t.Graph != nil {
    for _, edge := range t.Graph.Edges {
        legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
    }
}

for turn := 0; ; turn++ {
    if previousMember == "" {
        // First turn: use first member
        nextMember = t.Members[0]
    } else if len(legalTransitions) > 0 {
        legal := legalTransitions[previousMember]
        
        if len(legal) == 0 {
            // No legal transitions - fallback
        } else if len(legal) == 1 {
            // Single option - skip AI, use directly (optimization)
            nextMember = legal[0]
        } else {
            // Multiple options - filter candidates and use selector agent
            candidates := filterMembers(t.Members, legal)
            nextMember = selectMemberWithFilter(ctx, candidates, ...)
        }
    } else {
        // No graph: use standard selector (all members)
        nextMember = selectMember(ctx, t.Members, ...)
    }
}
```

**Key features**:
- **One-to-many graph**: Multiple edges allowed from same `from` node
- **AI-driven**: Selector agent chooses from legal options
- **Optimization**: Skips AI call when only one legal transition
- **Backward compatible**: Graph is optional, existing selector teams unaffected

**Use case**: Workflow with AI-driven decision points.

**Example**:
```yaml
strategy: selector
selector:
  agent: coordinator
graph:
  edges:
    - from: researcher
      to: analyst
    - from: researcher
      to: writer  # Multiple options - AI chooses
    - from: analyst
      to: writer  # Single option - no AI needed
members:
  - name: researcher
  - name: analyst
  - name: writer
```

**Implementation notes**:
- **Validation**: Allow multiple edges when `strategy: selector` + `graph` provided
- **Code location**: `ark/internal/genai/team_selector.go:executeSelector()`
- **Matches LegacyX pattern**: `LXSelectorGroupChatManager` subclassed selector to add constraints

---

## Agent Execution Modes

Agents can execute in three ways:

### 1. Local Execution (Standard)

```go
// From agent.go:executeLocally()
messages, err = a.executeLocally(ctx, userInput, history, memory, eventStream)
```

**How it works**:
- Uses LLM model configured in Agent CRD
- Executes in controller process
- Supports tools, streaming, memory

**Configuration**:
```yaml
apiVersion: genai.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: researcher
spec:
  prompt: "You are a research assistant..."
  model:
    name: gpt-4
  tools:
    - name: search
```

---

### 2. Execution Engine

```go
// From agent.go:executeWithExecutionEngine()
engineClient := NewExecutionEngineClient(a.client)
// Send agent config + messages to external execution engine
```

**How it works**:
- Agent config sent to external execution engine (HTTP service)
- Execution engine handles LLM calls and tool execution
- Useful for custom execution environments (e.g., LangChain)

**Configuration**:
```yaml
apiVersion: genai.mckinsey.com/v1alpha1
kind: Agent
spec:
  executionEngine:
    name: langchain-engine
    namespace: default
```

**Files**:
- `ark/internal/genai/execution_engine.go`: Execution engine client
- `services/executor-langchain/`: Example LangChain execution engine

---

### 3. A2A (Agent-to-Agent)

```go
// From agent.go:executeWithA2AExecutionEngine()
if a.ExecutionEngine.Name == ExecutionEngineA2A {
    messages, err = a.executeWithA2AExecutionEngine(ctx, userInput, eventStream)
}
```

**How it works**:
- Uses A2A protocol for agent-to-agent communication
- Agents can discover and communicate with each other
- Supports task delegation and collaboration

**Configuration**:
```yaml
apiVersion: genai.mckinsey.com/v1alpha1
kind: Agent
spec:
  executionEngine:
    name: a2a  # Reserved name
```

**Files**:
- `ark/internal/genai/a2a.go`: A2A execution logic
- `services/ark-api-a2a/`: A2A API service

---

## Memory & Context Management

### Memory Interface

```go
// From memory.go
type MemoryInterface interface {
    AddMessages(ctx context.Context, queryID string, messages []Message) error
    GetMessages(ctx context.Context, queryID string) ([]Message, error)
    ClearMessages(ctx context.Context, queryID string) error
}
```

**Implementations**:
1. **Memory CRD** (`arkv1alpha1.Memory`): Kubernetes-native memory
2. **Memory HTTP** (`memory_http.go`): External memory service
3. **Memory NoOp** (`memory_noop.go`): No-op for testing

**Usage**:
- Query controller loads history: `memory.GetMessages(ctx, queryID)`
- After execution: `memory.AddMessages(ctx, queryID, newMessages)`
- Session-aware: Uses `spec.sessionId` from Query CRD

**Files**:
- `ark/internal/genai/memory.go`: Interface definition
- `ark/internal/genai/memory_http.go`: HTTP implementation
- `services/ark-cluster-memory/`: Cluster memory service

---

## Event Streaming

### EventStream Interface

```go
// From types.go
type EventStreamInterface interface {
    EmitEvent(ctx context.Context, eventType string, eventName string, event interface{}) error
}
```

**Purpose**: Real-time event streaming to clients (SSE - Server-Sent Events)

**Event Types**:
- `AgentExecutionStart`: Agent execution begins
- `AgentExecutionComplete`: Agent execution completes
- `ToolCallStart`: Tool execution begins
- `ToolCallComplete`: Tool execution completes
- `TeamTurn`: Team member turn starts/completes
- `TargetExecutionComplete`: Query target completes

**Usage**:
- Query controller creates EventStream from Query CRD
- Agents and teams emit events during execution
- Clients receive real-time updates via SSE

**Files**:
- `ark/internal/genai/types.go`: Event definitions
- `services/ark-api/`: API service that handles SSE streaming

---

## Telemetry & Observability

### Telemetry Provider

```go
// From internal/telemetry/
type Provider interface {
    QueryRecorder() QueryRecorder
    AgentRecorder() AgentRecorder
    TeamRecorder() TeamRecorder
}
```

**Span Types**:
1. **Query Span**: Entire query lifecycle
2. **Target Span**: Single target execution (agent/team/model/tool)
3. **Agent Span**: Agent execution
4. **Turn Span**: Team member turn

**Metadata Tracked**:
- Session ID
- Query ID
- Target type/name
- Input/output content
- Token usage
- Execution time

**Files**:
- `ark/internal/telemetry/`: Telemetry implementation
- `ark/internal/genai/execution_recorder.go`: Event recording

---

## Tools & MCP Integration

### Tool Registry

```go
// From agent_tools.go
type ToolRegistry struct {
    tools map[string]ToolDefinition
}
```

**Tool Sources**:
1. **Tool CRDs**: Kubernetes-native tools
2. **MCP Servers**: Model Context Protocol servers
3. **Built-in Tools**: System-provided tools

**MCP (Model Context Protocol)**:
- Standardized protocol for external integrations
- Supports tools, resources, prompts
- ARK can discover and use MCP servers

**Files**:
- `ark/internal/genai/tools.go`: Tool registry
- `ark/internal/genai/mcp.go`: MCP client
- `services/ark-mcp/`: MCP server implementation

---

## Services Architecture

### 1. ark-api (Python FastAPI)

**Purpose**: REST API for interacting with ARK resources

**Key Endpoints**:
- `/api/v1/queries`: Query execution
- `/api/v1/agents`: Agent management
- `/api/v1/teams`: Team management
- `/api/v1/tools`: Tool management
- `/api/v1/models`: Model management
- `/graphql`: GraphQL API (some services)

**Files**:
- `services/ark-api/ark-api/src/ark_api/`: Main API code

---

### 2. ark-dashboard (React/TypeScript)

**Purpose**: Web UI for managing ARK resources

**Features**:
- Agent/Team/Query/Tool/Model management
- Query execution interface
- Real-time streaming updates
- Team editor with graph visualization

**Files**:
- `services/ark-dashboard/ark-dashboard/`: React application

---

### 3. ark-cluster-memory (TypeScript/Node.js)

**Purpose**: Cluster-wide memory service for conversation persistence

**Features**:
- Stores messages per query/session
- HTTP API for memory operations
- Kubernetes-native storage

**Files**:
- `services/ark-cluster-memory/`: Memory service

---

### 4. ark-mcp (Python)

**Purpose**: MCP server implementation for ARK

**Features**:
- Exposes ARK resources as MCP tools
- Supports MCP protocol (SSE/HTTP)

**Files**:
- `services/ark-mcp/`: MCP server

---

### 5. ark-evaluator (Python)

**Purpose**: Evaluation framework for agents

**Features**:
- Evaluates agent performance
- Supports multiple evaluation strategies
- Integrates with RAGAS and other frameworks

**Files**:
- `services/ark-evaluator/`: Evaluator service

---

## Key Design Patterns

### 1. Kubernetes-Native

- **CRDs**: All resources defined as Kubernetes Custom Resources
- **Controllers**: Reconcile desired state
- **RBAC**: Kubernetes RBAC for access control
- **Events**: Kubernetes Events for observability

### 2. Declarative Configuration

- **YAML**: All resources defined in YAML
- **GitOps**: Resources can be managed via GitOps
- **Versioning**: CRD versioning for schema evolution

### 3. Pluggable Execution

- **Execution Engines**: External execution engines supported
- **Memory Interfaces**: Multiple memory implementations
- **Model Providers**: Multiple LLM providers (OpenAI, Azure, Bedrock, Generic)

### 4. Telemetry-First

- **Spans**: OpenTelemetry spans for tracing
- **Events**: Structured events for observability
- **Metrics**: Token usage and execution metrics

---

## Testing Strategy

### Test Structure

```
tests/
├── agent-*          # Agent execution tests
├── team-*            # Team strategy tests
├── query-*           # Query execution tests
├── model-*           # Model tests
├── mcp-*             # MCP integration tests
└── evaluation-*      # Evaluation tests
```

**Test Format**: Each test directory contains:
- `*.yaml`: Test resources (Agent, Team, Query, etc.)
- `README.md`: Test description and expected behavior

**Test Execution**: Uses `chainsaw` for end-to-end testing

---

## Development Workflow

### Local Development

```bash
# Run controller locally
make dev

# Run tests
make test

# Generate code
make generate
make manifests
```

### Service Development

```bash
# Services use DevSpace for local development
devspace dev

# Services have their own Makefiles
cd services/ark-api
make dev
```

---

## Key Insights

### 1. Graph-Selector Hybrid Design

**Decision**: Enhanced existing `selector` strategy rather than creating new `graph-selector` strategy.

**Rationale**:
- Matches LegacyX pattern (selector base + constraints)
- Minimal code changes
- Backward compatible
- Clear mental model: "AI selector with optional workflow constraints"

**Implementation**: Graph constraints filter selector agent's candidate list.

### 2. Execution Modes

**Three modes**:
- Local: Standard LLM execution in controller
- Execution Engine: External execution service
- A2A: Agent-to-agent protocol

**Flexibility**: Allows different execution environments while maintaining same Agent interface.

### 3. Memory & Session Management

**Session-aware**: Queries can share `sessionId` for conversation continuity.

**Memory abstraction**: Interface allows different storage backends (K8s CRD, HTTP service, etc.).

### 4. Telemetry Integration

**OpenTelemetry**: Full tracing support with spans and events.

**Token tracking**: TokenUsageCollector aggregates token usage across execution.

---

## Future Enhancements (From Code Analysis)

### 1. Graph-Selector Hybrid (In Progress)

- Feature branch: `feat/graph-selector-hybrid`
- Status: Implementation in progress
- Validation changes needed for multiple edges

### 2. Execution Engine Support

- Already implemented for external execution engines
- Potential for more execution engine types

### 3. Enhanced Memory Options

- Multiple memory implementations available
- Potential for more storage backends

---

## Key Files Reference

### Core Execution
- `ark/cmd/main.go`: Controller entry point
- `ark/internal/controller/query_controller.go`: Query reconciliation
- `ark/internal/genai/team.go`: Team execution
- `ark/internal/genai/agent.go`: Agent execution
- `ark/internal/genai/team_selector.go`: Selector strategy
- `ark/internal/genai/team_graph.go`: Graph strategy

### Graph-Selector Hybrid
- `ark/internal/genai/team_selector.go`: Enhanced selector with graph constraints
- `ark/internal/webhook/v1/team_webhook.go`: Validation logic

### Documentation
- `docs/reviews/graph-selector-implementation-plan.md`: Implementation plan
- `docs/reviews/strategy-approach-analysis.md`: Strategy design analysis
- `docs/reviews/current-selector-explanation.md`: Current selector explanation

---

## Conclusion

ARK is a **sophisticated Kubernetes-native platform** for orchestrating AI agent teams. It provides:

1. **Declarative Management**: CRDs for all resources
2. **Flexible Execution**: Multiple strategies and execution modes
3. **Observability**: Comprehensive telemetry and event streaming
4. **Extensibility**: Pluggable execution engines, memory, and tools
5. **Kubernetes Integration**: Native RBAC, events, and resource management

The system is designed for **production use** with proper error handling, telemetry, and scalability considerations.

