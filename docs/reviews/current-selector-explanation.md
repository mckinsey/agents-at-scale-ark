# Current Selector Strategy - What It Does

## Current Behavior

**Strategy**: `selector`

**How it works** (from `team_selector.go`):

1. **Each turn**:
   - Calls `selectMember()` which uses an **AI selector agent** to choose the next team member
   - The selector agent receives:
     - **All team members** as candidates (line 162: `participantsList := buildParticipants(t.Members)`)
     - Roles/descriptions of all members
     - Full conversation history
   - The selector agent **chooses any member from the entire team** (no constraints)
   - The selected member executes
   - Loop continues

2. **No constraints**: The selector can choose **any member** at any time - there's no workflow structure, no restrictions on which member can follow which other member.

3. **Example**:
   ```yaml
   strategy: selector
   selector:
     agent: coordinator
   members:
     - name: researcher
     - name: analyst
     - name: writer
   ```
   
   **Execution**: 
   - Turn 1: AI might choose `writer`
   - Turn 2: AI might choose `researcher` 
   - Turn 3: AI might choose `writer` again
   - **Any member can be selected at any time** - completely free-form

## What We Want to Add

**Graph-constrained selector**: The **selector agent** (the AI agent that decides who talks next) is **constrained** to only choose from legal graph transitions.

**Key insight**: "The hybrid constrains the selector agent on which transitions were legal. If there is only 1 legal transition, then you don't need the selector agent."

**Example**:
```yaml
strategy: selector
selector:
  agent: coordinator  # This is the selector agent (visible in ARK, hidden in LX)
graph:
  edges:
    - from: researcher
      to: analyst
    - from: researcher
      to: writer  # Multiple options from researcher
    - from: analyst
      to: writer
members:
  - name: researcher
  - name: analyst
  - name: writer
```

**Execution**:
- Turn 1: Start with `researcher` (first member)
- Turn 2: After `researcher`, graph allows `analyst` OR `writer` → **Selector agent** chooses from these 2 only (constrained)
- Turn 3: If `analyst` was chosen, graph only allows `writer` → **Skip selector agent!** (use `writer` directly - optimization)
- Turn 4: After `writer`, no edges → fallback or stop

**Key differences**:
- **Without graph**: Selector agent can choose from all 3 members every turn
- **With graph**: Selector agent is **constrained** to only legally allowed transitions
- **Optimization**: When only 1 legal transition → skip selector agent call (no AI needed)

## The Question

Should this be:
- **A) Separate strategy** (`graph-selector` or `graph-with-selector`)? 
  - Pros: Clear separation, explicit
  - Cons: Code duplication, more strategies
  
- **B) Enhanced selector** (keep `strategy: selector`, make `graph` optional)?
  - Pros: Matches LegacyX pattern, no duplication, backward compatible
  - Cons: Need to clarify that `graph` is optional for selector

## Naming Clarification

If we go with Option B (enhance selector):
- Strategy name stays: `selector`
- When `graph` is provided → selector uses graph constraints
- When `graph` is not provided → current selector behavior (all members)

If we need to refer to this pattern in docs:
- "selector with graph constraints"
- "graph-constrained selector"
- NOT "graph-selector" (sounds like "an agent that selects a graph")

