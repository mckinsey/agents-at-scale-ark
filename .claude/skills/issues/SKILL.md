---
name: ark-issues
description: Search, create, and manage GitHub issues for the Ark project. Use when you need to find existing issues, create new ones, or update issue status.
---

# Ark Issues

Manage GitHub issues for the Ark project (mckinsey/agents-at-scale-ark).

## When to use this skill

Use this skill when:
- Searching for existing issues by keyword or CVE number
- Finding issues related to security vulnerabilities
- Creating new issues to track bugs or features
- Viewing issue details and status
- Listing open or closed issues

**Note**: This skill is commonly used by the **ark-security-patcher** agent to:
1. Search for existing CVE-related issues before starting work
2. Link PRs to existing issues with "Closes #N" syntax
3. Create new issues for tracking discovered vulnerabilities

## GitHub CLI Commands

Use the `gh` CLI tool for all issue operations:

### Searching Issues

```bash
# Search issues by keyword
gh search issues --repo mckinsey/agents-at-scale-ark "CVE"

# Search for specific CVE numbers
gh search issues --repo mckinsey/agents-at-scale-ark "CVE-2025-55183"

# Search with filters
gh search issues --repo mckinsey/agents-at-scale-ark "security" --state open
gh search issues --repo mckinsey/agents-at-scale-ark "vulnerability" --label security
```

### Listing Issues

```bash
# List all open issues
gh issue list --repo mckinsey/agents-at-scale-ark

# List issues with filters
gh issue list --repo mckinsey/agents-at-scale-ark --state open
gh issue list --repo mckinsey/agents-at-scale-ark --label bug
gh issue list --repo mckinsey/agents-at-scale-ark --assignee @me

# List with custom fields
gh issue list --repo mckinsey/agents-at-scale-ark --json number,title,state,labels
```

### Viewing Issue Details

```bash
# View specific issue
gh issue view 123 --repo mckinsey/agents-at-scale-ark

# View with comments
gh issue view 123 --repo mckinsey/agents-at-scale-ark --comments

# View as JSON for parsing
gh issue view 123 --repo mckinsey/agents-at-scale-ark --json number,title,body,state,labels
```

### Creating Issues

```bash
# Create issue interactively
gh issue create --repo mckinsey/agents-at-scale-ark

# Create with title and body
gh issue create --repo mckinsey/agents-at-scale-ark \
  --title "Security: Fix CVE-2025-XXXXX" \
  --body "Description of the vulnerability..."

# Create with labels
gh issue create --repo mckinsey/agents-at-scale-ark \
  --title "Bug: API endpoint fails" \
  --body "Steps to reproduce..." \
  --label bug,priority:high
```

### Updating Issues

```bash
# Close an issue
gh issue close 123 --repo mckinsey/agents-at-scale-ark

# Reopen an issue
gh issue reopen 123 --repo mckinsey/agents-at-scale-ark

# Add comment
gh issue comment 123 --repo mckinsey/agents-at-scale-ark \
  --body "Fixed in PR #456"

# Edit issue
gh issue edit 123 --repo mckinsey/agents-at-scale-ark \
  --title "New title" \
  --add-label security
```

## Common Workflows

### Workflow 1: Check for Existing CVE Issues

Before creating a new security fix, check if an issue already exists:

```bash
# Search for CVE number
gh search issues --repo mckinsey/agents-at-scale-ark "CVE-2025-55183"

# If found, note the issue number
# If not found, you may want to create one
```

**Tip**: When creating PRs, reference the issue number using `Closes #123` in the PR body to automatically close the issue when the PR merges.

### Workflow 2: Find All Security-Related Issues

```bash
# Search by keyword
gh search issues --repo mckinsey/agents-at-scale-ark "security OR vulnerability OR CVE"

# Filter by label if security labels exist
gh issue list --repo mckinsey/agents-at-scale-ark --label security
```

### Workflow 3: Create Security Issue for Tracking

