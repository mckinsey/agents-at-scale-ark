---
type: adr
title: "Agent Runtime Standalone Capability"
owner: Daniel Sheard
status: proposed
superseded_by: null
---

# Agent Runtime Standalone Capability

**Owner:** Daniel Sheard
**Status:** proposed

## Context

Ark is currently tightly coupled to Kubernetes. While this provides powerful enterprise capabilities (namespace isolation, RBAC, declarative configuration, scaling), it creates significant friction for individual developers:

1. **High barrier to entry**: Developers must set up a local Kubernetes cluster (Minikube, Kind, Docker Desktop) before building their first agent
2. **Overhead mismatch**: A single developer building one agent faces the same infrastructure complexity as an enterprise deployment
3. **Development velocity**: Local k8s environments are resource-intensive and slow to iterate on compared to native development
4. **Argo workflow performance**: For some use cases (e.g., Genesis), Argo workflows proved too slow for interactive agent execution

The core insight driving this evaluation: _"An enterprise deployment is just lots of individual developers building individual agents."_ If we optimise for the single-developer experience, we inherently improve the enterprise experience.

### Current Architecture

Ark's controller is built with kubebuilder and controller-runtime, using Kubernetes primitives throughout:

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CRDs: Agent, Model, Tool, Query, Team, MCPServer   │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                    ┌──────▼──────┐                          │
│                    │ Ark Controller│                         │
│                    │    (Go)      │                          │
│                    └──────┬──────┘                          │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │executor-    │  │  ark-api    │  │ark-evaluator│         │
│  │langchain    │  │  (Python)   │  │  (Python)   │         │
│  │  (Python)   │  └─────────────┘  └─────────────┘         │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

Key coupling points in the controller code:

- `sigs.k8s.io/controller-runtime` for reconciliation loops
- CRD-based status conditions and owner references
- Kubernetes RBAC, secrets, and configmaps for configuration
- Namespace isolation for multi-tenancy

## Options

### Option 1: Enhanced Developer Experience on Current Architecture

**Description:** Maintain the current Kubernetes-based architecture but improve the developer experience through better tooling, centralized development environments, and streamlined local development scripts.

This could include:

- A centrally-hosted, namespaced development Kubernetes cluster where developers get isolated namespaces
- Enhanced `ark` CLI commands for common development workflows
- Docker Compose-based local development that mimics the k8s environment
- Better port-forwarding and proxy tooling

**Pros:**

- Lowest implementation effort — no architecture changes required
- Leverages existing infrastructure investment
- Central dev environment removes local k8s setup requirement
- Consistent behaviour between dev and production

**Cons:**

- Does not address the fundamental barrier to entry
- Network latency and connectivity requirements for central dev environment
- Docker Compose "simulation" creates environment parity risk
- Still requires k8s knowledge for debugging and advanced use cases
- Does not solve the "overhead mismatch" problem for simple agents

**Estimated Cost:** Low — Primarily tooling and infrastructure investment, minimal code changes.

---

### Option 2: Kubernetes API Aggregation with Alternative Storage

**Description:** Use the Kubernetes API Aggregation Layer to build an extension API server for Ark resources. This server can run standalone (without a full k8s cluster) and use alternative storage backends like SQLite for local development.

The K8s API Aggregation Layer allows custom API servers to register with the main API server. Crucially, these extension API servers can also run independently, providing a kubectl-compatible interface without requiring etcd or a full Kubernetes installation.

This would involve:

- Building an aggregated API server for Ark CRDs (Agent, Model, Tool, Query, etc.)
- Implementing storage backends: etcd (production), SQLite (local), in-memory (testing)
- The controller continues using controller-runtime against this API server
- Single binary that can run in "standalone" or "k8s-integrated" mode

