# Harel Demo

Consolidated demo folder for a 45-minute Ark platform tour. Deploys all resource types so every dashboard sidebar item is populated.

## Prerequisites

- Ark operator running in your cluster
- `default-model-token` secret created for Azure OpenAI
- Optional: `ark-evaluator` and `postgres-memory` services deployed
- Optional: Argo Workflows installed (for workflow demo)

## Deploy

```bash
# Deploy all main namespace resources
kubectl apply -k samples/harel-demo/

# Deploy multi-namespace examples
kubectl apply -f samples/harel-demo/namespaces/claims-ops/
kubectl apply -f samples/harel-demo/namespaces/virtual-agents/

# Deploy Claude/Gemini models (requires API keys)
export ANTHROPIC_API_KEY="your-key"
envsubst < samples/harel-demo/models/claude.yaml | kubectl apply -f -

export GEMINI_API_KEY="your-key"
envsubst < samples/harel-demo/models/gemini.yaml | kubectl apply -f -

# Deploy Argo workflow (requires Argo Workflows)
kubectl apply -f samples/harel-demo/workflows/research-workflow.yaml
```

## What's Included

| Category   | Resources                                                  |
|------------|------------------------------------------------------------|
| Models     | Azure GPT-4o (default), Claude, Gemini                     |
| Tools      | get-coordinates, get-forecast, web-search, create-post     |
| MCP        | filesystem                                                 |
| Agents     | weather, researcher, analyst, creator                      |
| Teams      | research-analysis-team (sequential)                        |
| Queries    | weather, team, memory (x3 with session)                    |
| Evals      | evaluator + weather evaluation                             |
| Memory     | postgres-memory backed                                     |
| Workflows  | Argo WorkflowTemplate for research                         |
| Namespaces | claims-ops, virtual-agents (multi-tenant demo)             |

## Memory Demo

The three memory queries share `sessionId: harel-demo-session-001`. Apply them in order to demonstrate context retention:

```bash
kubectl apply -f samples/harel-demo/queries/memory-query-1.yaml
kubectl apply -f samples/harel-demo/queries/memory-query-2.yaml
kubectl apply -f samples/harel-demo/queries/memory-followup.yaml
```

## Cleanup

```bash
kubectl delete -k samples/harel-demo/
kubectl delete ns claims-ops virtual-agents
```
