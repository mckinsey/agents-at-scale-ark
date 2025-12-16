# Post-IA Improvement Plan 

This page describes the recommended work after we have improved the information architecture. The goal is to progressively align the documentation set to the Diátaxis framework with **maximum impact** and **minimal unnecessary churn**.


## Diátaxis hardening by page type (content changes, minimal scope)

Phase 2 focuses on making each page clearly belong to one Diátaxis type, while keeping changes incremental and low-risk.

### 2A. Tutorials: make the flagship paths unambiguously tutorial-shaped

Prioritize the tutorials that act as the “front door” after the new hub pages:

- Quickstart
- Starting a New Agentic Project
- Worked example
- Walkthrough

Key work:

- Enforce one path output (remove branching options; link out to how-tos instead).
- Add expected outputs / verification checkpoints after each step.
- Remove conceptual digressions (push into Core concepts).

### 2B. How-to guides: tighten scope and strip explanation

For core user tasks (Models/Agents/Teams/Queries/Tools/CLI):

- Convert to consistent “This guide shows you how to…” framing.
- Keep steps task-driven, using conditional imperatives (“If you want X, do Y”).
- Remove long “what is this” sections; link to Core concepts.
- Ensure reasonable start/end scope and clear success criteria (what “done” looks like).

### 2C. Reference: normalize structure for lookup

For CRDs, resource pages, evaluations references, and APIs:

- Standardize headings and section order (e.g., Purpose → Schema/Fields → Status → Constraints → Examples).
- Remove narrative tone and “how to use” advice; link to how-tos.

### 2D. Core concepts: create a small set of canonical conceptual anchors

Create/strengthen “Core concepts” pages that other pages can link to:

- What is ARK (and why ARK)
- Execution model (query execution flow + relationships)
- Choosing an orchestration approach (Teams vs Workflows vs A2A)
- Security model overview
- Observability model overview


## Phase 3 — Fill critical gaps (high-impact additions + targeted splits/merges)

Phase 3 adds missing content users expect and resolves structural debt by splitting mixed pages, and (where needed) merging duplicates.

### 3A. Add missing “expected content”

Add the minimum set of missing pages that unlock clarity and reduce repetition:

- Glossary / core concepts
- Decision guides
- Verification / troubleshooting checklists
- Stable reference catalogs (CLI reference, API endpoint reference)

### 3B. Split high-mixing pages into proper Diátaxis components

Examples:

- Ark APIs → API reference (Reference) + How to call the API / auth / tokens (How-to)
- CRDs → pure schema reference; move “how it works” narrative to Core concepts
- RAG implementation guide → architecture (Core concepts) + How to build minimal RAG (How-to) + config options (Reference)

### 3C. Retire/mask placeholders and moved pages

- Remove nav links to “moved” pages and replace with proper redirects and a single canonical destination.
- Fill or retire “Developing Tools” (currently empty).


## Priority table: Maximum impact content work (mods + additions)

Scoring logic:

- **Impact** = how many users benefit, how much confusion/support load it reduces
- **Effort** = rough relative effort for a docs engineer + SME review
- **Dependency** = what must exist first (often “Core concepts anchors”)

