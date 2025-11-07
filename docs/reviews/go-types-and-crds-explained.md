# Go Types and CRDs Explained

## What is a CRD?

**CRD = Custom Resource Definition**

A CRD is a way to extend Kubernetes with your own custom resources. Think of it as:

- **Kubernetes built-in resources**: Pod, Service, Deployment, ConfigMap, etc.
- **ARK custom resources**: Team, Agent, Query, Model, etc.

### Analogy

Think of Kubernetes like a database:
- **Built-in tables** (Pod, Service, etc.) come with Kubernetes
- **Custom tables** (Team, Agent, etc.) are defined by ARK using CRDs

### What CRDs Do

1. **Define the schema** - What fields are allowed, what types they are
2. **Enable kubectl** - You can `kubectl get teams`, `kubectl apply -f team.yaml`
3. **Enable validation** - Kubernetes validates YAML against the schema
4. **Enable controllers** - Controllers can watch and react to CRD changes

## Where Are Go Types Defined?

### Location: `ark/api/v1alpha1/`

All ARK custom resource types are defined in Go files here:

```
ark/api/v1alpha1/
├── team_types.go          ← Team, TeamSpec, TeamGraphSpec, etc.
├── agent_types.go         ← Agent, AgentSpec, etc.
├── query_types.go         ← Query, QuerySpec, etc.
├── model_types.go         ← Model, ModelSpec, etc.
├── common_types.go        ← Shared types (Parameter, ValueSource, etc.)
└── groupversion_info.go   ← API version configuration
```

### Example: Team Types

```go
// ark/api/v1alpha1/team_types.go

package v1alpha1

import (
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// TeamMember defines a member of a team
type TeamMember struct {
    Name string `json:"name"`
    Type string `json:"type"`
}

// TeamGraphEdge defines an edge in the workflow graph
type TeamGraphEdge struct {
    From string `json:"from"`  // Source member name
    To   string `json:"to"`    // Target member name
}

// TeamGraphSpec defines the graph structure
type TeamGraphSpec struct {
    Edges []TeamGraphEdge `json:"edges"`
}

// TeamSelectorSpec defines selector configuration
type TeamSelectorSpec struct {
    Agent          string `json:"agent,omitempty"`
    SelectorPrompt string `json:"selectorPrompt,omitempty"`
}

// TeamSpec defines the desired state of a Team
type TeamSpec struct {
    Members     []TeamMember      `json:"members"`
    Strategy    string            `json:"strategy"`
    Description string            `json:"description,omitempty"`
    MaxTurns    *int              `json:"maxTurns,omitempty"`
    Selector    *TeamSelectorSpec `json:"selector,omitempty"`
    Graph       *TeamGraphSpec    `json:"graph,omitempty"`
}

// TeamStatus defines the observed state of a Team
type TeamStatus struct{}

// Team is the main CRD type
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type Team struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`
    
    Spec   TeamSpec   `json:"spec,omitempty"`
    Status TeamStatus `json:"status,omitempty"`
}

// TeamList is for listing multiple Teams
// +kubebuilder:object:root=true
type TeamList struct {
    metav1.TypeMeta `json:",inline"`
    metav1.ListMeta `json:"metadata,omitempty"`
    Items           []Team `json:"items"`
}
```

## How Go Types → CRD YAML

### Step 1: Write Go Types

You write Go structs in `team_types.go` with:
- Field names (Go convention: PascalCase)
- JSON tags (maps to YAML: camelCase)
- Kubebuilder annotations (tells code generator what to do)

```go
type TeamGraphEdge struct {
    From string `json:"from"`  // ← Maps to YAML "from"
    To   string `json:"to"`    // ← Maps to YAML "to"
}
```

### Step 2: Generate CRD YAML

Run the code generator:

```bash
make manifests  # Generates CRD YAML files
```

This uses **kubebuilder/controller-gen** to:
1. Read Go types
2. Read kubebuilder annotations (`// +kubebuilder:...`)
3. Generate OpenAPI schema
4. Output CRD YAML file

### Step 3: Generated CRD YAML

The generator creates `ark/config/crd/bases/ark.mckinsey.com_teams.yaml`:

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: teams.ark.mckinsey.com
spec:
  group: ark.mckinsey.com
  names:
    kind: Team
    plural: teams
  versions:
  - name: v1alpha1
    schema:
      openAPIV3Schema:
        properties:
          spec:
            properties:
              graph:
                properties:
                  edges:
                    items:
                      properties:
                        from:
                          type: string
                        to:
                          type: string
                      required:
                      - from
                      - to
