# Graph-Selector Hybrid - Implementation Plan

## Current State Analysis

### Graph Strategy (`team_graph.go`)
- Uses `transitionMap map[string]string` (one-to-one)
- Current validation: **prevents multiple edges with same `from`** (line 182-184)
- **Deterministic**: follows single edge path, no AI involved

### Selector Strategy (`team_selector.go`)
- Uses **selector agent** (AI agent specified in `selector.agent`) to decide who talks next
- Selector agent can choose from **all members** (no constraints)
- **AI-driven**: The selector agent makes the decision each turn
- In ARK: Selector agent is visible/configurable (user specifies `selector.agent`)
- In LegacyX: Selector agent was "hidden" (internal implementation detail)

### What We Need

**Graph-Constrained Selector** (enhance existing selector strategy):
- Build `legalTransitions map[string][]string` (one-to-many) - **different from current graph**
- **Constrain the selector agent** to only choose from legal transitions
- **Skip selector agent call** when `len(legal) == 1` (optimization - no AI needed)
- Make `graph` optional for `selector` strategy (when provided, applies constraints)

**Key insight**: "The hybrid constrains the selector agent on which transitions were legal. If there is only 1 legal transition, then you don't need the selector agent."

## Implementation Steps

### 1. Update Validation (`team_webhook.go`)

**Current Issue**: Line 182-184 prevents multiple edges with same `from`:
```go
if _, exists := transitionMap[edge.From]; exists {
    return fmt.Errorf("member '%s' has more than one outgoing edge", edge.From)
}
```

**Solution**: 
- **Keep this check for `strategy: graph`** (deterministic, one-to-one)
- **Remove this check for `strategy: selector`** when `graph` is provided (allows multiple edges to constrain selector agent)

**Update validation**:
```go
case "selector":
    // Validate selector agent
    if err := v.validateSelectorAgent(ctx, team); err != nil {
        return err
    }
    // If graph provided, validate it (but allow multiple edges from same source)
    if team.Spec.Graph != nil {
        return v.validateGraphForSelector(team)
    }
    return nil
```

**New function**: `validateGraphForSelector` - validates graph but allows multiple edges with same `from`

### 2. Enhance `executeSelector` in `team_selector.go`