**How it works:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Production (K8s)                          │
│  ┌─────────────────┐     ┌─────────────────────────────┐   │
│  │ K8s API Server  │────▶│  Ark Extension API Server   │   │
│  └─────────────────┘     │  (aggregated, uses etcd)    │   │
│                          └─────────────────────────────┘   │
│                                      │                      │
│                               ┌──────▼──────┐              │
│                               │Ark Controller│              │
│                               └─────────────┘              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 Local Development                            │
│         ┌─────────────────────────────────────┐             │
│         │  Ark Extension API Server            │             │
│         │  (standalone, uses SQLite)          │             │
│         └─────────────────────────────────────┘             │
│                          │                                   │
│                   ┌──────▼──────┐                           │
│                   │Ark Controller│                           │
│                   │ (same code) │                           │
│                   └─────────────┘                           │
│                                                              │
│  $ kubectl apply -f agent.yaml  ← Still works!              │
└─────────────────────────────────────────────────────────────┘
```

**Benefits for Query execution:**

Queries are high-volume, transient resources that don't need the durability guarantees of etcd. Moving them to an extension API server with SQLite or in-memory storage:

- Reduces etcd load in production
- Enables fast local execution without k8s overhead
- Maintains the same Query CRD interface

**Pros:**

- Single codebase — controller code unchanged between modes
- Maintains kubectl semantics — familiar developer experience
- Full feature parity — same API, same controller, different storage
- Clean upgrade path — local YAML files work in production
- Reduces etcd load for transient resources (Queries)
- Well-established k8s pattern (used by metrics-server, etc.)

**Cons:**

- Requires building a custom API server (non-trivial Go work)
- Need to implement storage backend abstraction
- Local mode still requires running the API server process
- Some k8s features (RBAC, admission webhooks) need simulation or exclusion in standalone mode
- Less common pattern — fewer examples and documentation

**Estimated Cost:** Medium-High — Significant upfront investment in the API server, but controller code remains unchanged. Well-defined k8s extension pattern reduces risk compared to a ground-up rewrite.

---

### Option 3: ArkLite Simulator for Local Development

**Description:** Build a separate, lightweight runtime specifically designed for local agent development. ArkLite would be a standalone binary that developers run locally, providing core agent capabilities without Kubernetes.

ArkLite would support:

- Single agent execution with model binding
- MCP tool integration
- Memory persistence (file-based)
- Query execution
- Basic evaluation

ArkLite would NOT support:

- Teams and delegation
- Multi-agent orchestration
- Workflow execution (Argo)
- Enterprise features (RBAC, namespace isolation)

**Pros:**

- Optimised for the single-developer use case
- Fast startup, minimal resource usage
- Clear separation of concerns — ArkLite for dev, Ark for production
- Could share core libraries (agent execution, MCP client) with full Ark
- Scoped feature set reduces complexity

**Cons:**

- Two codebases to maintain
- Risk of drift between ArkLite and Ark behaviour
- "Works in dev, breaks in prod" scenarios
- Features available in dev may not translate to prod (and vice versa)
- Onboarding still requires understanding both systems for production deployment

**Estimated Cost:** Medium — New project with focused scope. Requires defining clear boundaries and sharing code appropriately.

---

### Option 4: Adopt Docker cagent as Core Runtime

**Description:** Use Docker's open-source [cagent](https://github.com/docker/cagent) as the core agent runtime for both development and production. Ark becomes an enterprise orchestration layer that wraps cagent with Kubernetes operators, marketplace, and platform capabilities.

cagent provides:

- Declarative agent definitions (YAML)
- Multi-model provider support (OpenAI, Anthropic, Bedrock, etc.)
- MCP tool integration
- A2A (Agent-to-Agent) protocol support
- Docker sandboxes for secure code execution
- Single container runtime — no Kubernetes required
- Bundled in Docker Desktop 4.49+

Ark would retain responsibility for:

- Kubernetes operator for enterprise deployment (deploying cagent containers)
- Namespace isolation and multi-tenancy
- Marketplace and skill distribution
- Development workbench and IDE integrations
- Evaluation framework
- Observability integration (Phoenix, Langfuse)
- Enterprise security and compliance

**Architecture with cagent:**

```
┌────────────────────────────────────────┐
│         Local Development               │
│  ┌──────────────────────────────────┐  │
│  │           cagent                  │  │
│  │    (agent.yaml → execution)      │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│         ┌───────▼───────┐              │
│         │  MCP Servers  │              │
│         └───────────────┘              │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│      Enterprise (Kubernetes)           │
│  ┌──────────────────────────────────┐  │
│  │        Ark Operator               │  │
│  │  (deploys/manages cagent pods)   │  │
│  └──────────────┬───────────────────┘  │
│       ┌─────────┼─────────┐            │
│       ▼         ▼         ▼            │
│  ┌────────┐ ┌────────┐ ┌────────┐     │
│  │cagent  │ │cagent  │ │cagent  │     │
│  │Agent A │ │Agent B │ │Agent C │     │
│  └────────┘ └────────┘ └────────┘     │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Ark Platform Services            │  │
│  │  • Marketplace  • Evaluation     │  │
│  │  • Workbench   • Observability   │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Pros:**

