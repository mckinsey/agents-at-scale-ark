# CLAUDE.md

**NEVER add comments** to generated code unless explicitly requested by the user

# Pre-Push Gates (Non-Negotiable)

BEFORE pushing ANY commit, `make lint` and `make test` MUST pass locally
in every directory the change touches. Exact commands per stack live in
"Build Instructions" below; do not skip them.

- **Never push with lint failures.** Same rules CI enforces
  (`golangci-lint` + `gofumpt` for Go, `ruff`/`pyright` for Python,
  `eslint` for TypeScript). Local pass is the minimum bar.
- **Never push with failing tests.**
- **Never bypass hooks** (`--no-verify`, `--no-gpg-sign`) unless the user
  explicitly asks.
- **"One-line changes" hide `gofumpt` and whitespace diffs the most.** Run
  the gates regardless of change size.
- **Tooling gotcha (Go):** `GOLANGCI_LINT_VERSION` in `ark/Makefile` may
  lag local Go. If `make lint` errors with *"Go language version ... used
  to build golangci-lint is lower than the targeted Go version"*, fall
  back to `gofumpt -l .` (install via `go install mvdan.cc/gofumpt@latest`)
  — this catches the formatting rule that breaks CI most often. Full
  `golangci-lint` still runs in CI.

# Project Structure

## Core Folders

- **`ark/`** - Kubernetes operator (Go)
  - Controller reconciles CRDs: Agent, Model, Query, Team, MCPServer, ExecutionEngine, A2AServer
  - Webhooks for validation and mutation (including migration warnings)
  - `executors/completions/` - Default executor (separate deployment, communicates with controller via A2A)
  - The controller dispatches queries to the appropriate executor via A2A protocol

