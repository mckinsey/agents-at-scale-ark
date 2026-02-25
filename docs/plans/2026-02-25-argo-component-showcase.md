# Ark Component Showcase — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a single Argo WorkflowTemplate that demonstrates Model, Agent+Tool, Agent+MCP, A2A Server, and Team components in one DAG workflow.

**Architecture:** A DAG-based WorkflowTemplate with 5 query steps: one sequential model query, three parallel steps (agent+tool, agent+MCP, A2A), then a sequential team query. Each step creates an Ark Query via kubectl, waits for completion, and extracts the response. A final step collects all results.

**Tech Stack:** Argo Workflows, Kubernetes (kubectl), Ark CRDs (Query), shell scripts in `alpine/k8s:1.28.13`

---

### Task 1: Create the WorkflowTemplate with reusable query helper

**Files:**
- Create: `services/argo-workflows/samples/ark-component-showcase.yaml`

**Step 1: Create the file with metadata, arguments, and a reusable `ark-query` template**

The `ark-query` template follows the exact pattern from existing samples (weather-workflow-template.yaml, query-fanout-template.yaml) — it takes a query name suffix, input text, target name, and target type as parameters and handles the kubectl apply → wait → get pattern.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: ark-component-showcase
  annotations:
    workflows.argoproj.io/title: "Ark Component Showcase"
    workflows.argoproj.io/description: |
      Demonstrates core Ark components in a single workflow: Model, Agent with HTTP Tools,
      Agent with MCP Server, A2A Server, and Team orchestration.
      Shows both sequential and parallel execution patterns.
spec:
  entrypoint: main
  serviceAccountName: argo-workflow

  templates:
  - name: ark-query
    inputs:
      parameters:
        - name: step-name
        - name: input
        - name: target-name
        - name: target-type
    script:
      image: alpine/k8s:1.28.13
      command: [sh]
      source: |
        set -eux

        QUERY_NAME="showcase-{{workflow.name}}-{{inputs.parameters.step-name}}"

        cat <<EOF | kubectl apply -f -
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        metadata:
          name: $QUERY_NAME
          labels:
            workflow: "{{workflow.name}}"
            showcase-step: "{{inputs.parameters.step-name}}"
        spec:
          input: "{{inputs.parameters.input}}"
          target:
            name: "{{inputs.parameters.target-name}}"
            type: "{{inputs.parameters.target-type}}"
          timeout: 3m
          ttl: 1h
        EOF

        kubectl wait --for=condition=Completed --timeout=3m query/$QUERY_NAME || true

        kubectl get query $QUERY_NAME -o json > /tmp/query.json
        PHASE=$(jq -r '.status.phase' /tmp/query.json)

        if [ "$PHASE" = "error" ]; then
          ERROR_MESSAGE=$(jq -r '.status.response.content // .status.error // "Unknown error"' /tmp/query.json)
          echo "$ERROR_MESSAGE"
          exit 1
        fi

        jq -r '.status.response.content // ""' /tmp/query.json | tee /tmp/response.txt
    outputs:
      parameters:
        - name: response
          valueFrom:
            path: /tmp/response.txt
```

**Step 2: Verify the YAML is syntactically valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('services/argo-workflows/samples/ark-component-showcase.yaml'))"`
Expected: No output (success)

---

### Task 2: Add the DAG template with all 5 steps + results collector

**Files:**
- Modify: `services/argo-workflows/samples/ark-component-showcase.yaml`

**Step 1: Add the `main` DAG template and `collect-results` template**

Insert the `main` template before `ark-query` in the templates list. The DAG structure:

```
model-query → [agent-tool-query, agent-mcp-query, a2a-query] → team-query → collect-results
```

