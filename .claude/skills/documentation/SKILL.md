---
name: ark-documentation
description: Guidance for structuring Ark documentation using the Diataxis framework. Use this skill when creating new docs, deciding where content belongs, reviewing documentation PRs, or restructuring existing documentation.
---

# Ark Documentation

Guidance for structuring Ark documentation using Diataxis adapted for Ark's needs.

## When to use this skill

- Creating new documentation
- Deciding where content belongs
- Reviewing documentation PRs
- Restructuring existing documentation

## Ark's Diataxis structure

```
docs/content/
├── Introduction
├── Quickstart
├── Tutorials          → Linear learning paths
├── How-to Guides      → Task-oriented, by persona
├── Core Concepts      → Understanding "why" and "how"
├── Reference          → Factual lookup material
├── Marketplace        → External link
└── Disclaimer
```

### Terminology

| Diataxis | Ark Term | Why |
|----------|----------|-----|
| Explanation | **Core Concepts** | More accessible |

## The four quadrants

### 1. Tutorials (learning-oriented)

**Purpose**: Hands-on lessons for newcomers.

**Characteristics**:
- Linear, numbered paths (1, 2, 3...)
- Single prescribed path - no choices
- Frequent visible results
- Ends with "Next step" → How-to Guides

**Writing style**:
- Use "we" language
- Don't explain - link to Core Concepts

**Content belongs here if**:
- It teaches a skill through doing
- Reader is studying, not working
- Success requires following steps in order

**Examples**: Quickstart, Running the Dashboard, Starting a New Project, Complete Worked Example

---

### 2. How-to guides (task-oriented)

**Purpose**: Help competent users complete specific tasks.

**Organized by persona**:

#### Build with Ark (application developers)
- Configure models, create agents, coordinate teams, run queries, add tools.

#### Extend Ark (contributors)
- Build services locally, implement APIs, build A2A servers, add tests.

#### Operate Ark (operators / SRE / security)
- **Platform operations**: Provisioning, deploying
- **CI/CD and supply chain**: Build pipelines
- **Security & assurance**: Pen testing, code analysis

**Writing style**:
- Goal-oriented: "If you want X, do Y"
- Assumes competence
- Don't teach - link to Tutorials or Core Concepts

**Content belongs here if**:
- Reader has a specific task to complete
- Reader is working, not studying

---

### 3. Core concepts (understanding-oriented)

**Purpose**: Explain what Ark is, how it's designed, and why.

**Topics**:
- What Ark is and how it works.
- Design effective agentic systems.
- Platform architecture concepts.
- Extensibility concepts.
- Security and identity concepts.

**Writing style**:
- Discursive: "The reason for X is..."
- Make connections between concepts
- Provide design decision context

**Content belongs here if**:
- It answers "why" or "how does this work"
- Reader is deciding how to design/extend/operate
- Content provides context, not procedures

---

### 4. Reference (information-oriented)

**Purpose**: Factual lookup material.

**Organized by type**:
- **Interfaces**: Ark API, Broker Service.
- **Kubernetes API**: CRDs, resources.
- **System behavior**: Query execution, relationships.
- **Operations**: Upgrading, troubleshooting.
- **Project**: Contributors.

**Writing style**:
- Austere, factual, neutral
- Structure mirrors product
- No instruction, explanation, or opinion

**Content belongs here if**:
- It describes what something IS
- Reader needs to look up specific details
- Content is consulted, not read cover-to-cover

---

## Decision guide

```
Is the reader LEARNING or WORKING?
│
├─ LEARNING (studying)
│   ├─ Hands-on, step-by-step? → TUTORIALS
│   └─ Understanding concepts? → CORE CONCEPTS
│
└─ WORKING (applying)
    ├─ Completing a task? → HOW-TO GUIDES
    └─ Looking up facts? → REFERENCE
```

## Hub pages

Hub pages link to content without moving files:

- `tutorials.mdx` - Lists tutorials in order.
- `how-to-guides.mdx` - Groups by persona.
- `core-concepts.mdx` - Groups by topic.
- `reference/index.mdx` - Groups by type.

Hub pages should:
- Explain purpose in one sentence.
- Group links logically.
- Not duplicate content.

## Personas

| Persona | Sections |
|---------|----------|
| End users | Quickstart, Tutorials |
| Agent builders | Tutorials, How-to (Build) |
| Platform engineers | How-to (Operate), Reference |
| Contributors | How-to (Extend), Core Concepts |

## Writing guidelines

### Lexicon
- The product is written **Ark** — capital A, lowercase `rk`. Never `ARK`. This matches the repo's CLAUDE.md and is enforced in review.


### General style
- Be concise and direct.
- Use simple language.
- Keep descriptions to 1-2 sentences.
- Use active voice: "Creates agent" not "Agent is created".
- Write "Ark" not "ARK".
- Use US English.
- Use Oxford commas in lists.

