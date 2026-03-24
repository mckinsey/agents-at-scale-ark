---
name: dependabot
description: Consolidate open Dependabot PRs into a single integration branch. Use when the user asks to "consolidate dependabot", "merge dependabot PRs", "batch dependency updates", or mentions dependabot PR management.
---

# Dependabot

Consolidate open Dependabot PRs into a single integration branch for unified review and merge.

## Consolidate Pull Requests

When asked to consolidate Dependabot PRs:

1. **List all open Dependabot PRs**
   ```bash
   gh pr list --repo mckinsey/agents-at-scale-ark --state open --author "app/dependabot" \
     --json number,title,headRefName --jq '.[] | "\(.number)\t\(.title)"'
   ```

2. **Create an integration branch** from `main`
   ```bash
   gh api repos/mckinsey/agents-at-scale-ark/git/refs \
     -f ref="refs/heads/integration/dependabot" \
     -f sha="$(gh api repos/mckinsey/agents-at-scale-ark/git/ref/heads/main --jq '.object.sha')"
   ```

3. **Retarget all Dependabot PRs** to the integration branch
   ```bash
   gh api repos/mckinsey/agents-at-scale-ark/pulls/<NUMBER> \
     --method PATCH -f base="integration/dependabot"
   ```

4. **Squash merge each PR** into the integration branch
   ```bash
   gh pr merge <NUMBER> --repo mckinsey/agents-at-scale-ark --squash --admin
   ```
   - If a PR has merge conflicts, rebase it onto `integration/dependabot` first, accepting the dependabot changes
   - If a PR modifies `.github/workflows/`, it requires a token with `workflow` scope — flag it for manual merge in the GitHub UI

5. **Create a consolidated PR** from `integration/dependabot` into `main` with a summary table of all included updates
   ```bash
   gh pr create --repo mckinsey/agents-at-scale-ark \
     --head integration/dependabot --base main \
     --title "chore(deps): consolidated dependabot updates"
   ```
