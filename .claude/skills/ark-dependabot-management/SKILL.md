---
name: ark-dependabot-management
description: Consolidate open Dependabot PRs into a single integration branch. Use when the user asks to "consolidate dependabot", "merge dependabot PRs", "batch dependency updates", or mentions dependabot PR management.
---

# Ark Dependabot Management

Consolidate open Dependabot PRs into a single integration branch for unified review and merge.

## Strategy

All open Dependabot PRs get merged into a single `integration/dependabot` branch which has one PR into `main`. This avoids CI churn from merging individual dependency bumps.

## Pre-flight: Check for stale config

Before consolidating, verify all directories in `.github/dependabot.yaml` still exist:

```bash
yq '.updates[].directory // .updates[].directories[]' .github/dependabot.yaml | while read dir; do
  [ ! -d "$dir" ] && echo "STALE: $dir"
done
```

Remove stale entries before proceeding — they cause Dependabot workflow errors.

## Consolidate Pull Requests

### Preferred approach: Git merge

The fastest method is to merge each dependabot branch directly into a fix branch:

```bash
git checkout -b fix/build-consolidation origin/main

# For each dependabot PR branch:
git fetch origin <dependabot-branch>
git merge --no-edit origin/<dependabot-branch>
```

This is simpler than the GitHub API approach below, avoids needing `--admin` permissions, and lets you test all updates together locally before pushing.

### Alternative approach: GitHub API

Use the API method when you need to keep individual PRs open for tracking, or when merging into the `integration/dependabot` branch.

### Step 1: List open Dependabot PRs

```bash
gh pr list --repo mckinsey/agents-at-scale-ark --state open --author "app/dependabot" \
  --json number,title,headRefName --jq '.[] | "\(.number)\t\(.title)"'
```

### Step 2: Check for existing integration branch and PR

```bash
EXISTING_PR=$(gh pr list --repo mckinsey/agents-at-scale-ark --state open \
  --head integration/dependabot --json number --jq '.[0].number // empty')

if [ -n "$EXISTING_PR" ]; then
  echo "Existing open PR: #${EXISTING_PR}"
fi
```

If no open PR exists, check if the branch exists and if there's a merged PR to reopen from:

```bash
BRANCH_EXISTS=$(gh api repos/mckinsey/agents-at-scale-ark/git/ref/heads/integration/dependabot \
  --jq '.object.sha' 2>/dev/null || echo "")

MERGED_PR=$(gh pr list --repo mckinsey/agents-at-scale-ark --state merged \
  --head integration/dependabot --json number --jq '.[0].number // empty')
```

### Step 3: Create or reset the integration branch

**If no branch exists** — create from main:
```bash
gh api repos/mckinsey/agents-at-scale-ark/git/refs \
  -f ref="refs/heads/integration/dependabot" \
  -f sha="$(gh api repos/mckinsey/agents-at-scale-ark/git/ref/heads/main --jq '.object.sha')"
```

**If branch exists but PR was already merged** — reset to current main:
```bash
gh api repos/mckinsey/agents-at-scale-ark/git/refs/heads/integration/dependabot \
  --method PATCH \
  -f sha="$(gh api repos/mckinsey/agents-at-scale-ark/git/ref/heads/main --jq '.object.sha')" \
  -F force=true
```

### Step 4: Retarget and merge each Dependabot PR

For each open Dependabot PR:

```bash
gh api repos/mckinsey/agents-at-scale-ark/pulls/<NUMBER> \
  --method PATCH -f base="integration/dependabot"
```

Then squash merge:
```bash
gh pr merge <NUMBER> --repo mckinsey/agents-at-scale-ark --squash --admin
```

**Conflict handling**: If a PR has merge conflicts, rebase it onto `integration/dependabot` first, accepting the dependabot changes.

**Workflow files**: PRs modifying `.github/workflows/` require a token with `workflow` scope — flag these for manual merge in the GitHub UI.

### Step 5: Create or reopen the consolidated PR

**If no existing open PR**:
```bash
gh pr create --repo mckinsey/agents-at-scale-ark \
  --head integration/dependabot --base main \
  --title "chore(deps): consolidated dependabot updates" \
  --body "$(cat <<'EOF'
## Summary
- Consolidated dependabot dependency updates into a single PR

### Included PRs
| PR | Title |
|----|-------|
| #N | title |

EOF
)"
```

**If a merged PR exists and the branch has new changes**, create a new PR (GitHub won't reopen a merged PR):
```bash
gh pr create --repo mckinsey/agents-at-scale-ark \
  --head integration/dependabot --base main \
  --title "chore(deps): consolidated dependabot updates" \
  --body "$(cat <<'EOF'
## Summary
- Consolidated dependabot dependency updates into a single PR
- Continues from previously merged consolidation

### Included PRs
| PR | Title |
|----|-------|
| #N | title |

EOF
)"
```

## Maintenance

Periodically check for stale Dependabot PRs that failed to merge:

```bash
gh pr list --repo mckinsey/agents-at-scale-ark --state open --author "app/dependabot" \
  --json number,title,updatedAt --jq '.[] | select(.updatedAt < "THRESHOLD_DATE") | "\(.number)\t\(.title)"'
```

Close PRs that are superseded by newer versions of the same dependency.