```yaml
  - name: main
    dag:
      tasks:
      - name: model-query
        template: ark-query
        arguments:
          parameters:
          - name: step-name
            value: "model"
          - name: input
            value: "What is Kubernetes in one sentence?"
          - name: target-name
            value: "default"
          - name: target-type
            value: "model"

      - name: agent-tool-query
        template: ark-query
        dependencies: [model-query]
        arguments:
          parameters:
          - name: step-name
            value: "agent-tool"
          - name: input
            value: "What is the weather forecast for New York?"
          - name: target-name
            value: "weather"
          - name: target-type
            value: "agent"

      - name: agent-mcp-query
        template: ark-query
        dependencies: [model-query]
        arguments:
          parameters:
          - name: step-name
            value: "agent-mcp"
          - name: input
            value: "List the allowed directories"
          - name: target-name
            value: "filesystem"
          - name: target-type
            value: "agent"

      - name: a2a-query
        template: ark-query
        dependencies: [model-query]
        arguments:
          parameters:
          - name: step-name
            value: "a2a"
          - name: input
            value: "Calculate add 10 20"
          - name: target-name
            value: "simple-agent"
          - name: target-type
            value: "agent"

      - name: team-query
        template: ark-query
        dependencies: [agent-tool-query, agent-mcp-query, a2a-query]
        arguments:
          parameters:
          - name: step-name
            value: "team"
          - name: input
            value: "Summarize the benefits of AI agents in enterprise workflows"
          - name: target-name
            value: "team-seq"
          - name: target-type
            value: "team"

      - name: collect-results
        template: collect-results
        dependencies: [team-query]
        arguments:
          parameters:
          - name: model-result
            value: "{{tasks.model-query.outputs.parameters.response}}"
          - name: agent-tool-result
            value: "{{tasks.agent-tool-query.outputs.parameters.response}}"
          - name: agent-mcp-result
            value: "{{tasks.agent-mcp-query.outputs.parameters.response}}"
          - name: a2a-result
            value: "{{tasks.a2a-query.outputs.parameters.response}}"
          - name: team-result
            value: "{{tasks.team-query.outputs.parameters.response}}"
```

Add the `collect-results` template after `ark-query`:

```yaml
  - name: collect-results
    inputs:
      parameters:
        - name: model-result
        - name: agent-tool-result
        - name: agent-mcp-result
        - name: a2a-result
        - name: team-result
    script:
      image: alpine:3.19
      command: [sh]
      source: |
        cat <<EOF | tee /tmp/showcase-results.txt
        === Ark Component Showcase Results ===

        [1] Model (direct LLM call):
        {{inputs.parameters.model-result}}

        [2a] Agent + HTTP Tools (weather agent):
        {{inputs.parameters.agent-tool-result}}

        [2b] Agent + MCP Server (filesystem agent):
        {{inputs.parameters.agent-mcp-result}}

        [2c] A2A Server (simple-agent):
        {{inputs.parameters.a2a-result}}

        [3] Team (sequential orchestration):
        {{inputs.parameters.team-result}}
        EOF
    outputs:
      parameters:
        - name: results
          valueFrom:
            path: /tmp/showcase-results.txt
```

**Step 2: Validate the complete YAML**

Run: `python3 -c "import yaml; list(yaml.safe_load_all(open('services/argo-workflows/samples/ark-component-showcase.yaml')))"`
Expected: No output (success)

---

### Task 3: Commit

**Step 1: Commit the workflow template**

```bash
git add services/argo-workflows/samples/ark-component-showcase.yaml
git commit -m "feat: add Ark component showcase workflow template

Demonstrates Model, Agent+Tool, Agent+MCP, A2A Server, and Team
components in a single Argo DAG workflow with sequential and parallel
execution patterns."
```

---

## Prerequisites Checklist (for running the demo)

These existing sample resources must be deployed before running the workflow:

1. `samples/models/default.yaml` — default model
2. `samples/agents/weather.yaml` — weather agent
3. `samples/tools/get-coordinates.yaml` + `samples/tools/get-forecast.yaml` — HTTP tools
4. `samples/agents/filesystem.yaml` — filesystem agent (+ MCP server deployed via devspace)
5. `samples/a2a/simple-agent/` — A2A server (deployed via devspace)
6. `samples/teams/sequential.yaml` — sequential team + agent-seq

## Running the Demo

```bash
kubectl apply -f services/argo-workflows/samples/ark-component-showcase.yaml
argo submit --from workflowtemplate/ark-component-showcase
```
