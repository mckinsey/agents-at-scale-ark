# Completions Executor Extraction

## What

Promote the query engine from `ark/internal/queryengine/` into a first-class composed service unit at `ark/executors/completions/`, dissolve the `genai` package, and extract shared infrastructure into purpose-built packages.

## Why

The query engine extraction (Phase 1) proved the execution layer can live outside the controller. But `genai` became a grab-bag — ~19 symbols used exclusively by the query engine, ~30+ used by controllers, and unclear boundaries. The query engine still lives as a tucked-away internal package rather than a proper service.

This change:

- Makes the completions executor a first-class service with its own README, CLAUDE.md, Makefile, Dockerfile, Helm chart, and devspace config
- Dissolves `genai` by moving execution logic into `executors/completions/` and shared infra into focused packages (`internal/a2a/`, `internal/mcp/`, `internal/resolution/`)
- Absorbs controller-specific remnants (model probing, evaluation) into their owning controllers
- Establishes `executors/` as the home for future execution runtimes (responses, langchain, etc.)
- Integrates natively into the monorepo ecosystem (CI/CD, devspace, root Makefile)

## Scope

**In scope:**
- Move `internal/queryengine/` to `ark/executors/completions/`
- Move all execution logic from `genai/` into `executors/completions/` (agent, team, model, tool execution, memory, streaming, messages, types)
- Extract shared A2A protocol + client into `internal/a2a/`
- Extract shared MCP client into `internal/mcp/`
- Extract shared header resolution into `internal/resolution/`
- Absorb `model_probe.go` into model controller
- Absorb `evaluator.go` + `context_retrieval_helper.go` into evaluation controller
- Absorb constants into `internal/validation/`
- Rename `cmd/query-engine/` to `cmd/completions/`
- Create service infrastructure: build.mk, Makefile, Dockerfile, chart/, devspace.yaml, README.md, CLAUDE.md
- Update root Makefile, devspace.yaml, CI/CD pipeline
- Rename Helm chart and deployment to `ark-completions`
- Delete `internal/genai/`

**Out of scope:**
- Separate Go module (stays in `ark/go.mod`)
- Behavioral changes to the executor (same A2A protocol, same execution logic)
- Changes to the controller's interaction with the executor
- Other executor implementations (responses, langchain)
- Changes to user-facing API (Query CR spec unchanged)
