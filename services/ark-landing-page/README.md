# Ark Landing Page

Multi-demo landing page that discovers and lists Ark demos running in the cluster by checking namespaces with label `ark.mckinsey.com/demo=true`.

## Quick Start

```bash
cd services/ark-landing-page
helm install ark-landing-page ./chart -n ark-system
kubectl port-forward -n ark-system svc/ark-landing-page 3002:3000
# Access: http://localhost:3002
```

## Creating a Demo

Install a complete demo bundle:

```bash
cd agents-at-scale-marketplace/demos/kyc-demo-bundle
helm install kyc-demo ./chart -n kyc-demo --create-namespace
```

Or create just the namespace (requires manual dashboard/API deployment):

```bash
kubectl apply -f examples/demo-namespaces/kyc-demo.yaml
```

### Access Demo

```bash
# Port-forward all services
kubectl port-forward -n ark-system svc/ark-landing-page 3002:3000
kubectl port-forward -n kyc-demo svc/ark-dashboard 3003:3000
kubectl port-forward -n kyc-demo svc/ark-api 8000:80

# Landing page: http://localhost:3002
# Dashboard: http://localhost:3003?namespace=kyc-demo
```

## Read-Only Demo Mode

Deploy ark-api with read-only mode to prevent modifications:

```bash
helm install ark-api ./services/ark-api/chart -n kyc-demo \
  -f ./services/ark-landing-page/kyc-demo-values.yaml
```

Allows: viewing, chat, workflow runs. Blocks: create/edit/delete (returns 403).

## Demo Requirements

Namespace must have label `ark.mckinsey.com/demo: "true"` and an HTTPRoute (created by dashboard chart with `httpRoute.enabled=true`).

## Architecture

### How Demos Are Discovered

```
Landing Page API
    ↓
Kubernetes API: listNamespace()
    ↓
Filter: label ark.mckinsey.com/demo=true
    ↓
Kubernetes API: listClusterCustomObject('httproutes')
    ↓
Filter: namespace has HTTPRoute?
    ↓
Return only accessible demos
```

### Why Check HTTPRoute?

HTTPRoute serves two purposes:

1. **Routing** (primary): Routes `{namespace}.127.0.0.1.nip.io` → dashboard service
2. **Health indicator**: Proves dashboard is deployed and accessible

Without HTTPRoute verification, landing page would show "phantom" demos that give 404 errors.

### URL Convention

Landing page assumes: `namespace name = hostname`

- Namespace: `kyc-demo`
- HTTPRoute hostname: `kyc-demo.127.0.0.1.nip.io`
- Landing page URL: `http://kyc-demo.127.0.0.1.nip.io`

Dashboard Helm chart follows this convention automatically when you deploy.

## Development

```bash
make demo-page  # Installs deps, deploys demo, starts port-forwards and dev server
```

Or manually:

```bash
make install         # Install dependencies
make setup-demo      # Deploy demo
make port-forwards   # Start port-forwards
make dev            # Run dev server on http://localhost:3002
```

## Production

```bash
helm install ark-landing-page ./chart -n ark-system \
  --set app.env[0].name=NEXT_PUBLIC_BASE_DOMAIN \
  --set app.env[0].value=demos.your-domain.com
```

See `.env.example` for configuration options.