- Docker backing provides credibility, maintenance, and community
- Already supports key capabilities: A2A, MCP, sandboxes
- Single container runtime — no k8s required for development
- Declarative YAML similar to current Ark patterns
- Bundled in Docker Desktop — near-zero setup for developers
- Aligns with the "individual developer building one agent" use case
- Ark focuses on enterprise differentiation rather than core runtime

**Cons:**

- cagent is still marked as experimental (as of January 2026)
- Loss of control over core runtime evolution
- Need to map existing Ark abstractions to cagent patterns
- Team/hierarchy features in cagent may not match Ark's model
- Vendor dependency on Docker (though open source mitigates this)
- Migration path for existing Ark users requires evaluation

**Estimated Cost:** Medium — New integration layer, but leverages existing open-source runtime. Requires validating cagent capabilities match Ark requirements.

---

## Comparison Matrix

| Criterion                       | Option 1   | Option 2    | Option 3   | Option 4   |
| ------------------------------- | ---------- | ----------- | ---------- | ---------- |
| **Developer barrier reduction** | Low        | High        | High       | High       |
| **Implementation effort**       | Low        | Medium-High | Medium     | Medium     |
| **Enterprise deployment**       | Unchanged  | Enhanced    | Separate   | Enhanced   |
| **Maintenance burden**          | Low        | Medium      | Medium     | Low        |
| **Feature parity dev/prod**     | High       | Very High   | Low        | High       |
| **Strategic alignment**         | Poor       | Good        | Good       | Best       |
| **Risk level**                  | Low        | Medium      | Medium     | Medium     |
| **Time to value**               | 1-2 months | 3-4 months  | 3-4 months | 2-3 months |

### Scoring Notes

- **Developer barrier reduction**: How much does this option reduce the friction for a new developer building their first agent?
- **Strategic alignment**: Does this option address the root cause ("enterprise is lots of individual developers")?
- **Feature parity**: Can developers expect consistent behaviour between development and production?
- **Maintenance burden**: Ongoing cost of maintaining this solution long-term

## Option Combinations

These options are not mutually exclusive. Potential combinations include:

### Option 2 + Option 4: API Aggregation with cagent Runtime

Use cagent as the agent execution runtime, but wrap it with an Ark extension API server. This provides:

- kubectl interface for resource management (from Option 2)
- Docker-backed agent execution (from Option 4)
- SQLite storage for local development
- Full k8s integration for production

This combination offers the best of both approaches: familiar k8s patterns for those who want them, Docker simplicity for those who don't.

### Option 1 + Option 2: Incremental Migration

Start with Option 1 (improved DevEx tooling) while building the API aggregation layer (Option 2) in parallel. This provides immediate value while working toward the longer-term architecture.

## Decision

TBD — This ADR presents options for evaluation. A decision will be made after stakeholder review.

### Questions to Resolve

1. **Priority**: Is optimising local developer experience the primary goal, or are enterprise features equally important?
2. **Docker dependency**: Is there appetite to depend on Docker/cagent as a core component?
3. **Feature scope**: What Ark features are must-haves in a standalone/lite version?
4. **Migration**: What is the acceptable migration burden for existing Ark users?
5. **Timeline**: What are the timeline constraints for this decision?
6. **API Aggregation expertise**: Does the team have experience with Kubernetes extension API servers, or would this require ramping up?
7. **kubectl requirement**: Is maintaining kubectl compatibility important for developer adoption, or would a simpler CLI suffice?

## Outcome

Pending decision.

## References

### Kubernetes API Aggregation

- [Kubernetes API Aggregation Layer](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/apiserver-aggregation/)
- [Configure the Aggregation Layer](https://kubernetes.io/docs/tasks/extend-kubernetes/configure-aggregation-layer/)
- [Setup an Extension API Server](https://kubernetes.io/docs/tasks/extend-kubernetes/setup-extension-api-server/)
- [sample-apiserver](https://github.com/kubernetes/sample-apiserver) — Reference implementation

### Docker cagent

- [Docker cagent GitHub repository](https://github.com/docker/cagent)
- [Docker cagent documentation](https://docs.docker.com/ai/cagent/)
- [Docker cagent A2A integration](https://docs.docker.com/ai/cagent/integrations/a2a/)
- [Docker AI sandboxes](https://docs.docker.com/ai/sandboxes/)

### Ark Internal

- Ark controller implementation: `ark/internal/controller/`
- Ark design principles: `docs/content/developer-guide/design-principles.mdx`
- Query execution flow: `docs/content/reference/query-execution.mdx`
