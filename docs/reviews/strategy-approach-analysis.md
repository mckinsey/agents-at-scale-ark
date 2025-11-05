# Strategy Approach Analysis: Separate vs Enhancement

## Colleague Observations

1. **Kristóf**: "it's really in the middle" - could be seen as either:
   - Graph strategy + multiple edges (w/ selector)
   - Selector strategy + constrained graph edges

2. **Chris**: "in LX we literally took the selector code in autogen and added a subclass that limited the transitions"

## Key Insight from LegacyX

Looking at `LXSelectorGroupChatManager`:
- **Inherits from `SelectorGroupChatManager`** (selector is the base)
- **Adds `legal_transitions`** as a constraint
- **Overrides `select_speaker()`** to filter candidates before calling super()
- **Core logic is selector-based** - graph is just a filter

## Three Approaches

### Option A: Separate Strategy (`graph-selector`)
```yaml
strategy: graph-selector
graph:
  edges: [...]
selector:
  agent: coordinator
```

**Pros:**
- Clear separation
- Explicit configuration
- No ambiguity

**Cons:**
- Code duplication
- More strategies to maintain
- Doesn't match LegacyX pattern (which was selector enhancement)

### Option B: Enhance Graph Strategy
```yaml
strategy: graph
graph:
  edges: [...]
  allowMultiple: true  # Allow multiple edges from same source
selector:  # Optional
  agent: coordinator  # If provided, use AI; else deterministic
```

**Pros:**
- Graph strategy becomes more flexible
- Backward compatible (if selector not provided, current behavior)

**Cons:**
- Graph strategy becomes more complex
- **Mixes deterministic and AI-driven in same strategy**: This is a fundamental design issue:
  - **Current graph strategy** (`executeGraph`) is **purely deterministic** - it follows edges exactly, no AI involved, predictable execution path
  - **With selector enhancement**, graph strategy would have **two modes**:
    - Mode 1: No selector → deterministic (current behavior)
    - Mode 2: Selector provided → AI-driven (new behavior)
  - **Problems with mixing:**
    - **Unclear behavior**: Users can't tell if their graph will be deterministic or AI-driven just by looking at the strategy name
    - **Testing complexity**: Need to test both modes of the same strategy
    - **Mental model confusion**: "Graph" implies deterministic workflow, but then it can be AI-driven?
    - **Configuration ambiguity**: If both `graph` and `selector` are provided, what does `strategy: graph` mean? Is it deterministic or AI-driven?
    - **Telemetry/observability**: Strategy name "graph" doesn't tell you if AI was involved or not
    - **Performance implications**: Deterministic = predictable latency, AI-driven = variable latency - but strategy name is the same
  - **Example confusion:**
    ```yaml
    strategy: graph  # Is this deterministic or AI-driven?
    graph:
      edges: [...]
    selector:
      agent: coordinator  # Oh wait, it's AI-driven!
    ```
    vs
    ```yaml
    strategy: graph  # This one is deterministic
    graph:
      edges: [...]
    # No selector = deterministic
    ```
    Same strategy name, completely different execution models!
- Doesn't match LegacyX pattern

### Option C: Enhance Selector Strategy (Matches LegacyX) ⭐
```yaml
strategy: selector  # No new strategy name needed!
selector:
  agent: coordinator  # The selector agent (visible/configurable in ARK, hidden in LX)
graph:  # Optional constraint - when provided, constrains selector agent to legal transitions
  edges: [...]
```

**How it works**:
- **Selector agent** (the AI agent specified in `selector.agent`) decides who talks next
- **When `graph` provided**: The selector agent is **constrained** to only choose from legal transitions based on graph edges
- **When `graph` not provided**: Selector agent can choose from all members (current behavior)
- **Optimization**: If only 1 legal transition → skip selector agent call entirely (use that member directly)

**Key insight from colleague**: "The hybrid constrains the hidden agent (selector agent) on which transitions were legal. If there is only 1 legal transition, then you don't need the selector agent."

**Naming Note**: Since we're enhancing the existing `selector` strategy, we don't need a new strategy name. The strategy remains `selector` - the graph is just an optional constraint on the selector agent's choices. If we ever need to refer to this pattern in documentation, we could say "selector with graph constraints" or "graph-constrained selector".

