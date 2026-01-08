---
name: Ark Setup
description: Set up and install the Ark platform from source. Use this skill when the user wants to install, deploy, or configure Ark in their local Kubernetes cluster.
---

# Ark Setup

This skill helps you set up and install the Ark platform from source using the ark-cli.

## When to use this skill

Use this skill when:
- User wants to install or set up Ark
- User needs to deploy Ark to their local cluster
- User asks about getting Ark running
- User needs to troubleshoot Ark installation issues

## Prerequisites

1. **Docker-in-Docker (DinD)** - Required for Kind to create clusters inside this container
2. **kubectl** - Kubernetes CLI
3. **Helm** - For installing Ark components
4. **Node.js** - For building the ark-cli tool

## Step 0: Verify Docker-in-Docker is available

**CRITICAL: You MUST verify Docker is accessible before attempting to create a Kind cluster.**

```bash
docker info
```

**If this command fails, STOP IMMEDIATELY.** Do not attempt to create a Kind cluster. Report to the user:

> "Cannot proceed: Docker is not available. Kind requires Docker-in-Docker (DinD) to create clusters inside this container. The container must be started with the `ark` profile (`devspace dev -p ark`) which adds the DinD sidecar."

If Docker is available, proceed to the next step.

## Step 1: Clone the Ark repository

First, ensure you have cloned the Ark repository. If the user provided an org/repo, use that. Otherwise, use the default:

```bash
git clone git@github.com:mckinsey/agents-at-scale-ark.git
cd agents-at-scale-ark
```

If working on a pull request, checkout the PR branch:

```bash
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
git checkout pr-<PR_NUMBER>
```

## Step 2: Set up Kubernetes cluster

### Step 2a: Clean up existing clusters

**CRITICAL: Always delete existing Kind clusters first to avoid conflicts and resource exhaustion.**

```bash
# Delete any existing ark-cluster
kind delete cluster --name ark-cluster 2>/dev/null || true

# Verify no ark-cluster exists
kind get clusters
```

### Step 2b: Create cluster and configure kubeconfig

```bash
# Create Kind cluster
kind create cluster --name ark-cluster

# REQUIRED: Get the control plane container's IP address
CONTROL_PLANE_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ark-cluster-control-plane)

# Export kubeconfig and replace hostname with IP
mkdir -p ~/.kube
kind get kubeconfig --name ark-cluster --internal | sed "s/ark-cluster-control-plane/$CONTROL_PLANE_IP/g" > ~/.kube/config

# Verify connection works
kubectl cluster-info
```

**Why IP address is required:** This agent runs inside Docker. The default `127.0.0.1` doesn't work across containers, and the `--internal` hostname may not be resolvable. Using the actual container IP ensures connectivity.

## Step 3: Build the ark-cli from source

Build the CLI from the cloned repository. This ensures you use the version matching the code being tested:

```bash
cd agents-at-scale-ark
npm install
cd tools/ark-cli
npm install
npm run build
```

## Step 4: Install Ark using ark-cli

Use the built CLI to install Ark. Use direct node execution for reliability:

```bash
# From the tools/ark-cli directory
node dist/index.js install --yes --wait-for-ready 5m
```

Or if you're in the repo root:

```bash
node tools/ark-cli/dist/index.js install --yes --wait-for-ready 5m
```

The `--yes` flag auto-confirms prompts, and `--wait-for-ready` waits for services to be ready.

## Step 5: Verify installation

Check installation status:

```bash
node tools/ark-cli/dist/index.js status
```

Or use kubectl:

```bash
kubectl get pods -n ark
kubectl get pods -n ark-system
kubectl get services -n ark
```

Wait until all pods show as **Running** and services are ready.

## Troubleshooting

### Docker not available / Kind fails to create cluster

If `docker info` fails or `kind create cluster` fails with Docker errors:

**STOP.** This container does not have Docker-in-Docker (DinD) configured. Report to the user:

> "Cannot create Kind cluster: Docker is not available. The container must be started with the `ark` profile (`devspace dev -p ark`)."

### Check pod status
```bash
kubectl get pods -A -o wide | grep -E '(ark|cert-manager)'
kubectl describe pod -n ark <pod-name>
```

### View logs
```bash
kubectl logs -n ark deployment/ark-api
kubectl logs -n ark-system deployment/ark-controller
```

### Kubeconfig issues with Kind
If kubectl/helm can't reach the cluster API server (connection refused or hostname not found):
```bash
# Get the control plane IP and reconfigure kubeconfig
CONTROL_PLANE_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ark-cluster-control-plane)
kind get kubeconfig --name ark-cluster --internal | sed "s/ark-cluster-control-plane/$CONTROL_PLANE_IP/g" > ~/.kube/config

# Verify the server address is an IP, not 127.0.0.1 or a hostname
kubectl config view --minify | grep server
# Should show: server: https://172.x.x.x:6443
```

## Working with Ark

Once Ark is running:

```bash
kubectl apply -f samples/agents/my-agent.yaml

kubectl get agents
kubectl get queries
kubectl get teams

kubectl describe agent <agent-name>
```

## Phoenix Telemetry

Install Phoenix for OpenTelemetry tracing:

```bash
node tools/ark-cli/dist/index.js install marketplace/services/phoenix
```

Access dashboard:
```bash
kubectl port-forward -n phoenix svc/phoenix-svc 6006:6006
# Open http://localhost:6006
```

## Important

**DO NOT use `scripts/quickstart.sh`** - it is deprecated. Always use `ark-cli` as described above.

**DO NOT use `npm install -g @agents-at-scale/ark`** - always build ark-cli from source to match the PR code being tested.
