# Graph + Selector Hybrid Strategy - Review

## User Story Summary

**As a developer**, when implementing features for Agents@Scale, I want to create a **graph + selector hybrid** so that teams can utilize both functionalities effectively.

**Acceptance Criteria**: Implement a graph + selector hybrid for teams strategies as it was needed for LegacyX.

**Discovery Phase**: First step needed to understand what is available in Agents@Scale (LegacyX) to define what needs to be done.

---

## Current State Analysis

### ARK Current Implementation

**Graph Strategy** (`team_graph.go`):
- Deterministic execution following defined edges
- Uses `transitionMap` mapping `from` → `to` (one-to-one)
- Starts with first member in `members` array
- Stops when no outgoing edge exists
- No AI involvement in selection

**Selector Strategy** (`team_selector.go`):
- AI-driven selection from **all** team members
- Uses selector agent to analyze conversation history
- No constraints on which members can be selected
- Template-based prompts with conversation context

**Current Strategy Options**:
- `sequential` - Fixed order execution
- `round-robin` - Cyclic execution
- `selector` - AI chooses from all members
- `graph` - Deterministic graph traversal

### LegacyX Implementation

**Hybrid Approach** (`selector_group.py`):
- **AI-driven selection** (like selector)
- **Constrained by graph edges** (like graph)
- Uses `legal_transitions` dictionary: `{member_name: [allowed_next_members]}`
- Supports `first`/`leader` member concept
- Intelligent selection logic:
  1. If no previous speaker → use `first` speaker
  2. Look up `legal_transitions[previous]` → get allowed next speakers
  3. If only one option → use it directly (no AI call)
  4. If multiple options → use AI selector to choose among them
  5. If no valid transitions → fallback to `first` speaker

**Key Code Pattern** (lines 85-122):
```python
async def select_speaker(self, thread):
    previous = self._previous_speaker
    
    # No previous → use first speaker
    if previous is None:
        return self._first_speaker
    
    # Get allowed transitions from graph
    legal = self._legal_transitions.get(previous) or []
    
    # No transitions → fallback to first
    if not legal:
        return self._first_speaker
    
    # Only one option → use it directly
    if len(legal) == 1:
        return legal[0]
    
    # Multiple options → use AI to select
    # Update participant list to only legal options
    self._participant_names = legal
    return await super().select_speaker(thread)  # AI selection
```

---

## Key Differences

| Aspect | ARK Graph | ARK Selector | LegacyX Hybrid |
|--------|-----------|--------------|----------------|
| Selection Method | Deterministic | AI-driven | AI-driven |
| Constraints | Single edge (`from`→`to`) | None (all members) | Multiple edges (`from`→`[to1, to2, ...]`) |
| AI Involvement | No | Yes (always) | Yes (only when multiple options) |
| First/Leader | First in array | First in array | Configurable `first` member |
| Optimization | N/A | N/A | Skips AI when only one option |

---

## Implementation Requirements

### 1. CRD Changes (`team_types.go`)

**Current**:
```go
type TeamSpec struct {
    Strategy    string            `json:"strategy"`
    Selector    *TeamSelectorSpec `json:"selector,omitempty"`
    Graph       *TeamGraphSpec    `json:"graph,omitempty"`
}
```

**Proposed**: Add new strategy option `graph-selector` or `hybrid`

**Considerations**:
- Strategy name: `graph-selector`, `hybrid`, or `selector-graph`?
- Should `graph` field support multiple `to` targets per `from`?
- Should `first` member be configurable or default to `members[0]`?

### 2. Graph Structure Enhancement

**Current Graph** (`TeamGraphSpec`):
```go
type TeamGraphEdge struct {
    From string `json:"from"`
    To   string `json:"to"`  // Single target
}
```

**Decision**: Keep current structure but allow **multiple edges with same `from`** (matches LegacyX pattern):
```yaml
graph:
  edges:
    - from: researcher
      to: analyzer
    - from: researcher
      to: writer  # Multiple options from researcher
```

**Rationale**:
- Simpler to implement (no array changes)
- Backward compatible with existing graph strategy
- Matches LegacyX behavior (multiple edges = multiple targets)
- Easier to validate and understand