**Pros:**
- ✅ Matches LegacyX approach (selector + constraints)
- ✅ Backward compatible (graph optional)
- ✅ Selector is the base, graph is the filter (matches code structure)
- ✅ Minimal code changes (enhance `selectMember` to filter by graph)
- ✅ Clear mental model: "selector with optional graph constraints"

**Cons:**
- Graph strategy validation currently prevents multiple edges - need to handle this
- Need to decide: should graph validation allow multiple edges for selector strategy?

## Code Structure Comparison

### LegacyX Structure
```python
class LXSelectorGroupChatManager(SelectorGroupChatManager):  # Inherits selector
    def __init__(self, first, legal_transitions, ...):
        super().__init__(...)  # Base selector logic
        self._legal_transitions = legal_transitions  # Add constraint
    
    async def select_speaker(self, thread):
        # Filter to legal transitions
        legal = self._legal_transitions.get(previous) or []
        if len(legal) == 1:
            return legal[0]  # Skip AI
        # Filter participant list
        self._participant_names = legal
        return await super().select_speaker(thread)  # Use base selector
```

### ARK Option C Structure
```go
func (t *Team) executeSelector(ctx context.Context, userInput Message, history []Message) {
    // ... existing selector setup ...
    
    // Build legal transitions if graph provided
    var legalTransitions map[string][]string
    if t.Graph != nil {
        legalTransitions = buildLegalTransitions(t.Graph.Edges)
    }
    
    for turn := 0; ; turn++ {
        // Filter members if graph constraints exist
        candidates := t.Members
        if legalTransitions != nil && previousMember != "" {
            legal := legalTransitions[previousMember]
            if len(legal) == 0 {
                // Fallback
            } else if len(legal) == 1 {
                // Skip AI, use directly
            } else {
                // Filter to legal members
                candidates = filterMembers(t.Members, legal)
            }
        }
        
        nextMember, err := t.selectMember(ctx, messages, tmpl, 
            buildParticipants(candidates),  // Use filtered candidates
            buildRoles(candidates), 
            previousMember)
        // ... rest of loop ...
    }
}
```

## Recommendation: Option C (Enhance Selector)

**Rationale:**
1. **Matches LegacyX pattern**: Selector base + graph constraints
2. **Minimal code changes**: Enhance existing `executeSelector` rather than new file
3. **Backward compatible**: Graph is optional, existing selector teams unaffected
4. **Clear mental model**: "AI selector with optional workflow constraints"
5. **Code reuse**: Don't duplicate selector logic

## Implementation Changes

### 1. Update `executeSelector` in `team_selector.go`
- Add graph constraint logic at the start
- Filter candidates before calling `selectMember`
- Skip AI when only one legal option

### 2. Update Validation
- Allow multiple edges with same `from` when `strategy: selector` and `graph` provided
- Keep current validation for `strategy: graph` (one-to-one)

### 3. Update `selectMember` Helper
- Make it work with filtered member lists (already does via parameters)

### 4. No New Strategy Needed
- Just enhance existing selector strategy

## YAML Examples

### Current Selector (No Graph)
```yaml
strategy: selector
selector:
  agent: coordinator
members: [...]
```

### Selector with Graph Constraints (New)
```yaml
strategy: selector
selector:
  agent: coordinator
graph:
  edges:
    - from: planner
      to: researcher
    - from: planner
      to: analyst  # Multiple options - AI chooses
    - from: researcher
      to: analyst  # Single option - no AI needed
members: [...]
```

### Current Graph (Still Works)
```yaml
strategy: graph
graph:
  edges:
    - from: researcher
      to: analyzer
    - from: analyzer
      to: writer
members: [...]
```

## Validation Changes

**Current `validateGraphStrategy`** prevents multiple edges from same `from` (line 182-184).

**New approach:**
- When `strategy: graph` → keep current validation (one-to-one)
- When `strategy: selector` + `graph` provided → allow multiple edges
- When `strategy: selector` + no `graph` → no graph validation needed

## Summary

**Recommendation: Enhance Selector Strategy (Option C)**

This matches the LegacyX approach where they subclassed selector to add constraints, keeps the codebase simpler, and maintains backward compatibility. The graph becomes an optional constraint on selector behavior, not a separate strategy.

**No New Strategy Name Needed**: The strategy remains `strategy: selector`. The presence of `graph` field signals that graph constraints should be applied. This is clearer than introducing a new strategy name like `graph-selector` (which could be misread as "an agent that selects a graph").