| Priority | Initiative | Type (Add/Modify) | Pages in scope | Why it’s high impact | Effort | Dependencies | Output / Acceptance criteria |
|---:|---|---|---|---|---:|---|---|
| High | Harden the “front door” tutorial path | Modify | Quickstart; Starting a New Agentic Project; Worked Example; Walkthrough | First clicks after hub pages; reduces onboarding friction | M | None | Single path; checkpoints; expected outputs; links to how-tos for variants |
| High | Add “What is ARK / Why ARK” core concept page | Add | New Core concepts page | Removes repeated mini-explanations; clarifies positioning | S–M | None | Clear product intent, architecture overview, how to choose ARK; linked from hubs & intro |
| High | Add “Verify installation / sanity check” how-to | Add | New how-to | Reduces “it doesn’t work” support; consistent success criteria referenced by other docs | S | Quickstart touched | Checklist: pods/CRDs ready, dashboard reachable, first query succeeds |
| High | Tighten Models/Agents/Teams/Queries into task-driven how-tos | Modify | user-guide models/agents/teams/queries/tools | Core everyday tasks; currently mixed; improves time-to-task | M | Core concepts anchors helpful | Task-first framing; concepts moved to Core concepts; success criteria added |
| High | Create “Teams vs Workflows vs A2A” decision guide | Add | New Core concepts page | Prevents wrong architectural choices; reduces confusion | M | Basic architecture notes | Decision matrix + “when to use” + links to relevant how-tos |
| High | Reference normalization: Resource pages template | Modify | reference/resources/* | Predictable lookup; reduces scanning time | M | None | Standard template applied consistently across resources |
| Medium | Split “Ark APIs” into true reference + how-to usage | Modify/Add | reference/ark-apis + new how-to “Call the API” | Current page mixes types; split increases clarity | M | SME on contract | Endpoint tables only in reference; usage/auth in how-to |
| Medium | CRDs page cleanup and cross-linking | Modify | reference/crds + related concept pages | Removes narrative from reference; improves discoverability | M | Core concepts anchors | CRDs reference is terse; “how it works” moved to Core concepts |
| Medium | Create CLI reference (commands/flags) | Add | New reference page | Users need quick lookup; current CLI docs are workflow-heavy | M | Confirm CLI surface | Command catalog with flags/examples; linked from CLI how-to |
| Medium | Operator persona guides: add “Operate ARK” overview per persona | Add | New how-to pages (3) | Operators land in mixed pages; persona overviews reduce noise | S–M | Navigation done | Persona pages: tasks list, runbooks links, common failure modes |
| Medium | Observability content split: concept vs procedure vs config | Modify/Add | developer-guide/observability + reference additions | Clarifies mental model vs setup; reduces config ambiguity | M | SME on supported stack | Concept + how-to enable + reference env vars |
| Medium | Authentication content split: concept + how-to per auth mode + reference | Modify/Add | developer-guide/authentication + new pages | High-stakes area; reduces misconfigurations | M–L | SME confirmation | Auth modes separated; stepwise setup; endpoints/claims in reference |
| Low | Rationalize moved pages (Phoenix/Langfuse notices) | Modify | those pages + redirects | Polishes UX; lower value than core tasks | S | Confirm canonical destinations | No dead ends in nav; clear redirect path |
| Low | “Developing Tools” page completion or retirement | Modify | developer-guide/developing-resources/developing-tools | Placeholder undermines trust; smaller audience | S–M | SME/time | Either real content or remove link/mark WIP with purpose |

---

## Recommended sequencing (maximize impact, minimize rework)

1. **Tutorial hardening** (Quickstart + first project)
2. **Core concepts anchors** (“What/Why ARK”, “Execution model”, “Teams vs Workflows vs A2A”)
3. **Core how-tos** (Models/Agents/Teams/Queries/Tools/CLI), each linking to the core concepts anchors
4. **Reference normalization** (resource pages, evaluations reference consistency)
5. **Split/normalize mixed pages** (Ark APIs, CRDs, RAG guide, observability/auth)
6. **Operator persona overviews** and runbook polish
7. **Cleanup** (redirect-only pages, placeholders)

---

## Next actions (post Phase 1 PR)

1. Rewrite **Quickstart** to include explicit expected outputs and a verification checklist.
2. Rewrite **Starting a New Agentic Project** into a single path; move variants into linked how-tos.
3. Add **Core concept: What/Why ARK** and link it from Introduction + Core Concepts hub.
4. Add **How-to: Verify installation** and link it from Quickstart, Deploying ARK, and Troubleshooting.
5. Refactor **Models/Agents/Teams/Queries** into task-first style; extract concepts into Core Concepts anchors.
6. Apply a consistent template to **reference/resources/** pages.