**Implementation**: Build `legalTransitions` map from edges:
```go
legalTransitions := make(map[string][]string)
for _, edge := range graph.Edges {
    legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
}
```

### 3. Execution Logic (`team_graph_selector.go`)

**New Function**: `executeGraphSelector`

**Logic Flow** (based on LegacyX implementation):
1. Build `legalTransitions` map: `map[string][]string` (member → allowed next members)
   ```go
   legalTransitions := make(map[string][]string)
   for _, edge := range t.Graph.Edges {
       legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
   }
   ```

2. Determine `firstMember`: 
   - Option A: First member in `members` array (current behavior)
   - Option B: Add optional `firstMember` field to TeamSpec (future enhancement)

3. Track `previousMember` (initially empty)

4. For each turn:
   - If `previousMember == ""` → use `firstMember`
   - Get `legal := legalTransitions[previousMember]`
   - If `len(legal) == 0` → fallback to `firstMember` (log warning)
   - If `len(legal) == 1` → use that member directly (no AI call - optimization!)
   - If `len(legal) > 1` → filter `t.Members` to only `legal` members, then call selector AI
   - Execute selected member
   - Update `previousMember = selectedMember.GetName()`

5. Repeat until termination or `maxTurns`

**Key Optimization**: Skip AI call when only one valid option exists (significant performance/cost benefit).

### 4. Validation Updates (`team_webhook.go`)

**Current Validation**:
```go
case "selector":
    return v.validateSelectorAgent(ctx, team)
case "graph":
    return v.validateGraphStrategy(team)
```

**Proposed**: Add validation for hybrid:
```go
case "graph-selector":
    if err := v.validateGraphStrategy(team); err != nil {
        return err
    }
    return v.validateSelectorAgent(ctx, team)
```

### 5. Documentation Updates

- Update `docs/content/reference/resources/team.mdx`
- Update `docs/content/user-guide/samples/teams/team-strategies.mdx`
- Add sample YAML configuration
- Document the optimization (skipping AI when only one option)

---

## Discovery Findings ✅

### 1. Graph Structure in LegacyX

**Graph Definition** (`squad.py:156-165`):
- Built from `agent.can_talk_with(other)` method
- Each agent has a `talk_with` field (list of agent names)
- If `talk_with` is empty → agent can talk to all other agents
- Graph structure: `{agent: [list_of_peers]}` (dictionary mapping agent → list of peers)

**Example**:
```python
agent_graph = {
    planner: [executor, analyst, reviewer],
    executor: [reviewer],
    analyst: [planner, executor],
    reviewer: [planner]
}
```

**Key Insight**: LegacyX supports **multiple targets per source** (one-to-many), which is different from ARK's current one-to-one graph edges.

### 2. Leader/First Speaker

**Validation** (`squad.py:108-110`):
- Each squad **must have exactly one leader**
- Leader is marked with `leader: true` field on agent
- Leader is used as the `first` speaker in hybrid selector
- If no leader specified → validation error

**Access** (`squad.py:132-133`):
```python
@property
def leader(self):
    return next((a for a in self.agents if a.leader is True), None)
```

### 3. Selector Behavior

**Invalid Selection Handling**:
- Selector AI only chooses from `legal` transitions (filtered before AI call)
- If AI returns invalid member → fallback to `first_speaker`
- If AI returns list → takes first element
- If AI returns None/empty → fallback to `first_speaker`

**Cycles**: Graph can have cycles (e.g., `reviewer` → `planner` → `executor` → `reviewer`)

**Default Selector Prompt**: Uses Autogen's default selector prompt (not custom in LegacyX)

### 4. Edge Cases (from tests)

**Test Coverage** (`test_selector_group.py`):
- ✅ No previous speaker → use `first_speaker`
- ✅ No legal transitions → fallback to `first_speaker`
- ✅ Single legal transition → use it directly (no AI call)
- ✅ Multiple legal transitions → use AI to select from filtered list
- ✅ Invalid AI response (None/list/empty) → fallback to `first_speaker`
- ✅ Previous speaker as list → extract first element

