# Harel Phase 2 Pitch -- Ark Platform Demo Design

## Context

- **Client**: Harel, insurer in Israel
- **Background**: AI Factory launched with 2 lighthouse cases (claims operations, unstructured data processing). Phase 2 proposes 9 squads, 50-60 FTE. One squad focuses on AI enablement including Ark as the agentic platform.
- **Demo goal**: Demonstrate Ark platform capabilities to justify Phase 2 investment
- **Audience**: Mixed (executives + technical leaders + developers)
- **Duration**: 45 minutes
- **Format**: Live demo with safety net (pre-loaded resources, pre-tested queries)
- **Approach**: Platform Tour -- structured walkthrough building complexity

## Navigation Reference

Actual sidebar structure (verified from dashboard source):

```
Home
Agent Builder (collapsible) -> Agents, Teams, Queries
Workflows
MCPs
Tools
Models
Monitoring (collapsible) -> Workflow Runs, Events, Broker*, Evals
Marketplace
More (popover) -> Files, A2A Tasks, Exports
Settings (footer, opens modal)
Help (footer, external link)
Dark Mode (footer, toggle)
```

*Broker requires feature flag `BROKER_FEATURE_KEY` to be enabled.

**Not in sidebar** (accessible via direct URL or Settings): Secrets, API Keys, Memory, Services, Evaluators, Evaluations (all nested under the Evals entry point).

## Demo Timeline

### Section 1: Intro (0-5 min)

**Navigate**: Home

Open the Ark dashboard landing page. Set the stage:
- Ark is Kubernetes-native, declarative AI agent platform
- GitOps-ready (YAML, version-controlled, CI/CD)
- Model-agnostic (OpenAI, Azure, Claude, Gemini, Bedrock, Ollama)
- Built for enterprise (multi-tenant, RBAC, evaluation pipelines)

Key message: "This is the platform the AI enablement squad will set up and operate. Every other squad builds on top of it."

### Section 2: Building Blocks (5-15 min)

**Navigate**: Models -> MCPs -> Tools -> Agent Builder (-> Agents, Queries)

**Models (2 min)**:
- Show 2-3 pre-loaded models (different providers)
- Click into one -- endpoint, properties, secret references
- "Centrally managed by the enablement squad, referenced by name across all squads."

**MCPs (1 min)**:
- Show pre-loaded MCP servers (e.g., filesystem)
- "MCPs let agents interact with external systems -- file systems, GitHub, Jira, Confluence."

**Tools (2 min)**:
- Show tools list -- HTTP tools, MCP-sourced tools, built-in tools
- Click into one, show schema (inputs, outputs)
- "Tools are reusable across agents. One squad builds a tool, every squad can use it."

**Agent Builder (2 min)**:
- Open Agent Builder, wire together: model + tools + system prompt
- Show the visual editing experience

**Agents (1 min)**:
- Show agents list (under Agent Builder), click to show full resource view

**Queries -- Live Demo (3 min)**:
- Navigate to Queries (under Agent Builder)
- Run a pre-prepared query, show streaming response
- After response: show tool calls, token usage, latency
- **Fallback**: If LLM is slow, have a completed query ready to click into

### Section 3: Multi-Agent Orchestration (15-25 min)

**Navigate**: Agent Builder -> Teams, Queries; Workflows; Monitoring -> Workflow Runs

**Teams (5 min)**:
- Show pre-built sequential team (researcher -> analyst -> content creator)
- Click into team -- strategy configuration, member agents, turn limits
- Explain strategies: Sequential, Round-robin, Selector, Graph
- "This is how you model real business processes."

**Live Team Query (3 min)**:
- Navigate to Queries (under Agent Builder)
- Run pre-prepared query against the team
- Show agent hand-offs in streaming response
- **Fallback**: Have a completed team query result ready in case the live query takes >60 seconds

**Workflows (3 min)**:
- Navigate to Workflows (top-level sidebar item)
- Show pre-loaded workflow template
- "Conditional branching, parallel execution, human-in-the-loop checkpoints."

**Workflow Runs (2 min)**:
- Navigate to Monitoring -> Workflow Runs
- Show completed workflow run -- status, steps, timing
- "Full audit trail of every execution."

### Section 4: Quality & Observability (25-33 min)

**Navigate**: Monitoring -> Evals, Events; demonstrate memory via Queries chat

**Evals (5 min)**:
- Navigate to Monitoring -> Evals
- Show evaluator configuration -- two types:
  - Deterministic: token efficiency, cost, latency
  - LLM-as-Judge: relevance, accuracy, completeness
- Show completed evaluation with scores
- "Before any agent goes to production, it goes through evaluation."

**Events (1 min)**:
- Navigate to Monitoring -> Events
- Show system event log -- agent created, query executed, evaluation completed
- "Full audit trail. Every action is logged for compliance and debugging."

**Memory demo via chat (2 min)**:
- Go back to Queries, run a follow-up query against the agent from Section 2
- Show it remembers the previous conversation context
- "Multi-turn conversations work out of the box. Memory is persisted in PostgreSQL, session-scoped, and isolated per user."

### Section 5: Enterprise & Multi-Squad (33-42 min)

**Navigate**: Marketplace; Settings; Monitoring -> Broker; More -> Files, A2A Tasks