```bash
gh issue create --repo mckinsey/agents-at-scale-ark \
  --title "fix: CVE-2025-XXXXX in [component]" \
  --body "$(cat <<'EOF'
## Vulnerability Details
- **CVE**: CVE-2025-XXXXX
- **Severity**: High
- **Component**: [package name]

## Description
[What the vulnerability is]

## Impact on Ark
[How it affects Ark]

## Proposed Fix
[Update package to version X.Y.Z]

## References
- CVE: https://cve.circl.lu/cve/CVE-2025-XXXXX
- Advisory: [URL]
EOF
)" \
  --label security
```

## Best Practices

### Before Creating Issues

1. **Always search first**: Check if a similar issue already exists
   ```bash
   gh search issues --repo mckinsey/agents-at-scale-ark "keyword"
   ```

2. **Be specific**: Use clear, descriptive titles
   - Good: "fix: CVE-2025-55183 in Next.js affects dashboard"
   - Bad: "security issue"

3. **Include context**: Provide all relevant details in the issue body

### When Linking Issues to PRs

- Use `Closes #123` or `Fixes #123` in PR descriptions to auto-close issues
- Reference multiple issues: `Closes #123, Closes #456`
- Use issue numbers in commit messages for traceability

### Issue Formatting

For security issues, use this template:

```markdown
## Vulnerability Details
- **CVE**: CVE-YYYY-NNNNN
- **Severity**: [Critical/High/Medium/Low]
- **Component**: [Package/library name]

## Description
[Clear explanation of the vulnerability]

## Impact on Ark
[Which services are affected and how]

## Proposed Fix
[Recommended mitigation approach]

## References
- CVE: [URL]
- Advisory: [URL]
```

## Error Handling

### Issue Not Found

```bash
gh issue view 999 --repo mckinsey/agents-at-scale-ark
# Error: issue not found
```

Solution: Verify the issue number is correct

### Permission Denied

```bash
gh issue create --repo mckinsey/agents-at-scale-ark
# Error: permission denied
```

Solution: Ensure you're authenticated with `gh auth status` and have write access to the repo

### Rate Limiting

If you hit GitHub API rate limits:
- Wait a few minutes before retrying
- Use `gh auth status` to check your rate limit status
- Consider batching operations

## Integration with Security Workflow

The **ark-security-patcher** agent uses this skill to:

1. **Search for existing CVE issues** before starting work:
   ```bash
   gh search issues --repo mckinsey/agents-at-scale-ark "CVE-2025-55183"
   ```

2. **Link PRs to issues** by including in PR body:
   ```markdown
   Closes #33
   ```

3. **Track vulnerability fixes** by creating issues when CVEs are discovered

Example workflow:
```bash
# Agent searches for CVE issue
ISSUE=$(gh search issues --repo mckinsey/agents-at-scale-ark "CVE-2025-55183" --json number --jq '.[0].number')

if [ -n "$ISSUE" ]; then
  echo "Found existing issue #$ISSUE"
  # Include "Closes #$ISSUE" in PR
else
  echo "No existing issue found"
  # Optionally create a new issue
fi
```

## Important Notes

- **Repository**: All commands target `mckinsey/agents-at-scale-ark`
- **Authentication**: Requires `gh` CLI to be authenticated (`gh auth login`)
- **Permissions**: Need read access to search/view, write access to create/update
- **Rate limits**: GitHub API has rate limits; be mindful of excessive searches

## Common Patterns

### Parse JSON Output

```bash
# Get issue numbers matching a search
gh search issues --repo mckinsey/agents-at-scale-ark "CVE" \
  --json number,title --jq '.[] | "\(.number): \(.title)"'

# Check if issue exists
EXISTS=$(gh search issues --repo mckinsey/agents-at-scale-ark "CVE-2025-55183" --json number --jq 'length')
if [ "$EXISTS" -gt 0 ]; then
  echo "Issue exists"
fi
```

### Batch Operations

```bash
# List all open security issues
gh issue list --repo mckinsey/agents-at-scale-ark \
  --label security --state open \
  --json number,title --jq '.[] | "\(.number): \(.title)"'

# Create multiple issues from a list
for cve in CVE-2025-001 CVE-2025-002; do
  gh issue create --repo mckinsey/agents-at-scale-ark \
    --title "Security: Fix $cve" \
    --body "Track fix for $cve"
done
```
