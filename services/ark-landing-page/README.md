# Ark Landing Page

Landing page that discovers and lists Ark namespaces the signed-in user can access. Candidate namespaces are those carrying the label `ark.mckinsey.com/landing-page=true` (via the `ARK_TENANT_NAMESPACE_SELECTOR` env selector); the list is then gated per-user by RBAC (SelfSubjectAccessReview). Card name/description come from the `ark.mckinsey.com/landing-page-name` / `ark.mckinsey.com/landing-page-description` annotations. The label affects landing-page visibility only — it has no bearing on dashboard editability, which is governed by RBAC.

## Prerequisites

- [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- [Docker](https://docs.docker.com/get-docker/)
- [Helm](https://helm.sh/docs/intro/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Node.js 20+
- `localhost-gateway` chart deployed in `ark-system` namespace (see `services/localhost-gateway/`)

## Quick Start (Local Development)

From scratch, one command builds images, deploys everything to Minikube, and starts the landing page:

```bash
cd services/ark-landing-page
make demo-page
```

This will:
1. Build `ark-dashboard` and `ark-api` Docker images and load them into Minikube
2. Create the `kyc-demo` namespace with the `ark.mckinsey.com/landing-page=true` label
3. Deploy `ark-dashboard` (with HTTPRoute) and `ark-api` (with read-only mode) via Helm
4. Start port-forwards for dashboard (`:3003`) and API (`:8000`)
5. Run the landing page dev server on `http://localhost:3002`

### Step by Step (if you prefer)

```bash
make build-images       # Build Docker images and load into Minikube
make setup-demo         # Create namespace, deploy dashboard + API
make port-forwards      # Start port-forwards
make dev                # Run landing page dev server on http://localhost:3002
```

### Access

- Landing page: http://localhost:3002
- Dashboard (direct): http://localhost:3003?namespace=kyc-demo
- API (direct): http://localhost:8000

## Read-Only Mode

The `kyc-demo-values.yaml` enables `READ_ONLY_MODE=true` on the API — a deployment-wide toggle that blocks create/edit/delete operations at the API (returns 403), allowing only viewing, chat, and workflow runs. This is independent of any namespace label. Per-user/per-namespace editability is otherwise governed by RBAC (ark-api impersonates the signed-in user). The dashboard no longer disables mutation buttons based on a namespace label — a user without permission simply gets a 403 from the API when they act.

## Architecture

### How Demos Are Discovered

```
Landing Page API
    ↓
Kubernetes API: listNamespace(labelSelector: ARK_TENANT_NAMESPACE_SELECTOR)
    ↓
Filter: label ark.mckinsey.com/landing-page=true (via the selector)
    ↓
Per-namespace SelfSubjectAccessReview as the signed-in user (RBAC)
    ↓
Return only namespaces the user can access
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

Dashboard Helm chart follows this convention automatically when you deploy with `httpRoute.enabled=true`.

## Authentication

The landing page supports two authentication modes:

### Open Mode (default)

No authentication required. Users can access the landing page without logging in.

```bash
AUTH_MODE=open
```

### SSO Mode

Requires OIDC authentication. Users must log in via your identity provider before accessing the landing page.

```bash
AUTH_MODE=sso
OIDC_ISSUER_URL=https://your-identity-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_PROVIDER_NAME="Your Identity Provider"
OIDC_PROVIDER_ID=your-provider
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://landing.your-domain.com
BASE_URL=https://landing.your-domain.com
```

When `AUTH_MODE=sso`, all routes (except auth endpoints and static files) require authentication. Unauthenticated users are redirected to the sign-in page.

## Production

```bash
helm install ark-landing-page ./chart -n ark-system \
  --set app.env[0].name=NEXT_PUBLIC_BASE_DOMAIN \
  --set app.env[0].value=demos.your-domain.com \
  --set app.env[1].name=AUTH_MODE \
  --set app.env[1].value=sso
```

See `.env.example` for all configuration options.
