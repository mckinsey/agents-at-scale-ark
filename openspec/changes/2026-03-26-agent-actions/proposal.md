## Why

We want the Ark team to be able to trigger Claude Code from GitHub - via `@claude` mentions on issues and PRs, on failed builds, or on specific PR types like Dependabot. This lets the team triage, suggest fixes, review code, or implement small changes directly from GitHub without needing a local dev environment.

The existing `feat/agent-actions` branch has a basic workflow that calls `dwmkerr/agent-actions`, which wraps `anthropics/claude-code-action`. This won't work in practice - the Ark repo can't use external GitHub Actions. We need to vendor the workflow logic directly.

## Constraint: No External Actions

The Ark GitHub org does not allow referencing external actions (e.g. `uses: dwmkerr/agent-actions/...@main` or `uses: anthropics/claude-code-action@v1`). All action logic must be inlined or vendored into the repo. The source repos should be attributed in comments.

## What Changes

### 1. Workflow: `.github/workflows/agent-actions.yml`

A self-contained workflow that vendors the logic from [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) and [`dwmkerr/agent-actions`](https://github.com/dwmkerr/agent-actions). Attribution to both sources in the workflow file header.

Triggers:

- `issue_comment`, `pull_request_review_comment`, `pull_request_review` - responds to `@claude` mentions
- `issues` with `opened` and `labeled` - responds to `claude` label or `@claude` in issue body
- `workflow_dispatch` with inputs: `prompt`, `issue_number`, `branch` - manual runs from Actions tab or `gh workflow run`
- `workflow_run` on failed CI builds - agent can diagnose and suggest fixes
- `pull_request` filtered to Dependabot PRs - agent can review, test, and merge dependency updates

### 2. Claude Code execution

The vendored workflow installs and runs Claude Code directly via `npx @anthropic-ai/claude-code` (or the equivalent CLI invocation). The key steps:

1. Checkout the repo
2. Install Claude Code CLI
3. Parse the trigger context (issue body, comment body, or dispatch prompt)
4. Run Claude Code with the prompt, passing `ANTHROPIC_API_KEY` from secrets
5. Post the response as a comment on the issue/PR

This is what `anthropics/claude-code-action` does under the hood. Vendoring it means copying the core logic into a composite action or shell steps within the workflow.

### 3. Access control

Check `github.event.sender.login` against a configurable `allowed_users` list (env var or workflow input). Reject and comment if the user isn't authorised. Based on the pattern in `dwmkerr/agent-actions/.github/workflows/claude.yml`.

### 4. Ark-specific context

The agent runs with the repo checked out, so `CLAUDE.md` is picked up automatically. No extra config needed for basic context.

MCP servers: deferred. The agent runs in a GitHub Actions container with no cluster access, so K8s-dependent MCP servers aren't viable here. File-system and git MCP servers could work but add complexity for limited gain in v1.

### 5. Badge

Keep the existing badge in README.md (already on `feat/agent-actions`).

## Options Considered

### Option A: Vendor `anthropics/claude-code-action` logic inline (recommended)

Copy the core execution logic into `.github/workflows/agent-actions.yml` as shell steps. Attribute the source in comments. Simple, no external dependencies, easy to audit.

Cons: manual effort to track upstream changes.

### Option B: Vendor as a local composite action

Copy into `.github/actions/claude-code/action.yml` as a composite action, reference it locally with `uses: ./.github/actions/claude-code`. Cleaner separation but more files.

Cons: slightly more structure to maintain.

### Option C: Use `dwmkerr/agent-actions` as reusable workflow

Not viable - external actions are blocked.

**Recommendation: Option A for v1.** Inline shell steps are the simplest approach. If the workflow grows, refactor to Option B (local composite action).

## Impact

- `.github/workflows/agent-actions.yml` - rewritten (vendored logic, dispatch trigger, access control)
- `README.md` - no change (badge already present on feat/agent-actions)

## Non-goals

- MCP server integration (follow-up)
- Custom GitHub App identity (follow-up)
- Cost tracking / token budgets (follow-up)
- Running the agent against a live cluster
