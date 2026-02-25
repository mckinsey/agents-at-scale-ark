# Ark Component Showcase — Argo Workflow Demo

## Goal

A single Argo WorkflowTemplate that demonstrates all core Ark components to a technical audience: Model, Agent, Tool (HTTP), MCP Server, A2A Server, and Team.

## Workflow DAG

```
                          ┌─→ Agent + HTTP Tool (weather) ─┐
Step 1: Model Query ──────┤                                ├──→ Step 3: Team Query
  (direct LLM call)       ├─→ Agent + MCP Server           │   (sequential team)
                          └─→ A2A Server Query ────────────┘
```

- **Step 1 (Sequential):** Direct Model query — simplest Ark primitive
- **Steps 2a/2b/2c (Parallel):** Agent+Tool, Agent+MCP, A2A — three component types simultaneously
- **Step 3 (Sequential):** Team query — multi-agent orchestration after parallel block completes

## Resource Mapping

| Step | Component | Existing Sample |
|------|-----------|----------------|
| 1 | Model | `samples/models/default.yaml` |
| 2a | Agent + HTTP Tool | `samples/agents/weather.yaml` + `samples/tools/get-coordinates.yaml` + `samples/tools/get-forecast.yaml` |
| 2b | Agent + MCP Server | `samples/agents/filesystem.yaml` + `samples/mcp/custom-mcp.yaml` |
| 2c | A2A Server | `samples/a2a/simple-agent/` |
| 3 | Team | `samples/teams/sequential.yaml` |

## Step Details

### Step 1 — Model Query
- Target: `default` model
- Input: `"What is Kubernetes in one sentence?"`
- Shows: Raw LLM call, no agent

### Step 2a — Agent + HTTP Tool
- Target: `weather` agent
- Input: `"What is the weather forecast for New York?"`
- Shows: Agent tool chaining (get-coordinates → get-forecast)

### Step 2b — Agent + MCP Server
- Target: `filesystem` agent
- Input: `"List the files in the current directory"`
- Shows: Agent discovering tools from MCP server at runtime

### Step 2c — A2A Server
- Target: `simple-agent` A2A server
- Input: `"What is 2 + 2?"`
- Shows: Delegation to external agent via A2A protocol

### Step 3 — Team
- Target: `sequential` team
- Input: `"Summarize the benefits of AI agents in enterprise workflows"`
- Shows: Multi-agent sequential orchestration

## Deliverable

Single file: `services/argo-workflows/samples/ark-component-showcase.yaml`

- One Argo `WorkflowTemplate` with DAG
- Uses `alpine/k8s` image (same as existing samples)
- Each step: `kubectl apply` Query → `kubectl wait` → `kubectl get` result
- Query naming: `showcase-{{workflow.name}}-<step>`
- Labels: `workflow: "{{workflow.name}}"` on all Queries

## Prerequisites

1. Ark platform deployed (`devspace dev`)
2. Sample resources applied (`kubectl apply -f samples/...`)
3. Argo Workflows running (included in devspace pipeline)

## Cleanup

All Queries have TTL and labels: `kubectl delete queries -l workflow=<name>`

## Components Not Included

- **Evaluator:** Excluded to keep the demo simple and focused
- **Memory:** Not needed for single-turn demo queries