```

This CRD file tells Kubernetes:
- "There's a new resource type called `Team`"
- "It has these fields with these types"
- "Validate YAML files against this schema"

## The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Developer writes Go types                                │
│    ark/api/v1alpha1/team_types.go                           │
│                                                              │
│    type TeamGraphEdge struct {                              │
│        From string `json:"from"`                            │
│        To   string `json:"to"`                              │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Run code generator                                        │
│    make manifests                                            │
│                                                              │
│    Uses controller-gen to read Go types + annotations       │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Generated CRD YAML                                        │
│    ark/config/crd/bases/ark.mckinsey.com_teams.yaml         │
│                                                              │
│    Defines schema for Kubernetes                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Apply CRD to Kubernetes                                   │
│    kubectl apply -f ark/config/crd/bases/...teams.yaml      │
│                                                              │
│    Kubernetes now knows about "Team" resource               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. User creates Team YAML                                   │
│    kubectl apply -f my-team.yaml                            │
│                                                              │
│    Kubernetes validates against CRD schema                  │
│    Kubernetes stores the Team resource                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Controller reads Team CRD                                │
│    var teamCRD arkv1alpha1.Team                             │
│    k8sClient.Get(ctx, key, &teamCRD)                        │
│                                                              │
│    Kubernetes deserializes YAML → Go struct                 │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Code uses the struct                                     │
│    team := genai.MakeTeam(ctx, k8sClient, &teamCRD, ...)   │
│    team.Execute(...)                                         │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### 1. JSON Tags

```go
type TeamGraphEdge struct {
    From string `json:"from"`  // ← This maps YAML "from" → Go "From"
    To   string `json:"to"`    // ← This maps YAML "to" → Go "To"
}
```

**Purpose**: Tell Kubernetes how to convert between:
- YAML field names (lowercase, snake_case or camelCase)
- Go struct field names (PascalCase)

### 2. Kubebuilder Annotations

```go
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type Team struct {
    // ...
}
```

**Purpose**: Instructions for the code generator:
- `+kubebuilder:object:root=true` → "This is a root resource type"
- `+kubebuilder:subresource:status` → "Status is a subresource (can update separately)"

### 3. API Version

```go
// ark/api/v1alpha1/groupversion_info.go

var (
    GroupVersion = schema.GroupVersion{
        Group:   "ark.mckinsey.com",
        Version: "v1alpha1",
    }
)
```

**Purpose**: Defines the API group and version:
- Group: `ark.mckinsey.com`
- Version: `v1alpha1`
- Full API: `ark.mckinsey.com/v1alpha1`

## File Locations Summary

| Purpose | Location | Example |
|---------|----------|---------|
| **Go type definitions** | `ark/api/v1alpha1/*_types.go` | `team_types.go` |
| **Generated CRD YAML** | `ark/config/crd/bases/*.yaml` | `ark.mckinsey.com_teams.yaml` |
| **User YAML files** | `samples/`, `tests/`, anywhere | `my-team.yaml` |
| **Code generator command** | `ark/Makefile` | `make manifests` |

## How to See It in Action

### 1. View Go Types
```bash
cat ark/api/v1alpha1/team_types.go
```

### 2. View Generated CRD
```bash
cat ark/config/crd/bases/ark.mckinsey.com_teams.yaml
```

### 3. Regenerate CRD (if you change Go types)
```bash
cd ark
make manifests
```

### 4. Check if CRD is installed in Kubernetes
```bash
kubectl get crd teams.ark.mckinsey.com -o yaml
```

### 5. Create a Team and see it work
```bash
kubectl apply -f samples/teams/graph-strategy.yaml
kubectl get team graph-team-sample -o yaml
```

## Summary

- **Go Types**: Defined in `ark/api/v1alpha1/*_types.go`
- **CRD**: Generated from Go types using `make manifests`
- **CRD Purpose**: Tells Kubernetes about your custom resource schema
- **Flow**: Go Types → Code Generator → CRD YAML → Kubernetes → Controller reads it

The magic is that Kubernetes automatically deserializes YAML into your Go structs using the `json` tags you define!