**Marketplace (2 min)**:
- Navigate to Marketplace (top-level sidebar item)
- Show available community services (Phoenix, Langfuse)
- Show 3rd party marketplace configuration
- "Squads can self-serve additional capabilities."

**Settings -- Multi-Squad (3 min)**:
- Click Settings (footer)
- Show namespace switching between 2-3 namespaces (e.g., "claims-ops", "virtual-agents")
- "Each squad gets their own namespace. Isolated agents, tools, models."
- Show auth configuration options (SSO/OIDC, API keys)
- Mention: "Secrets and API keys are managed securely -- squads reference them by name, never see raw credentials."

**Broker (1 min)**:
- Navigate to Monitoring -> Broker (ensure feature flag is enabled beforehand)
- Show message flow between services
- "Internal messaging backbone with full visibility."

**More -> Files & A2A Tasks (2 min)**:
- Click More (popover) -> Files
- Show filesystem browser (MCP-powered)
- Click More -> A2A Tasks
- "Agents can call other agents as tools, even across squad namespaces."

### Section 6: Wrap-up & Q&A (42-45 min)

Recap: model -> agent -> multi-agent team -> evaluated and monitored -> isolated squad namespaces.

Key message: "Ark gives you the platform layer so your 9 squads focus on building agents, not infrastructure."

**Buffer**: 2-3 min built into Section 5 timing to absorb any overruns from earlier sections.

## Pre-loaded Resources Checklist

### Infrastructure & Config
- [ ] Ark cluster running (use `devspace dev` or deployed release)
- [ ] Broker feature flag enabled (`BROKER_FEATURE_KEY`)
- [ ] postgres-memory service deployed (from `services/postgres-memory/`)
- [ ] Marketplace URLs configured in Settings (for 3rd party marketplace demo)

### Models
- [ ] GPT-4o model (OpenAI)
- [ ] Claude model (Bedrock/Anthropic)
- [ ] Ollama local model (optional, shows flexibility)

### Tools
- [ ] `samples/tools/get-coordinates.yaml` -- geocoding tool
- [ ] `samples/tools/get-forecast.yaml` -- weather forecast tool
- [ ] Web search tool (from `samples/walkthrough/tools/web-search-tool.yaml`) -- needed for research team
- [ ] 1-2 additional HTTP tools (e.g., `samples/tools/create-post.yaml`)

### MCP Servers
- [ ] Filesystem MCP server

### Agents
- [ ] Weather agent (`samples/agents/weather.yaml`) -- Section 2 single-agent demo
- [ ] Researcher agent (from `samples/walkthrough/`) -- Section 3 team member
- [ ] Analyst agent (from `samples/walkthrough/`) -- Section 3 team member
- [ ] Content Creator agent (from `samples/walkthrough/`) -- Section 3 team member

### Teams
- [ ] Sequential team (from `samples/walkthrough/` -- research-analysis team)

### Queries
- [ ] Pre-tested query for weather agent (Section 2) -- test before demo
- [ ] Pre-tested query for sequential team (Section 3) -- test before demo
- [ ] 2-3 conversation queries with memory for context retention demo (Section 4)
- [ ] **Pre-completed query results** as fallback for both agent and team queries

### Evaluations
- [ ] 1 Evaluator (use `samples/evaluator/evaluator-with-labels.yaml` as reference)
- [ ] 1-2 completed Evaluations with scores (run during setup, before the demo)

### Workflows
- [ ] 1 Workflow template (create or use existing)
- [ ] 1-2 completed Workflow Runs (trigger during setup so history is visible)

### Memory
- [ ] Memory resource pointing to postgres-memory service
- [ ] 2-3 existing sessions with conversation history (create during setup by running queries)

### Namespaces (Multi-Squad)
- [ ] Default namespace with main demo resources
- [ ] "claims-ops" namespace with some agents/tools
- [ ] "virtual-agents" namespace with different agents/tools
- [ ] Namespaces labeled for Ark (`ark.mckinsey.com/demo=true` if using landing page)

### Secrets
- [ ] LLM provider API keys as Kubernetes secrets
- [ ] API keys configured per namespace for multi-squad demo

## Setup Steps

1. Deploy Ark to cluster: `devspace dev` (or use existing deployment)
2. Deploy postgres-memory service: `cd services/postgres-memory && make build && make deploy`
3. Enable Broker feature flag
4. Apply walkthrough resources: `kubectl apply -k samples/walkthrough/`
5. Apply weather agent resources: `kubectl apply -f samples/agents/weather.yaml -f samples/tools/get-coordinates.yaml -f samples/tools/get-forecast.yaml`
6. Apply model resources for 2-3 providers
7. Create additional namespaces: `kubectl create ns claims-ops && kubectl create ns virtual-agents`
8. Deploy subset of resources to each namespace for multi-squad demo
9. Configure Marketplace URLs in Settings
10. Run test queries to populate: conversation history, evaluation results, workflow runs
11. Verify all sidebar items render correctly (especially Broker)
12. **Dry run the full demo once end-to-end**

## Fallback Plan

- **Slow LLM response**: Click into a pre-completed query result instead of waiting
- **Dashboard page fails to load**: Have screenshots ready for that section, move on
- **Broker not showing**: Skip it, mention it verbally as "internal messaging"
- **Time overrun**: Cut Section 5 flyby items (Files, A2A Tasks), go straight to wrap-up
