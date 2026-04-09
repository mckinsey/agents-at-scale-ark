---
name: ark-setup-cluster
description: Set up and install the Ark platform in a Kubernetes cluster. Supports default mode (existing cluster) and isolated e2e testing mode (dedicated Kind cluster). Use when the user wants to install, deploy, test, or configure Ark.
---

# Ark Setup Cluster

Set up and install the Ark platform using ark-cli. Supports two modes:

- **Default**: Deploy Ark to an existing cluster
- **Isolated e2e**: Create a dedicated Kind cluster for testing without affecting existing clusters

## When to use this skill

- User wants to install or set up Ark
- Build manager needs an isolated cluster for e2e testing
- User needs to deploy Ark to their local cluster
- User needs to troubleshoot Ark installation issues

## Prerequisites

1. **Docker** - Required for Kind cluster creation
2. **kubectl** - Kubernetes CLI
3. **Helm** - For installing Ark components
4. **Node.js** - For building the ark-cli tool
5. **Kind** - For creating local clusters (`which kind`)

## Step 0: Check existing cluster state

**CRITICAL: Always check before creating or modifying clusters.**

```bash
kubectl cluster-info 2>/dev/null
kubectl get pods -n default 2>/dev/null | head -10
kind get clusters 2>/dev/null
```

### If a cluster is already running

**Never silently destroy an existing cluster.** It may have user data, demos, or in-progress work. Present options:

- **Option A: Reuse existing cluster** — deploy Ark into it. Fastest, but overwrites current Ark state.
- **Option B: Create isolated cluster** (recommended for e2e testing) — `kind create cluster --name ark-e2e-test`. Fully isolated, preserves existing cluster.
- **Option C: Replace existing cluster** — delete and recreate. Only if user explicitly confirms.

Wait for user to choose, or if called by the build manager for e2e testing, default to Option B.

## Step 1: Create cluster

### Default mode (existing cluster or new ark-cluster)

```bash
kind create cluster --name ark-cluster
```

### Isolated e2e testing mode

```bash
kind create cluster --name ark-e2e-test
kubectl config use-context kind-ark-e2e-test
```

### Configure kubeconfig (if running inside Docker/DinD)

```bash
CONTROL_PLANE_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <cluster-name>-control-plane)
kind get kubeconfig --name <cluster-name> --internal | sed "s/<cluster-name>-control-plane/$CONTROL_PLANE_IP/g" > ~/.kube/config
kubectl cluster-info
```

On Mac with Docker Desktop, the default kubeconfig works without IP replacement.

## Step 2: Build ark-cli from source

```bash
cd agents-at-scale-ark
npm install
cd tools/ark-cli
npm install
npm run build
```

## Step 3: Install Ark

```bash
node tools/ark-cli/dist/index.js install --yes --wait-for-ready 5m
```

If specific chart versions aren't published yet (e.g., on a feature branch), install components individually:

```bash
helm install ark-controller oci://mckinsey-ark-helm.jfrog.io/ark-helm/ark-controller --version <version>
helm install ark-tenant oci://mckinsey-ark-helm.jfrog.io/ark-helm/ark-tenant --version <version>
helm install ark-api oci://mckinsey-ark-helm.jfrog.io/ark-helm/ark-api --version <version>
helm install ark-dashboard oci://mckinsey-ark-helm.jfrog.io/ark-helm/ark-dashboard --version <version>
```

## Step 4: Verify installation

```bash
kubectl get pods -n default
kubectl get services -n default
```

Wait until all pods show **Running** and **Ready**.

## Step 5: Cleanup (e2e testing mode)

After testing is complete:

```bash
kind delete cluster --name ark-e2e-test
```

Restore original kubectl context if needed:

```bash
kubectl config use-context <original-context>
```

## Troubleshooting

### Docker not available
If `docker info` fails, Kind cannot create clusters. Report to user.

### Check pod status
```bash
kubectl get pods -A -o wide | grep -E '(ark|cert-manager)'
kubectl describe pod <pod-name>
```

### View logs
```bash
kubectl logs deployment/ark-api
kubectl logs -n ark-system deployment/ark-controller
```

## Important

- **DO NOT use `scripts/quickstart.sh`** — deprecated. Use ark-cli.
- **DO NOT use `npm install -g @agents-at-scale/ark`** — build from source to match the branch being tested.
- **CI uses K3s** (Linux-only). Local Mac testing uses Kind. Generally compatible but minor differences possible.
