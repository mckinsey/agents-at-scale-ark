---
name: ark-architecture
description: Design architecture for Ark features following existing patterns and principles. Use when planning new features, extending components, or evaluating technical approaches.
---

# Ark Architecture Skill

Design architecture for Ark features following existing patterns and principles.

## Process

1. **Analyze Current Solution** - Use the ark-analysis skill to examine relevant parts of the codebase
2. **Identify Patterns** - Find existing idioms, data models, and service structures to reuse
3. **Design for Reuse** - Extend existing components rather than creating new ones
4. **Enable Incremental Updates** - Break changes into small, independent pieces
5. **Flag One-Way Decisions** - Raise questions on choices that are hard to reverse

## Principles

- **Reuse over creation** - Extend existing services, models, and patterns
- **Follow existing idioms** - Match current code style, naming, and structure
- **Incremental delivery** - Design so features can be shipped in stages
- **Reversibility** - Identify and question decisions that lock in future options

## Conventions

- **Watch endpoints**: Use `?watch=true` query param for SSE streaming (Kubernetes-style)
- **Service ports**: Use named ports (e.g., `port: mcp`) rather than port numbers

## Output

Architecture documents should include:
- Component diagram showing how new pieces fit with existing ones
- Data model extending current schemas
- API design following existing conventions
- List of one-way decisions requiring team input
- Implementation phases for incremental delivery
