# Graph-Constrained Selector Strategy

## Overview

The **graph-constrained selector** is a hybrid orchestration strategy that combines the flexibility of AI-powered selection with the structure of workflow graphs. When using `strategy: selector` with an optional `graph` configuration, the selector agent will only choose from members that are "legal" according to the graph edges.

## How It Works

1. **Selector Strategy**: An AI agent (selector) decides which team member should speak next
2. **Graph Constraints**: The graph defines which transitions are allowed between members
3. **Hybrid Behavior**: The selector agent chooses from only the legally allowed candidates

## Key Benefits

- **Flexibility**: AI can make intelligent decisions based on conversation context
- **Structure**: Graph ensures workflow follows logical transitions
- **Optimization**: Single legal transition bypasses selector (no LLM call needed)
- **Intelligent Selection**: Multiple legal transitions let selector choose the best option

## Usage Examples

### Example 1: Linear Workflow with AI Selection

A research → analysis → review → writing pipeline where the selector chooses among valid next steps:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: research-team
spec:
  strategy: selector  # AI-powered selection
  members:
    - type: agent
      name: researcher
    - type: agent
      name: analyzer
    - type: agent
      name: reviewer
    - type: agent
      name: writer
  selector:
    agent: coordinator-agent  # Agent that makes selection decisions
  graph:
    edges:
      - from: researcher
        to: analyzer
      - from: analyzer
        to: reviewer
      - from: reviewer
        to: writer
```

**Execution Flow:**
1. First turn: Always starts with `researcher` (first member)
2. After `researcher`: Selector can only choose `analyzer` (only legal transition)
3. After `analyzer`: Selector can only choose `reviewer` (only legal transition)
4. After `reviewer`: Selector can only choose `writer` (only legal transition)

### Example 2: Branching Workflow with Multiple Options

A workflow where the selector can choose between multiple valid paths:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: decision-team
spec:
  strategy: selector
  members:
    - type: agent
      name: coordinator
    - type: agent
      name: researcher
    - type: agent
      name: analyst
    - type: agent
      name: writer
  selector:
    agent: coordinator-agent
  graph:
    edges:
      - from: coordinator
        to: researcher
      - from: coordinator
        to: analyst
      - from: researcher
        to: writer
      - from: analyst
        to: writer
```

**Execution Flow:**
1. First turn: Starts with `coordinator`
2. After `coordinator`: Selector chooses between `researcher` or `analyst` based on context
3. After `researcher` or `analyst`: Selector can only choose `writer` (only legal transition)

### Example 3: Selector Without Graph (Classic Behavior)

When no `graph` is provided, the selector can choose from **all** team members:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: free-selector-team
spec:
  strategy: selector
  members:
    - type: agent
      name: agent1
    - type: agent
      name: agent2
    - type: agent
      name: agent3
  selector:
    agent: coordinator-agent
  # No graph section - selector can choose any member
```

**Execution Flow:**
- Selector can choose any member (`agent1`, `agent2`, or `agent3`) at any time
- No constraints on transitions

## Behavior Details

### Optimization: Single Legal Transition

When there's only **one** legal transition from the current member, the system automatically selects that member **without** calling the selector agent. This saves an LLM call and improves performance.

**Example:**
```yaml
graph:
  edges:
    - from: researcher
      to: analyzer  # Only one option
```

After `researcher` finishes, `analyzer` is automatically selected (no selector agent call).

### Multiple Legal Transitions

When there are **multiple** legal transitions, the selector agent is called with only those candidates in the prompt.

**Example:**
```yaml
graph:
  edges:
    - from: coordinator
      to: researcher  # Option 1
    - from: coordinator
      to: analyst     # Option 2
```

After `coordinator` finishes, the selector agent receives a prompt like:
```
Select the next participant to respond from:
- researcher: Research specialist
- analyst: Data analyst

Previous conversation: [context...]
```

### No Legal Transitions

If a member has **no** legal transitions defined, the system falls back to the first team member and emits a warning event.

## Comparison with Other Strategies

| Strategy | Selection Method | Graph Support | Use Case |
|----------|-----------------|---------------|----------|
| `sequential` | Fixed order | No | Deterministic pipeline |
| `round-robin` | Rotating order | No | Balanced participation |
| `selector` | AI-powered | **Yes** | Intelligent workflow |
| `graph` | Graph-defined | Required | Strict workflow |

## Configuration Reference

### Required Fields

- `strategy: selector` - Must be set to use selector strategy
- `selector.agent` - Name of the agent that makes selection decisions
- `members[]` - List of team members

### Optional Fields

- `graph.edges[]` - Array of graph edges defining allowed transitions
  - `from` - Source member name
  - `to` - Target member name
- `selector.selectorPrompt` - Custom prompt template for the selector agent
- `maxTurns` - Maximum number of team turns

### Graph Edge Rules

- `from` and `to` must match member names exactly
- Multiple edges can have the same `from` (multiple options)
- Edges define **allowed** transitions, not required ones
- If no edges exist for a member, no transitions are allowed (fallback occurs)

## Best Practices

1. **Start with Simple Graphs**: Begin with linear workflows before adding branches
2. **Use Descriptive Member Names**: Make graph edges easy to understand
3. **Test Selector Agent**: Ensure your selector agent understands the selection task
4. **Monitor Events**: Watch for `NoLegalTransitions` warnings in production
5. **Optimize Single Paths**: For deterministic steps, use single-edge transitions (bypasses selector)

## Example: Complete Research Pipeline

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: coordinator
spec:
  prompt: "You are a coordinator. Select the best next team member based on the conversation context."
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: researcher
spec:
  prompt: "You are a research specialist. Gather information on the topic."
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: analyst
spec:
  prompt: "You are a data analyst. Analyze research findings."
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: writer
spec:
  prompt: "You are a writer. Create final reports."
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: research-pipeline
spec:
  strategy: selector
  maxTurns: 10
  members:
    - type: agent
      name: coordinator
    - type: agent
      name: researcher
    - type: agent
      name: analyst
    - type: agent
      name: writer
  selector:
    agent: coordinator
  graph:
    edges:
      - from: coordinator
        to: researcher
      - from: researcher
        to: analyst
      - from: analyst
        to: writer
      - from: writer
        to: coordinator  # Can loop back for iterations
```

This creates a workflow where:
- Coordinator starts the conversation
- Researcher gathers information
- Analyst processes the data
- Writer creates output
- Coordinator can restart the cycle for iterations

