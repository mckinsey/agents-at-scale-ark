---
name: multi-branch-cluster-setup
description: Set up N isolated minikube clusters, one per Git worktree, for parallel Ark branch development. Use when the user wants to run multiple branches simultaneously, set up isolated Kubernetes environments per branch, create git worktrees with dedicated clusters, or configure devspace contexts for multi-branch development.
---

# Multi-Branch Cluster Setup

Provisions one minikube cluster per branch supplied by the user. The number of clusters matches the number of branches — 2 branches = 2 clusters, 4 branches = 4 clusters, etc.

**Cluster naming and port assignment (dynamic, based on branches provided):**

| # | Cluster name | Worktree | Branch | Dashboard | API | Gateway |
|---|---|---|---|---|---|---|
| 1 | `ark-cluster-1` | `$ARK_REPO` (main repo, no worktree needed if branch 1 = current) | branch 1 | :3274 | :8080 | :8090 |
| 2 | `ark-cluster-2` | `/tmp/ark-worktree-<branch2-slug>` | branch 2 | :3275 | :8081 | :8091 |
| 3 | `ark-cluster-3` | `/tmp/ark-worktree-<branch3-slug>` | branch 3 | :3276 | :8082 | :8092 |
| N | `ark-cluster-N` | `/tmp/ark-worktree-<branchN-slug>` | branch N | :3273+N | :8079+N | :8089+N |

Port formula: Dashboard = 3273+N, API = 8079+N, Gateway = 8089+N

## Prerequisites check

Run before starting:

```bash
minikube version && kubectl version --client && helm version --short && devspace version && docker info | grep "Total Memory"
```

Set your repo path (replace with your actual checkout location):

```bash
export ARK_REPO=~/agents-at-scale-ark  # adjust if cloned elsewhere
```

**Docker Desktop memory requirement:** ~0.7 GB base + (N × 2.2 GB). For 3 clusters: ~7 GB minimum.
Set via Docker Desktop → Settings → Resources → Memory.

## Step 1 — Extract branches from the user's request

If the user's message contains branch names (e.g. "create clusters with branch1 branch2 branch3"), extract all of them directly — do NOT ask for confirmation.

- The number of clusters = the number of branches provided
- Assign each branch to `ark-cluster-N` (N = 1, 2, 3...)
- Branch slug = branch name with `/` replaced by `-`
- Branch 1 uses `$ARK_REPO` directly if it matches the current checkout; otherwise also gets a worktree
- Branches 2..N each get a worktree at `/tmp/ark-worktree-<branchN-slug>`

If no branches are provided in the message, ask how many clusters and which branches.

## Step 2 — Create Git worktrees

For each branch beyond the first (or all branches if branch 1 differs from current checkout):

```bash
cd $ARK_REPO

# Repeat for each branch N >= 2:
git worktree add /tmp/ark-worktree-<branchN-slug> <BRANCHN>

# Verify
git worktree list
```

## Step 3 — Clean up and create clusters

Pass the branch names directly to the setup script — it handles cleanup, cluster creation, and devspace binding automatically:

```bash
bash .claude/skills/multi-branch-cluster-setup/scripts/setup-clusters.sh <branch1> <branch2> [branchN...]
```

The script:
1. Kills all running devspace/port-forward processes
2. Deletes all existing minikube profiles
3. Creates `ark-cluster-N` per branch (cluster-1: 3 GB / 3 CPUs, others: 2.2 GB / 2 CPUs)
4. Binds devspace context in each worktree
5. Writes `/tmp/ark-cluster-state.conf` — used by all subsequent scripts

## Step 4 — Deploy Ark to cluster-1

Deploy cluster-1 first. The **first build takes 30–45 min** (Go toolchain download + compilation). Subsequent clusters use image transfer to skip rebuilding.

```bash
cd $ARK_REPO

DOCKER_BUILDKIT=0 devspace deploy \
  --kube-context ark-cluster-1 \
  --namespace default \
  --skip-push-local-kube
```

**If ark-broker or ark-dashboard fail** with `context canceled` (buildx issue), deploy them manually:

```bash
# Build dashboard with legacy builder
cd $ARK_REPO/services/ark-dashboard
docker build -t ark-dashboard:main-local .
minikube image load ark-dashboard:main-local -p ark-cluster-1

helm upgrade --install ark-dashboard ./chart \
  --kube-context ark-cluster-1 --namespace default \
  --set image.repository=ark-dashboard \
  --set image.tag=main-local \
  --set image.pullPolicy=Never

# Deploy ark-api
docker tag ark-api:latest ark-api:main-local
minikube image load ark-api:main-local -p ark-cluster-1

helm upgrade --install ark-api ./services/ark-api/chart \
  --kube-context ark-cluster-1 --namespace default \
  --set image.repository=ark-api \
  --set image.tag=main-local \
  --set image.pullPolicy=Never \
  --set rbac.clusterWide=true
```

## Step 5 — Transfer images to other clusters (skip rebuilding)

Once cluster-1 is deployed, export its images and load into all remaining clusters:

```bash
bash .claude/skills/multi-branch-cluster-setup/scripts/transfer-images.sh
```

Then deploy remaining services via helm to each cluster 2..N:

```bash
# Repeat for each cluster beyond the first:
for CLUSTER in ark-cluster-2 ark-cluster-3 ...; do
  bash .claude/skills/multi-branch-cluster-setup/scripts/deploy-helm.sh $CLUSTER
done
```

## Step 6 — Start port forwarding

```bash
bash .claude/skills/multi-branch-cluster-setup/scripts/port-forward.sh start
```

Access dashboards at (ports increment per cluster):
- http://localhost:3274 → ark-cluster-1 (branch 1)
- http://localhost:3275 → ark-cluster-2 (branch 2)
- http://localhost:(3273+N) → ark-cluster-N (branch N)

## Common operations

```bash
# Check all cluster states
minikube profile list

# Check pods across all clusters
for c in $(minikube profile list -o json | jq -r '.[].Name'); do
  echo "=== $c ==="; kubectl get pods --context=$c -A --no-headers | grep -v kube-system
done

# Stop a specific cluster to free memory
minikube stop -p ark-cluster-2

# Port forward management
bash .claude/skills/multi-branch-cluster-setup/scripts/port-forward.sh status
bash .claude/skills/multi-branch-cluster-setup/scripts/port-forward.sh stop

# Run devspace dev on a specific worktree
cd /tmp/ark-worktree-<branch-slug> && devspace dev
```

## Troubleshooting

**CRD not found error after deploy:** The kubectl wait in the devspace pipeline uses the current context. Run `kubectl config use-context <cluster>` before re-running `devspace deploy`.

**context canceled on ark-broker/ark-dashboard:** Always caused by BuildKit. Set `DOCKER_BUILDKIT=0` or use the manual helm approach in Step 4.

**Memory pressure:** If pods are OOMKilled, stop clusters you aren't actively using (`minikube stop -p ark-cluster-N`). Each cluster uses ~2.2 GB.

**Stale devspace context:** Each worktree stores its context in `.devspace/generated.yaml`. If a cluster was deleted and recreated, re-run `devspace use context <cluster>` from that worktree.
