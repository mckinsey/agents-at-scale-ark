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

## ARK's Diataxis structure

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

#### Build with ARK (application developers)
- Configure models, create agents, coordinate teams, run queries, add tools.

#### Extend ARK (contributors)
- Build services locally, implement APIs, build A2A servers, add tests.

#### Operate ARK (operators / SRE / security)
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

**Purpose**: Explain what ARK is, how it's designed, and why.

**Topics**:
- What ARK is and how it works.
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
- **Interfaces**: ARK APIs.
- **Kubernetes API**: CRDs, resources.
- **Evaluations**: Guides, event-based evaluations.
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
- The product is known as ARK rather than Ark.


### General style
- Be concise and direct.
- Use simple language.
- Keep descriptions to 1-2 sentences.
- Use active voice: "Creates agent" not "Agent is created".
- Write "ARK" not "Ark".
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
- Make hyperlinks descriptive: `Learn how to [contribute to ARK](url)`.
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

## References

- [Diataxis Framework](https://diataxis.fr/)
- [Issue #338](https://github.com/mckinsey/agents-at-scale-ark/issues/338)
- [PR #620](https://github.com/mckinsey/agents-at-scale-ark/pull/620)
