# Team Graph-Selector Strategy Test

Tests the hybrid graph-constrained selector team strategy that combines AI-driven participant selection with workflow graph constraints.

## What it tests

- **Selector Strategy with Graph Constraints**: AI coordinator chooses next participant, but only from graph-allowed transitions
- **Branching Workflow**: Coordinator can choose researcher OR analyzer (selector decides)
- **Constrained Flow**: After researcher → must go to analyzer (graph enforces)
- **Optimization**: Single legal transition (analyzer → writer) bypasses selector agent
- **Hybrid Behavior**: Combines flexibility of AI selection with structure of workflow graphs

## Team Configuration

- **Strategy**: `selector` with AI model making selection decisions
- **Selector Agent**: `coordinator` - decides which member to select
- **Graph Constraints**: Defines allowed transitions between members
- **Team Members**:
  - `coordinator` - Selects next participant (selector agent)
  - `researcher` - Research specialist
  - `analyzer` - Data analyst
  - `writer` - Technical writer

## Graph Structure

```
coordinator
  ├─→ researcher ─→ analyzer ─→ writer
  └─→ analyzer ──────────────→ writer
```

**Execution Flow:**
1. First turn: Always starts with `coordinator` (first member)
2. After `coordinator`: Selector agent chooses between `researcher` OR `analyzer` (graph allows both)
3. After `researcher`: Must go to `analyzer` (only one legal transition - optimized, no selector call)
4. After `analyzer`: Must go to `writer` (only one legal transition - optimized, no selector call)

## Key Features Tested

- **Multiple Legal Transitions**: Coordinator can choose researcher or analyzer (selector agent called)
- **Single Legal Transition**: Researcher → analyzer and analyzer → writer (selector bypassed for optimization)
- **Graph Enforcement**: Selector can only choose from graph-allowed members
- **AI-Driven Selection**: Coordinator makes intelligent choice based on conversation context

## Running

```bash
chainsaw test
```

Validates that graph-constrained selector teams combine AI-driven participant selection with workflow graph constraints, providing both flexibility and structure.