**Modify existing function** (don't create new file)

**Key changes**:
- Build `legalTransitions map[string][]string` if `graph` is provided
- **Constrain selector agent** to only choose from legal transitions
- **Skip selector agent call** when `len(legal) == 1` (optimization - no AI needed)
- Filter members to legal transitions before calling selector agent

**Logic flow**:
1. If `graph` provided → build `legalTransitions`
2. For each turn:
   - If no previous member → use first member
   - Get legal transitions for previous member
   - If 0 legal → fallback to first (log warning)
   - If 1 legal → **skip selector agent**, use that member directly
   - If 2+ legal → **constrain selector agent** to only those members, then call it

### 3. Update `team.go` Switch Statement

**No changes needed!** The strategy remains `selector`, we just enhance `executeSelector` to check for `graph` field.

### 4. Update Error Message

**No changes needed!** Strategy name stays `selector`.

## Code Structure

### `executeGraphSelector` Pseudocode

```go
func (t *Team) executeGraphSelector(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
    // 1. Build legalTransitions map (one-to-many)
    legalTransitions := make(map[string][]string)
    for _, edge := range t.Graph.Edges {
        legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
    }
    
    // 2. Setup (similar to executeSelector)
    messages := append([]Message{}, history...)
    var newMessages []Message
    firstMember := t.Members[0].GetName()
    previousMember := ""
    
    // 3. Setup selector (similar to executeSelector)
    promptTemplate := defaultSelectorPrompt
    if t.Selector != nil && t.Selector.SelectorPrompt != "" {
        promptTemplate = t.Selector.SelectorPrompt
    }
    tmpl, err := template.New("selector").Parse(promptTemplate)
    // ... error handling
    
    // 4. Main loop
    for turn := 0; ; turn++ {
        // Determine next member
        var nextMember TeamMember
        var memberIndex int
        
        if previousMember == "" {
            // First turn - use first member
            nextMember = t.Members[0]
            memberIndex = 0
        } else {
            // Get legal transitions
            legal := legalTransitions[previousMember]
            
            if len(legal) == 0 {
                // No transitions - fallback to first
                // Log warning
                nextMember = t.Members[0]
                memberIndex = 0
            } else if len(legal) == 1 {
                // Only one option - use it directly (skip AI!)
                selectedName := legal[0]
                // Find member
                for i, m := range t.Members {
                    if m.GetName() == selectedName {
                        nextMember = m
                        memberIndex = i
                        break
                    }
                }
            } else {
                // Multiple options - filter members and use AI
                legalMembers := []TeamMember{}
                legalIndices := []int{}
                for i, m := range t.Members {
                    for _, legalName := range legal {
                        if m.GetName() == legalName {
                            legalMembers = append(legalMembers, m)
                            legalIndices = append(legalIndices, i)
                            break
                        }
                    }
                }
                
                // Build filtered participant/role lists
                filteredParticipants := buildParticipants(legalMembers)
                filteredRoles := buildRoles(legalMembers)
                
                // Call selectMember with filtered lists (modified version)
                selectedMember, selectedIndex, err := t.selectMemberFromLegal(
                    ctx, messages, tmpl, 
                    filteredParticipants, filteredRoles, 
                    previousMember, legalMembers, legalIndices)
                // ... error handling
                nextMember = selectedMember
                memberIndex = selectedIndex
            }
        }
        
        // Execute member (same as other strategies)
        // ... executeMemberAndAccumulate ...
        
        previousMember = nextMember.GetName()
        
        // Check maxTurns (same as other strategies)
        // ...
    }
}
```

## Helper Function Needed

```go
// Modified version of selectMember that works with filtered member list
func (t *Team) selectMemberFromLegal(
    ctx context.Context, 
    messages []Message, 
    tmpl *template.Template, 
    participantsList, rolesList, previousMember string,
    legalMembers []TeamMember,
    legalIndices []int,
) (TeamMember, int, error) {
    // Similar to selectMember but:
    // 1. Uses legalMembers instead of t.Members
    // 2. Returns index from legalIndices
    // 3. Only searches in legalMembers
}
```

## Testing Strategy

1. **No previous member** → uses first member
2. **No legal transitions** → fallback to first member
3. **Single legal transition** → uses it directly (verify no AI call)
4. **Multiple legal transitions** → AI selects from filtered list
5. **Invalid AI response** → fallback to first member
6. **MaxTurns reached** → stops execution
7. **Termination** → handles terminate tool correctly

## Files to Modify

1. `ark/internal/genai/team_selector.go` - **Enhance `executeSelector`** to check for graph constraints
2. `ark/internal/genai/team_selector.go` - **Modify `selectMember`** to work with filtered member lists
3. `ark/internal/webhook/v1/team_webhook.go` - **Update validation** to allow multiple edges for selector strategy
4. `ark/api/v1alpha1/team_types.go` - No changes needed (already supports multiple edges)
5. `ark/internal/genai/team.go` - No changes needed (strategy name stays `selector`)

## Validation Changes

**Current `validateGraphStrategy`** (line 160-193):
- Prevents multiple edges with same `from` (line 182-184)
- This is correct for `graph` strategy (deterministic, one-to-one)

**Solution**:
- Create `validateGraphForSelector` that:
  - Validates graph exists
  - Validates edges reference valid members
  - **Allows multiple edges with same `from`** (selector agent will choose)
  - **Does NOT require maxTurns** (selector strategy handles this differently)
- Update `validateStrategy` to call `validateGraphForSelector` when `strategy: selector` and `graph` is provided

