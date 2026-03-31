---
name: issue-creation
description: Structured workflow for drafting NEW GitHub issues with codebase research, duplicate detection, task breakdowns, and testing approach. Always asks clarifying questions and shows the draft for approval before creating. For searching, listing, viewing, or updating existing issues, use the "issues" skill instead.
---

# Issue Creation

Create well-researched, problem-focused GitHub issues for `mckinsey/agents-at-scale-ark`.

## When to use this skill

Use when the user asks to create an issue, report a bug, request a feature, or track work. This skill enforces a research-first approach before creating any issue.

## Process

Follow these steps in order. Do NOT skip steps.

### Step 1: Ask clarifying questions

ALWAYS ask clarifying questions before doing any research or drafting. Never assume you have enough context. Use AskUserQuestion to gather:

- What exactly is the problem? (Get specifics, not just a vague description)
- Who is affected and how severely?
- How is the problem reproduced? (for bugs)
- What is the motivation or trigger? (for features)
- Is there any urgency or deadline?
- Are there any constraints the user already knows about?

Do NOT proceed to Step 2 until the user has answered your questions. If the user's initial description is detailed, still confirm your understanding by summarizing back and asking if anything is missing.

### Step 2: Research the codebase

Before writing anything, investigate the relevant code:
- Find the files, modules, and components involved
- Understand the current behavior and architecture
- Identify the scope and blast radius of the problem
- Note relevant file paths and code references

Use Grep, Glob, Read, and the Explore agent as needed. Include key findings in the issue body so reviewers have context without re-doing the research.

### Step 3: Check for duplicates and dependencies

Search existing issues thoroughly in the **main repo**:

```bash
gh search issues --repo mckinsey/agents-at-scale-ark "<keywords>" --json number,title,state,labels --jq '.[] | "\(.number) [\(.state)] \(.title)"'

gh issue list --repo mckinsey/agents-at-scale-ark --state open --json number,title,labels --jq '.[] | "\(.number) \(.title)"' | grep -i "<keyword>"
```

**If the issue relates to the marketplace** (observability, community services, Phoenix, Langfuse, optional service integrations, or anything in the marketplace repo), also search and research `mckinsey/agents-at-scale-marketplace`:

```bash
gh search issues --repo mckinsey/agents-at-scale-marketplace "<keywords>" --json number,title,state,labels --jq '.[] | "\(.number) [\(.state)] \(.title)"'

gh issue list --repo mckinsey/agents-at-scale-marketplace --state open --json number,title,labels --jq '.[] | "\(.number) \(.title)"' | grep -i "<keyword>"
```

Also research the marketplace codebase for relevant patterns, existing implementations, and architectural context using the `gh` CLI or web fetch against `https://github.com/mckinsey/agents-at-scale-marketplace`. Include marketplace findings in the issue Context section when relevant.

- If a duplicate exists in either repo, tell the user and link to it instead of creating a new issue.
- If related issues exist in either repo, note them as dependencies or references in the new issue.

### Step 4: Draft the issue

Use this template:

```markdown
## Problem

[Clear description of what is broken, missing, or suboptimal. Focus on the problem, NOT the solution.]

## Context

[Codebase research findings: relevant files, current behavior, architecture context. Include file paths.]

## Impact

[Who is affected? What breaks or degrades? How severe is this?]

## Related Issues

- #N — [brief description of relationship]

## Task Breakdown

- [ ] [Discrete, actionable task 1]
- [ ] [Discrete, actionable task 2]
- [ ] ...

## Testing Approach

- [How to verify the problem is fixed]
- [What test types are appropriate: unit, integration, e2e]
- [Edge cases to cover]
```

### Step 5: Show the draft and ask for edits

ALWAYS present the full draft (title + body) to the user before creating the issue. Use AskUserQuestion to ask:
- Does the draft look good?
- Any sections to add, remove, or reword?
- Is the task breakdown accurate?

Do NOT create the issue until the user approves. If they request edits, apply them and show the updated draft again.

### Step 6: Create the issue

Only after the user approves the draft:

```bash
gh issue create --repo mckinsey/agents-at-scale-ark \
  --title "<type>: <concise problem description>" \
  --body "$(cat <<'EOF'
<issue body from step 5>
EOF
)" \
  --label "needs grooming"
```

Title must use conventional commit prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, etc.

## Rules

1. **Always ask clarifying questions first.** Never skip straight to research or drafting. Confirm understanding before proceeding.
2. **Focus on the problem.** Never propose a design or solution unless the user explicitly asks for one.
3. **Research first.** Every issue must include codebase research findings.
4. **No duplicates.** Always check existing issues before creating.
5. **Task breakdown required.** Break the work into discrete, actionable tasks.
6. **Testing approach required.** Suggest how to verify the fix/feature.
7. **Always add "needs grooming" label.** Every issue created by this skill gets this label.
8. **Link dependencies.** Reference related issues when they exist.
