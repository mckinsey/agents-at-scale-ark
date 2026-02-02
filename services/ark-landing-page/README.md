# Ark Landing Page

Multi-demo landing page that automatically discovers and lists Ark demos running in the cluster.

## How It Works

The landing page:
1. Queries Kubernetes API for namespaces with label `ark.mckinsey.com/demo=true`
2. Verifies each namespace has an HTTPRoute configured
3. Only shows demos that are fully deployed and accessible
4. Automatically updates when new demos are added

## Quick Start

### Prerequisites

- Kubernetes cluster (minikube, kind, or cloud)
- Ark controller installed in `ark-system` namespace
- Gateway API installed with `localhost-gateway`

### Deploy Landing Page

```bash
cd services/ark-landing-page
devspace deploy
```

This deploys the landing page to `ark-system` namespace with:
- RBAC permissions to list namespaces and HTTPRoutes
- HTTPRoute for `127.0.0.1.nip.io`
- Service and Deployment

### Access Locally

**Option 1: Port-forward**
```bash
kubectl port-forward -n ark-system svc/ark-landing-page 3002:3000
# Access: http://localhost:3002
```

**Option 2: minikube tunnel**
```bash
minikube tunnel
# Access: http://127.0.0.1.nip.io
```

## Creating a New Demo

### Option 1: Use Marketplace Bundle (Recommended)

Install a complete demo with agents, teams, dashboard, and API:

```bash
cd agents-at-scale-marketplace/demos/kyc-demo-bundle
helm install kyc-demo ./chart -n kyc-demo --create-namespace
```

**This installs:**
- Ark dashboard + API
- HTTPRoute (auto-configured)
- Demo-specific agents and teams
- File gateway and workflows
- Namespace with demo labels

**The demo automatically appears on the landing page!** ✨

> **Note:** The marketplace bundle should include dashboard and API as dependencies. If it doesn't yet, see the manual setup below.

### Option 2: Manual Setup (Namespace Only)

For testing or custom setups, create just the namespace:

```bash
kubectl apply -f examples/demo-namespaces/kyc-demo.yaml
```

This creates a namespace with demo labels but **no services**. You'll need to manually deploy:
1. ark-dashboard with `httpRoute.enabled=true`
2. ark-api
3. Your demo content (agents, teams, etc.)

See the marketplace bundle for reference on complete demo setup.

### Accessing Your Demo

**Local (port-forward):**
```bash
# Dashboard
kubectl port-forward -n kyc-demo svc/ark-dashboard 3003:3000

# API (required for dashboard to work)
kubectl port-forward -n kyc-demo svc/ark-api 8000:80

# Access: http://localhost:3003?namespace=kyc-demo
```

**Production (or minikube tunnel):**
```bash
# Access: http://kyc-demo.127.0.0.1.nip.io
```

## Demo Requirements

For a namespace to appear on the landing page, it must have:

1. **Label** (required):
   ```yaml
   labels:
     ark.mckinsey.com/demo: "true"
   ```

2. **HTTPRoute** (required - proves demo is accessible):
   - Created automatically by ark-dashboard Helm chart when `httpRoute.enabled=true`
   - Routes hostname to dashboard service

3. **Annotations** (optional):
   ```yaml
   annotations:
     ark.mckinsey.com/demo-name: "Display Name"
     ark.mckinsey.com/demo-description: "Description text"
   ```

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

### Run Locally

```bash
npm install
PORT=3002 npm run dev
```

The landing page runs on `http://localhost:3002`.

**Required port-forwards:**

For each demo to work locally, you need two port-forwards running:

```bash
# Dashboard (required for UI)
kubectl port-forward -n kyc-demo svc/ark-dashboard 3003:3000

# API (required for data)
kubectl port-forward -n kyc-demo svc/ark-api 8000:80
```

The landing page automatically:
- Detects `localhost` and uses port-forward URLs
- Redirects kyc-demo → `http://localhost:3003?namespace=kyc-demo`
- Adds `?namespace=` parameter to load the correct namespace

### Build

```bash
npm run build
npm start
```

## Deployment

Deploy the landing page to your Kubernetes cluster:

```bash
helm install ark-landing-page ./chart -n ark-system
```

> **Note:** For deploying demos (including CI/CD workflows), see the [agents-at-scale-marketplace](https://github.com/mckinsey/agents-at-scale-marketplace) repository.
