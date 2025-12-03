# CLAUDE.md

**NEVER add comments** to generated code unless explicitly requested by the user

# Project Structure

## Core Folders

- **`ark/`** - Kubernetes operator (Go)
  - Main controller managing AI resources like agents, models, queries
  - Custom Resource Definitions (CRDs) for AI workloads
  - Webhooks for validation and admission control

- **`services/`** - Supporting services for Ark (Go, Python, TypeScript)
  - `postgres-memory/` - Memory persistence service (Go)
  - **Execution Engines (Python):**
    - `executor-langchain/` - LangChain agent execution and tool integration engine
  - `ark-evaluator/` - AI model evaluation and scoring service (Python)
  - `vnext-ui/` - vNext Next.js web interface (TypeScript/React)
  - `ark-sdk-python/` - Python SDK for Ark resources
  - `arkpy/` - Python CLI and API client

- **`mcp/`** - Model Context Protocol servers
  - `atlassian/` - Jira and Confluence integration
  - `filesystem-mcp/` - File system operations
  - `git/` - Git repository operations
  - `github/` - GitHub API integration
  - `pyodide-python/` - Python execution in browser
  - `scm/` - Source code management bundle

- **`samples/`** - Example configurations (YAML)
  - Agent definitions, models, queries, teams
  - Demonstration workflows and use cases
  - Demo configurations for various scenarios

- **`docs/`** - Documentation site (Next.js)
  - Architecture guides and API references
  - Built with Next.js and MDX

## Supporting Folders

- **`tools/`** - CLI tools
  - `ark-cli/` - Ark CLI (Node.js) - General-purpose, interactive
  - `fark/` - Fark CLI (Go) - Optimized for resource management and low latency
- **`bundles/`** - LegacyX and vNext component bundles and manifests
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

## MCP Servers
All MCP servers follow this pattern:
```bash
cd mcp/{server-name}/
make build         # Build Docker image
```

## Node.js Services
```bash
cd docs/           # Documentation site
npm build          # Build site

cd services/vnext-ui/    # UI service
make build         # Build Docker image
```

# Marketplace

Ark has a separate marketplace repository for community-contributed services and components:

**Repository**: https://github.com/mckinsey/agents-at-scale-marketplace

The marketplace includes observability platforms (Phoenix, Langfuse) and other optional services. Services can be deployed using DevSpace or Helm as dependencies of your Ark installation.

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

# Testing Guidelines

When writing tests for any service, consult `tests/CLAUDE.md` for comprehensive testing patterns and best practices.

# Commit and PR Requirements

CRITICAL: All commit messages and PR titles MUST follow conventional commit format (e.g., `feat:`, `fix:`, `docs:`, `chore:`). This is required for automated release management with Release Please. Non-conventional commits will block PR merges.

## Pull Request Format

When creating pull requests, use this simple format:
```
## Summary
- Brief description of changes
```

DO NOT include "Test plan" sections in PR descriptions.

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