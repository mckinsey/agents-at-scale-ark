# YAML to Code Translation Flow

This document explains how YAML configuration files are translated into Go code execution.

## Complete Translation Path

```
YAML File
    ↓
kubectl apply -f team.yaml
    ↓
Kubernetes API Server
    ↓
Kubernetes CRD (Custom Resource Definition)
    ↓
Controller watches CRD changes
    ↓
Controller reads CRD via Kubernetes client
    ↓
CRD → Go Struct (arkv1alpha1.Team)
    ↓
MakeTeam() converts to genai.Team
    ↓
Team.Execute() routes by strategy
    ↓
executeSelector() reads Graph field
    ↓
Code execution
```

## Step-by-Step Breakdown

### Step 1: YAML Definition (What You Write)

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: research-pipeline
  namespace: default
spec:
  strategy: selector
  selector:
    agent: coordinator
  members:
    - type: agent
      name: researcher
  graph:
    edges:
      - from: researcher
        to: analyzer
```

### Step 2: Kubernetes CRD Types (Go Structs)

The YAML is automatically deserialized into Go structs defined in `ark/api/v1alpha1/team_types.go`:

```go
// api/v1alpha1/team_types.go

type TeamSpec struct {
    Members     []TeamMember      `json:"members"`
    Strategy    string            `json:"strategy"`           // ← "selector"
    Selector    *TeamSelectorSpec `json:"selector,omitempty"` // ← {agent: "coordinator"}
    Graph       *TeamGraphSpec    `json:"graph,omitempty"`    // ← {edges: [...]}
}

type TeamSelectorSpec struct {
    Agent          string `json:"agent,omitempty"`          // ← "coordinator"
    SelectorPrompt string `json:"selectorPrompt,omitempty"`
}

type TeamGraphSpec struct {
    Edges []TeamGraphEdge `json:"edges"`                  // ← [{from: "researcher", to: "analyzer"}]
}

type TeamGraphEdge struct {
    From string `json:"from"`  // ← "researcher"
    To   string `json:"to"`    // ← "analyzer"
}

// The main CRD type
type Team struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`  // ← name, namespace
    Spec   TeamSpec   `json:"spec,omitempty"`       // ← All the spec fields above
    Status TeamStatus `json:"status,omitempty"`
}
```

**Key Point**: The `json:"..."` tags tell Kubernetes how to map YAML fields to struct fields.

### Step 3: Controller Reads CRD

When a Query targets a Team, the controller reads it from Kubernetes:

```go
// internal/controller/query_controller.go:744

func (r *QueryReconciler) executeTeam(...) {
    // 1. Fetch Team CRD from Kubernetes
    var teamCRD arkv1alpha1.Team
    teamKey := types.NamespacedName{Name: teamName, Namespace: query.Namespace}
    
    if err := impersonatedClient.Get(ctx, teamKey, &teamCRD); err != nil {
        return nil, fmt.Errorf("unable to fetch team %v, error:%w", teamKey, err)
    }
    
    // teamCRD now contains:
    //   teamCRD.Spec.Strategy = "selector"
    //   teamCRD.Spec.Selector.Agent = "coordinator"
    //   teamCRD.Spec.Graph.Edges[0] = {From: "researcher", To: "analyzer"}
    
    // 2. Convert CRD to executable Team struct
    team, err := genai.MakeTeam(ctx, impersonatedClient, &teamCRD, tokenCollector, r.Telemetry)
    // ...
}
```

### Step 4: MakeTeam() - CRD to Executable Struct

`MakeTeam()` converts the Kubernetes CRD into an executable `genai.Team` struct:

```go
// internal/genai/team.go:193

func MakeTeam(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, ...) (*Team, error) {
    // 1. Load team members (agents) from Kubernetes
    members, err := loadTeamMembers(ctx, k8sClient, crd, recorder, telemetryProvider)
    
    // 2. Create executable Team struct
    return &Team{
        Name:              crd.Name,              // ← "research-pipeline"
        Members:           members,               // ← Loaded Agent objects
        Strategy:          crd.Spec.Strategy,      // ← "selector"
        Description:       crd.Spec.Description,
        MaxTurns:          crd.Spec.MaxTurns,
        Selector:          crd.Spec.Selector,      // ← {Agent: "coordinator"}
        Graph:             crd.Spec.Graph,        // ← {Edges: [...]}
        Client:            k8sClient,
        Namespace:         crd.Namespace,
        // ... other fields
    }, nil
}
```

**Key Point**: The `genai.Team` struct directly uses the CRD fields:
- `crd.Spec.Strategy` → `team.Strategy`
- `crd.Spec.Selector` → `team.Selector`
- `crd.Spec.Graph` → `team.Graph`

### Step 5: Team.Execute() - Strategy Routing

The `Execute()` method reads the `Strategy` field to route to the correct execution function:

```go
// internal/genai/team.go:38

func (t *Team) Execute(ctx context.Context, userInput Message, ...) {
    // Read strategy from YAML → CRD → Team struct
    switch t.Strategy {  // ← "selector" from YAML
    case "selector":
        execFunc = t.executeSelector  // ← Routes here
    case "graph":
        execFunc = t.executeGraph
    case "sequential":
        execFunc = t.executeSequential
    // ...
    }
    
    return t.executeWithTracking(teamTracker, execFunc, ...)
}
```

### Step 6: executeSelector() - Reads Graph Field

The `executeSelector()` function reads the `Graph` field to build constraints:

```go
// internal/genai/team_selector.go:232

func (t *Team) executeSelector(ctx context.Context, userInput Message, history []Message) {
    // Build legal transitions map if graph constraints are provided
    legalTransitions := make(map[string][]string)
    
    // Read Graph field from YAML → CRD → Team struct
    if t.Graph != nil {  // ← Checks if graph section exists in YAML
        // Read edges from YAML → CRD → Team struct
        for _, edge := range t.Graph.Edges {  // ← Iterates over graph.edges from YAML
            legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
            // edge.From = "researcher" (from YAML)
            // edge.To = "analyzer" (from YAML)
        }
    }
    
    // Read Selector field from YAML → CRD → Team struct
    if t.Selector != nil && t.Selector.SelectorPrompt != "" {
        promptTemplate = t.Selector.SelectorPrompt
    }
    
    // ... rest of execution logic
}
```

## Field Mapping Reference

| YAML Field | CRD Struct | Executable Struct | Used In |
|------------|------------|-------------------|---------|
| `spec.strategy` | `TeamSpec.Strategy` | `Team.Strategy` | `Team.Execute()` routing |
| `spec.selector.agent` | `TeamSelectorSpec.Agent` | `Team.Selector.Agent` | `loadSelectorAgent()` |
| `spec.selector.selectorPrompt` | `TeamSelectorSpec.SelectorPrompt` | `Team.Selector.SelectorPrompt` | `executeSelector()` |
| `spec.graph.edges[].from` | `TeamGraphEdge.From` | `Team.Graph.Edges[].From` | `executeSelector()` builds `legalTransitions` |
| `spec.graph.edges[].to` | `TeamGraphEdge.To` | `Team.Graph.Edges[].To` | `executeSelector()` builds `legalTransitions` |
| `spec.members[].name` | `TeamMember.Name` | `Team.Members[].GetName()` | All execution paths |
| `spec.members[].type` | `TeamMember.Type` | `Team.Members[].GetType()` | `loadTeamMember()` |

## How JSON Tags Work

The `json:"..."` tags enable automatic YAML/JSON deserialization:

```go
type TeamGraphEdge struct {
    From string `json:"from"`  // ← YAML field "from" maps to From field
    To   string `json:"to"`    // ← YAML field "to" maps to To field
}
```

When Kubernetes reads this YAML:
```yaml
graph:
  edges:
    - from: researcher
      to: analyzer
```

It automatically creates:
```go
TeamGraphEdge{From: "researcher", To: "analyzer"}
```

## Key Takeaways

1. **YAML → CRD**: Kubernetes automatically deserializes YAML into Go structs using `json` tags
2. **CRD → Executable**: `MakeTeam()` converts `arkv1alpha1.Team` CRD to `genai.Team` executable struct
3. **Direct Field Access**: The executable struct directly references CRD fields (no copying needed)
4. **Strategy Routing**: `Team.Execute()` uses `Strategy` field to route to correct execution function
5. **Graph Usage**: `executeSelector()` reads `Graph` field to build constraint maps

## Example: Full Trace

Given this YAML:
```yaml
spec:
  strategy: selector
  graph:
    edges:
      - from: researcher
        to: analyzer
```

The code flow:
1. Kubernetes deserializes → `teamCRD.Spec.Strategy = "selector"`
2. Kubernetes deserializes → `teamCRD.Spec.Graph.Edges[0] = {From: "researcher", To: "analyzer"}`
3. `MakeTeam()` → `team.Strategy = "selector"`, `team.Graph.Edges[0] = {From: "researcher", To: "analyzer"}`
4. `Team.Execute()` → sees `team.Strategy == "selector"` → calls `executeSelector()`
5. `executeSelector()` → sees `team.Graph != nil` → builds `legalTransitions["researcher"] = ["analyzer"]`

## How to Debug

To see what the controller is reading:

```go
// Add logging in query_controller.go:executeTeam()
log.Printf("Team CRD: Strategy=%s, Graph=%+v", teamCRD.Spec.Strategy, teamCRD.Spec.Graph)

// Or in MakeTeam()
log.Printf("Team struct: Strategy=%s, Graph=%+v", team.Strategy, team.Graph)
```

Or check the actual CRD in Kubernetes:
```bash
kubectl get team research-pipeline -o yaml
```