**Unreachable Members**: Not explicitly handled in tests, but would result in no legal transitions → fallback to `first_speaker`

### 5. Performance Optimization

**Skip AI When Only One Option**:
- When `len(legal) == 1` → directly use that member
- No AI call needed, reducing latency and cost
- This is a key optimization in the hybrid approach

**Implementation**: Check `legal_transitions` before calling AI selector

---

## Proposed Implementation Plan

### Phase 1: Discovery ✅ COMPLETE
1. ✅ Review LegacyX implementation (`selector_group.py`)
2. ✅ Review LegacyX squad/group configuration (`groups.py`, `squad.py`)
3. ✅ Understand `agent_graph` structure in LegacyX
4. ✅ Identify edge cases and fallback behaviors (from tests)

### Phase 2: Design
1. Decide on strategy name (`graph-selector` recommended)
2. Design graph structure (multiple edges vs. multiple `to` targets)
3. Design `first` member specification (optional field vs. default)
4. Design validation rules

### Phase 3: Implementation
1. Update CRD types (`team_types.go`)
2. Implement `executeGraphSelector` (`team_graph_selector.go`)
3. Update validation (`team_webhook.go`)
4. Update team execution switch (`team.go`)
5. Add tests (`team_graph_selector_test.go`)

### Phase 4: Documentation
1. Update reference documentation
2. Add sample YAML configurations
3. Document optimization behavior
4. Update dashboard UI (if needed)

---

## Sample YAML Configuration

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: hybrid-research-team
spec:
  strategy: graph-selector
  maxTurns: 10
  
  # Required: Both graph and selector must be specified
  graph:
    edges:
      - from: planner
        to: researcher
      - from: planner
        to: analyst  # Multiple options from planner
      - from: researcher
        to: analyst
      - from: analyst
        to: writer
      - from: analyst
        to: reviewer  # Multiple options from analyst
  
  selector:
    agent: coordinator  # Required for graph-selector
    selectorPrompt: |
      Choose the best participant from {{.Participants}}.
      History: {{.History}}
  
  members:
    - name: planner
      type: agent
    - name: researcher
      type: agent
    - name: analyst
      type: agent
    - name: writer
      type: agent
    - name: reviewer
      type: agent
```

**Execution Flow**:
1. Start with `planner` (first member)
2. After `planner` → AI chooses between `researcher` or `analyst`
3. If `researcher` selected → only option is `analyst` (no AI call)
4. After `analyst` → AI chooses between `writer` or `reviewer`
5. Continue until termination or maxTurns

---

## Design Decisions ✅

### 1. Strategy Name
**Decision**: `graph-selector` (recommended)
- Clear and descriptive
- Indicates it combines both strategies
- Follows existing naming pattern

### 2. Graph Structure
**Decision**: Keep current structure, allow multiple edges with same `from`
- Backward compatible
- Matches LegacyX pattern
- Simpler implementation

### 3. First Member
**Decision**: Use `members[0]` initially (can add optional field later)
- Matches current ARK behavior
- Simpler MVP implementation
- Can enhance later with optional `firstMember` field

### 4. Backward Compatibility
**Decision**: Keep `graph` strategy separate, add new `graph-selector` strategy
- No breaking changes to existing `graph` strategy
- Clear separation of concerns
- Users can choose deterministic vs. AI-driven

### 5. UI Updates
**Decision**: Update dashboard to support `graph-selector` strategy
- Add option to strategy dropdown
- Show both graph and selector configuration when strategy is `graph-selector`
- Validate that both `graph` and `selector` are specified

## Remaining Open Questions

1. **Validation**: Should we validate that all graph edges reference valid members?
2. **Cycles**: Should we detect and warn about cycles in the graph?
3. **Isolated Nodes**: Should we validate that all members are reachable?
4. **First Member**: Should we add an optional `firstMember` field to TeamSpec for future enhancement?

---

## Next Steps

1. **Complete Discovery**: Review LegacyX codebase to answer discovery questions
2. **Design Review**: Get consensus on strategy name and graph structure
3. **Implementation**: Start with Phase 3 implementation
4. **Testing**: Create comprehensive tests for edge cases
5. **Documentation**: Update all relevant documentation

