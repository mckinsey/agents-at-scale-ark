---
name: Ark Analysis
description: Analyze the Ark codebase by cloning the repository to a temporary location. Use this skill when the user asks questions about how Ark works, wants to understand Ark's implementation, or needs to examine Ark source code.
---

# Ark Analysis

This skill helps you analyze the Ark codebase by cloning the repository and examining its contents.

## When to use this skill

Use this skill when:
- User asks "how does X work in Ark?"
- User wants to understand Ark's architecture or implementation
- User needs to examine Ark source code, CRDs, or controllers
- User mentions analyzing the Ark repository

## Quick start

Clone the Ark repository to a temporary location:

```bash
git clone git@github.com:mckinsey/agents-at-scale-ark.git /tmp/ark-analysis
cd /tmp/ark-analysis
```

## Codebase structure

The Ark repository is organized as follows:

- **`ark/`** - Kubernetes operator and default executor (Go)
  - Controller dispatches queries to executors via A2A protocol
  - CRDs: Agent, Model, Query, Team, MCPServer, ExecutionEngine, A2AServer
  - `executors/completions/` - Built-in default execution engine

- **`lib/ark-sdk/`** - Python SDK (generated + overlay)
  - `BaseExecutor` ABC and `ExecutorApp` for pluggable executor interface

- **`services/`** - Component services
  - `ark-api/` - REST API gateway (Python/FastAPI)
  - `ark-broker/` - In-memory event bus (Node.js/Express)
  - `ark-dashboard/` - Web UI (Next.js/React)

- **`samples/`** - Example YAML configurations

- **`docs/`** - Documentation site (Next.js/MDX)

## Common analysis tasks

### Find controllers
```bash
ls ark/internal/controller/
grep -r "Reconcile" ark/internal/controller/
```

### Find CRDs
```bash
ls ark/config/crd/bases/
grep -r "kind: Agent" samples/
```

### Find A2A implementations
```bash
find . -path "*/a2a*" -type f
grep -r "A2AServer" .
```

### Search for specific features
```bash
# Use ripgrep or grep to search
rg "query controller" --type go
grep -r "team coordination" --include="*.go"
```

## Best practices

1. **Clone to /tmp**: Always clone to `/tmp/ark-analysis` to avoid cluttering the workspace
2. **Navigate first**: `cd /tmp/ark-analysis` before running analysis commands
3. **Use search tools**: Prefer `rg` (ripgrep) or `grep` for code searches
4. **Check CLAUDE.md**: Look for project-specific guidance in `CLAUDE.md` files
5. **Clean up**: Optionally remove the temp directory when done: `rm -rf /tmp/ark-analysis`

## Example workflows

### Analyzing a controller
```bash
git clone git@github.com:mckinsey/agents-at-scale-ark.git /tmp/ark-analysis
cd /tmp/ark-analysis
cat ark/internal/controller/query_controller.go
grep -r "ExecuteQuery" ark/internal/genai/
```

### Understanding A2A integration
```bash
cd /tmp/ark-analysis
find samples/a2a -name "*.py"
cat samples/a2a/simple-agent/src/simple_a2a_server/main.py
cat docs/content/developer-guide/building-a2a-servers.mdx
```

### Finding CRD specifications
```bash
cd /tmp/ark-analysis
ls ark/api/v1alpha1/
cat ark/api/v1alpha1/agent_types.go
```