- **`lib/ark-sdk/`** - Python SDK (generated + overlay)
  - Generated from CRDs via OpenAPI, with hand-written overlay for executor interfaces
  - `BaseExecutor` ABC and `ExecutorApp` (A2A bridge) provide the standard interface for pluggable executors
  - Downstream executor implementations live in the [marketplace](https://github.com/mckinsey/agents-at-scale-marketplace)

- **`services/`** - Component services
  - `ark-api/` - REST API gateway (Python/FastAPI) with streaming, A2A, broker integration
  - `ark-broker/` - In-memory event bus (Node.js/Express) for messages, chunks, traces, events, sessions
  - `ark-dashboard/` - Web UI (Next.js/React)
  - `ark-mcp/` - MCP server host service
  - `localhost-gateway/` - Local development gateway

- **`samples/`** - Example YAML configurations for agents, models, queries, teams

- **`docs/`** - Documentation site (Next.js/MDX)

## Supporting Folders

- **`tools/`** - CLI tools
  - `ark-cli/` - Ark CLI (Node.js) - General-purpose, interactive
  - `fark/` - Fark CLI (Go) - Optimized for resource management and low latency
- **`bundles/`** - Component bundles and manifests
- **`scripts/`** - Build and deployment scripts (Bash)
- **`templates/`** - Project templates for new services

# Build Instructions

## Root Commands
- `devspace dev` - Deploy ARK to your cluster 
- `make docs` - Run documentation site with live-reload
- `make services` - Install and configure additional service capabilities

## Ark Controller (Go)
```bash
cd ark/
make build         # Build manager binary
make test          # Run tests with coverage
make docker-build  # Build Docker image
make deploy        # Deploy to K8s cluster
make dev           # Run in development mode
```

## Go Services
All Go services follow this pattern:
```bash
cd services/{service-name}/
make build-binary  # Build Go binary locally
make test          # Run tests
make build         # Build Docker image
```

## Python Services
All Python services use `uv` and follow this pattern:
```bash
cd services/{service-name}/
make init          # Install dependencies (uv sync)
make dev           # Run locally (uv run python -m {module})
make test          # Run tests with coverage
make lint          # Run linting and type checking
make build         # Build container
```

## Node.js Services
```bash
cd docs/           # Documentation site
npm build          # Build site
```

# Observability

Ark uses OpenTelemetry with W3C TraceContext and Baggage propagation for distributed tracing. The operator instruments query dispatch and A2A communication, automatically propagating trace context to downstream executors via HTTP headers. The telemetry subsystem lives in `ark/internal/telemetry/`, and the `ExecutorApp` base class in `lib/ark-sdk/` handles context extraction on the executor side.

# Marketplace

Ark has a separate marketplace repository for add-on components that extend Ark's native capabilities. Marketplace items depend on Ark core — never the other way around.

**Repository**: https://github.com/mckinsey/agents-at-scale-marketplace

The marketplace includes executors (Claude Agent SDK, LangChain), services (Phoenix, Langfuse, ark-sandbox, file-gateway), MCP servers, pre-built agents, and demo bundles. Components can be deployed using DevSpace or Helm as dependencies of your Ark installation.

Example usage in `devspace.yaml`:
```yaml
dependencies:
  phoenix:
    git: https://github.com/mckinsey/agents-at-scale-marketplace
    tag: v0.1.1
    subPath: services/phoenix
```

## CLI Tools
```bash
cd tools/ark-cli/  # Ark CLI (Node.js)
npm install        # Install dependencies
npm run build      # Build TypeScript
npm test           # Run tests

cd tools/fark/     # Fark CLI (Go)
make build-binary  # Build binary
make test          # Run tests
make install       # Install to ~/.local/bin
```

# Writing Style

- **Be concise and direct** - Remove unnecessary adjectives and verbose descriptions
- **Use simple language** - Avoid complex explanations when simple ones work
- **State facts clearly** - Don't embellish with "comprehensive", "advanced", "sophisticated"
- **Keep descriptions brief** - 1-2 sentences maximum for each item
- **Use active voice** - "Creates agent" not "Agent is created"
- **Avoid extra adjectives**
- **Ark capitalization** - Always write "Ark" (capital A, lowercase rk), never "ARK" in documentation

## Makefile Guidelines

- The top level Makefile will always include child fragments, such as lib/lib.mk and service/service.mk
  - anything needing $(OUT) will include it as a dependency like: | $(OUT)
  - the top level makefile will define a PHONY target named clean, which removes $(OUT), and any directory/file add to a CLEAN_TARGET list variable
- helpers.mk at the root incldues all variables and lists
  - the OUT variable is defined before all incudes in the root makefile, it is assigned to abspath/out
  - an $(OUT) target will create the $(OUT) directory in the helpers.mk makefile
  - helpers.mk enables `.SECONDEXPANSION:` for cross-service dependencies
- The child fragments will include grandchildren, such as service/service.mk including service/ark-dashboard/build.mk
- Each grandchild fragment should include <SERVICE>-build, <SERVICE>-install, <SERVICE>-uninstall, <SERVICE>-test and <SERVICE>-dev phony targets
  - if there are no steps required, simply touch the appropriate stamp file
- All phony targets should depend on a STAMP_SERVICE_<TARGET> that is put in $(OUT)/<SERVICE> directory
- Where possible, depend on STAMP_SERVICE_<build> targets instead of doing a make in a subdir
- Where possible, ensure the make is parallelizable

### Cross-Service Dependencies

When a service depends on another service's stamp file (e.g., ark-api depends on localhost-gateway), use double-dollar syntax for deferred expansion:

```makefile
# Correct - uses secondary expansion
$(ARK_API_STAMP_INSTALL): $(ARK_API_STAMP_BUILD) $$(LOCALHOST_GATEWAY_STAMP_INSTALL)

# Wrong - variable may not be defined yet
$(ARK_API_STAMP_INSTALL): $(ARK_API_STAMP_BUILD) $(LOCALHOST_GATEWAY_STAMP_INSTALL)
```

This ensures the dependency is resolved after all makefiles are included, preventing issues with include order.

## README Guidelines

READMEs should be terse and focus only on developer setup:

**Heading**

Title. 2-3 lines on what the project is for..

**Quickstart**

The absolute basics. We always use a `Makefile` which supports help. The quickstart should typically include a snippet like this:

```bash
# Show all available recipes.
make help

# Install/uninstall - sets up your local machine or cluster.
make install
make uninstall

# Run in development mode. May require extra tools and setup, check the README.
make dev
```

## Examples of Good vs Bad Documentation

**Bad (verbose):**
> This comprehensive example demonstrates the sophisticated capabilities of our advanced weather forecasting system with multiple tool chaining workflows.

**Good (concise):**
> Weather forecasting with tool chaining.

**Bad (unclear):**
> Leverages the powerful Model Context Protocol for extensible external service integration capabilities.

**Good (clear):**
> Uses MCP for external service integration.

## Sample Documentation Pattern

For each sample file, use this structure:
```
#### `filename.yaml` - Brief Title
One sentence description.
- **Resource**: What it creates
- **Use case**: When to use it
```

# Build & CI/CD

For build failures, CI issues, CVEs, dependabot management, and test failures, use the **ark-build-manager** agent. It triages failures across workflow runs and delegates to appropriate skills (chainsaw, vulnerability-fixer, ark-dependabot-management, etc.).

# Testing Guidelines

When writing tests for any service, consult `tests/CLAUDE.md` for comprehensive testing patterns and best practices. That guide covers Chainsaw e2e tests; for a service's own unit tests, also check that service's `CLAUDE.md` — `services/ark-dashboard/CLAUDE.md` in particular carries conventions a dashboard change will otherwise miss.

# OpenSpec Change Workflow (worktrees + stacked PRs)

Implement an OpenSpec change one phase at a time. Each phase is its own short
stack of small PRs based on `main`, created with the `github/gh-stack`
extension, and **merged before the next phase opens**.

Phases are not stacked on each other. They depend on each other's code, not
just the spec, so a tower of every phase's branches makes one review comment
at the bottom rebase everything above it. Merge order carries the dependency
instead, which works because an unfinished feature should be inert by default
(see the disabled-by-default flag rule below).

Before the first phase:

1. Merge the change's spec (`openspec/changes/<change>/`) to `main` on its own.
   It is docs-only, so `cicd.yaml`'s `paths-ignore` means it runs almost no CI,
   and it gets the contract reviewed first.
2. Land any pre-existing bug fix the change depends on as its own PR on `main`,
   not inside the feature. Record it in `proposal.md`/`tasks.md` as a
   prerequisite.

Per phase, from the main checkout on trunk:

```bash
git worktree add ../<change>-phase1 -b <change>-phase1 origin/main
cd ../<change>-phase1
# split the phase into its units, bottom first
gh stack init <change>-p1-schema <change>-p1-api <change>-p1-dashboard
```

Then:

1. One worktree per **phase**, not per PR. Use `gh stack add` for each
   subsequent unit; 5-7 branches in one directory, not 7 worktrees.
2. Open PRs as drafts as soon as the first commit exists so the stack is
   visible: `gh stack submit --auto`.
3. `make lint` and `make test` must pass in every directory the unit touches
   before the draft is marked ready (`gh stack submit --open`).
4. After a lower PR merges: `gh stack sync` then `gh stack rebase`.
5. When the whole phase has merged, remove the worktree
   (`git worktree remove ../<dir>`) and start the next phase from `main`.

Rules:

- Split a phase into 5-7 units, not a fixed number. Mechanically splittable is
  not the same as safely splittable: units that would leave the tree in a state
  the spec forbids (a schema accepting a value nothing authorises, a flag with
  no enforcement) belong in one PR.
- Give the security-critical decision its own PR, ideally pure logic separated
  from its wiring, so a security reviewer reads one small file rather than
  hunting the decision across the change.
- Keep an unfinished feature disabled by default (chart flag defaulting false,
  and a render guard if enabling it without its enforcement is unsafe). That is
  what makes merging phase N before N+1 exists safe.
- Phase order follows the dependency order in the change's `tasks.md`. Do not
  start a phase whose prerequisites are unmerged.
- `tasks.md` checkboxes are ticked in the phase that implements them and land
  when that phase merges.
- `gh stack` navigation (`up`, `down`, `checkout`, `switch`) changes branches in
  the current checkout and fails on a branch held by another worktree. With
  worktrees, `cd` to the phase directory instead; use `gh stack view`,
  `submit`, `sync`, and `rebase` only.
- Conventional-commit title per PR, scoped to the change, e.g.
  `feat(inline-tools): add the inline Tool schema and author admission`.
- CI is not free: `cicd.yaml` runs ~20 jobs including six e2e suites per PR,
  and every restack re-runs them. That cost is the reason for 5-7 units per
  phase rather than one per file.

## Testing a phase in an isolated cluster

Give each phase its own Colima k3s profile, so a half-installed webhook or a
leftover CRD from another phase cannot be mistaken for a regression, and so
phases that disagree about correct behaviour (phase 1: authored but Pending;
phase 2: runner provisioned) never share a cluster.

```bash
colima start <change>-p1 --kubernetes --cpu 4 --memory 8 --disk 60
kubectl config use-context colima-<change>-p1
```

- Size for the phase: an authoring-only phase provisions no pods and needs
  little; a runner phase needs more and has to load images into the VM.
- Profiles are separate VMs, so run them one at a time rather than in parallel.
- k3s ships flannel, which does **not** enforce NetworkPolicy. A phase whose
  tests assert that traffic is blocked needs a profile started with an
  enforcing CNI; deciding that is per-profile and cannot be retrofitted.
- Envtest and unit tests still come first. The cluster is for what they cannot
  prove: real admission wiring at `failurePolicy: Fail`, Helm install, and RBAC
  denial of an actual unprivileged user.

# Commit and PR Requirements

CRITICAL: All commit messages and PR titles MUST follow conventional commit format (e.g., `feat:`, `fix:`, `docs:`, `chore:`). This is required for automated release management with Release Please. Non-conventional commits will block PR merges.

## Pull Request Format

When creating pull requests, use this simple format:
```
## Summary
- Brief description of changes
```

DO NOT include "Test plan" sections in PR descriptions.

## Environment Variable Naming

Duration env vars must include a unit suffix:
- `_MS` for milliseconds (e.g., `REQUEST_TIMEOUT_MS`)
- `_SECONDS` for seconds (e.g., `ARK_MEMORY_HTTP_TIMEOUT_SECONDS`)

## Pull Request Maintenance

When adding commits to an existing PR that expand beyond the original scope:

1. **Update PR title** to reflect the broader changes using conventional commit format
2. **Update PR description** to summarize all changes, not just the original ones
3. **Use `gh pr edit`** to update title and body efficiently

Example:
```bash
# Original: "fix: increase test timeouts"
# Updated: "fix: improve CI/CD reliability and container registry configuration"
gh pr edit --title "fix: improve CI/CD reliability and container registry configuration" --body "## Summary
- Increase chainsaw test timeouts for LLM operations
- Fix container registry paths to include repository name for GHCR access control  
- Add NPM package metadata for proper display on npmjs.com
- Fix deploy workflow parameter naming"
```