### Bullets
- Capitalize the first word and end with a period.
- Use numbered lists only for sequences of instructions or when referencing items later.

### Capitalization
- Capitalize only proper nouns (product names, tools, services).
- Use sentence case for titles: "An introduction to data visualization" not "An Introduction to Data Visualization".
- Don't capitalize: cloud, internet, machine learning, advanced analytics.

### Headings
- Avoid gerunds: "Get started" not "Getting started," "Customize a layout" not "Customizing a layout".
- Keep titles short and descriptive for search discoverability.

### Instructions
- Use imperatives: "Complete the configuration steps".
- Don't use "please".
- Don't use passive tense: "Complete the steps" not "The steps should be completed".

### Links
- Make hyperlinks descriptive: `Learn how to [contribute to Ark](url)`.
- Don't write: `To contribute, see [here](url)`.

### Avoid
- Gerunds in headings.
- Colloquialisms (may not translate across regions/languages).
- Business speak: "leverage", "utilize", "facilitate".

### What not to mix

| Don't put in... | This content... |
|-----------------|-----------------|
| Tutorials | Explanations, choices. |
| How-to guides | Teaching, complete reference. |
| Core concepts | Instructions, reference. |
| Reference | Instructions, explanations. |

## Reference page structure

CRD and service reference pages follow a consistent template. Use `reference/resources/query.mdx`, `team.mdx`, and `tools.mdx` as the models:

1. **Frontmatter** — `title` and a `description` of the form `"<Kind> CRD reference — ..."`.
2. **Intro** — one paragraph on what the resource is, linking the task-oriented user-guide walkthrough; state plainly that this page is the field-by-field reference.
3. **`## Spec`** — a single annotated YAML example, comments grouped Required / optional.
4. **`## Fields`** — a table with columns `Field | Type | Required | Description`, including enum values, defaults, and cross-field rules.
5. **Topic sections** as warranted (strategies, parameters, auth, …).
6. **`## Status`** — a status YAML block, a `### Status fields` table, a `### Phases` table where a phase enum exists, and a `### Print columns` line naming the columns `kubectl get` renders.
7. **`## Related`** — links to adjacent pages.

For an overview/index page, use one table listing every resource with its `Kind` and API version. Don't keep a second overlapping overview page — one topic, one page. The same applies to service APIs: one service, one reference page (Ark API, Broker Service), with the built-in OpenAPI/Swagger framed as the always-current source of truth.

## Accuracy: verify against the source

Reference docs must be true to the code, not to intent or memory. Pages can read plausibly and still be wrong — this is the most common defect. Before writing or reviewing a reference page, verify every claim:

- **Fields, enums, defaults** — read the Go types in `ark/api/v1alpha1/*_types.go` and the generated CRD in `ark/config/crd/bases/`. `+kubebuilder:validation:Enum`, `+kubebuilder:default`, and the json tags are authoritative — not the existing prose.
- **Behavior and constraints** — read the controller and webhooks (`ark/internal/controller/`, `ark/internal/validation/`). Migration targets, same- vs cross-namespace resolution, and validation rules live here. Example: a deprecated `graph` team strategy migrates to `sequential` (edges discarded), not `selector` — confirmed in `validation/defaults.go`. Verify even when a reviewer asserts otherwise.
- **Live cluster** — where one is available, confirm with `kubectl explain`, `kubectl get <kind>` (for the print columns), and real resource YAML. For a service API, hit the running service's `/openapi.json` and Swagger.
- **Version and release claims** — check the release tags, not the calendar. `git grep <pattern> <tag>` shows when something changed; `git merge-base --is-ancestor <commit> <tag>` confirms what actually shipped. Don't label a section "Unreleased" or cite a version (e.g. there is no `v0.2.0`) without checking.

This session's rewrites found extensive fictional fields (`spec.model`, `systemPrompt`, `spec.agents`), non-existent CLI commands (`ark check`, `ark describe`; it's `devspace run routes`, not `make routes`), and wrong migration targets — all in pages that looked fine.

## Build and preview before pushing

- Build with `cd docs && npm run build` (Turbopack). The production build catches MDX and mermaid errors the dev server silently tolerates, and prints a page count on success. Never push a docs change without a clean build.
- Preview the rendered page (dev server + screenshot). Mermaid renders lazily — scroll to the diagram or render a tall enough viewport before capturing.
- Keep diagrams and prose **complementary, not duplicated**. When two pages cover related ground (e.g. Core Architecture and Query Execution Flow, or the Core Concepts and Core Architecture diagrams), cross-link and defer rather than repeat.

## References

- [Diataxis Framework](https://diataxis.fr/)
- [Issue #338](https://github.com/mckinsey/agents-at-scale-ark/issues/338)
- [PR #620](https://github.com/mckinsey/agents-at-scale-ark/pull/620)
