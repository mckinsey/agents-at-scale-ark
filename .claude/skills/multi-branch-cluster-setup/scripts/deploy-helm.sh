#!/usr/bin/env bash
# Deploy Ark application services to a cluster using pre-loaded images.
# Run AFTER transfer-images.sh has loaded the images.
# Usage: bash .claude/skills/multi-branch-cluster-setup/scripts/deploy-helm.sh <cluster-name>
# Example: bash ... ark-team-studio
set -euo pipefail

CLUSTER="${1:?Usage: $0 <cluster-name> (e.g. ark-team-studio)}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# ── RESOLVE IMAGE TAGS FROM CLUSTER ───────────────────────────────────────
echo "==> Discovering image tags in $CLUSTER..."
eval "$(minikube docker-env -p "$CLUSTER")"

CONTROLLER_TAG=$(docker images --format "{{.Tag}}" --filter "reference=ark-controller:*" | head -1)
COMPLETIONS_TAG=$(docker images --format "{{.Tag}}" --filter "reference=ark-completions:*" | head -1)
BROKER_TAG=$(docker images --format "{{.Tag}}" --filter "reference=ark-broker:*" | grep -v "latest" | head -1)
BROKER_TAG="${BROKER_TAG:-latest}"

eval "$(minikube docker-env -u)"

echo "    ark-controller  tag: $CONTROLLER_TAG"
echo "    ark-completions tag: $COMPLETIONS_TAG"
echo "    ark-broker      tag: $BROKER_TAG"

# ── INFRASTRUCTURE (devspace handles cert-manager, gateway, argo) ──────────
# These don't require image builds — deploy with devspace skip-push
echo ""
echo "==> Deploying infrastructure to $CLUSTER (cert-manager, gateway, argo-workflows)..."
kubectl config use-context "$CLUSTER"

DOCKER_BUILDKIT=0 devspace deploy \
  --kube-context "$CLUSTER" \
  --namespace default \
  --skip-push-local-kube 2>&1 | grep -E "Successfully|Skipping|fatal|error" || true

# ── APPLICATION SERVICES ───────────────────────────────────────────────────
echo ""
echo "==> Deploying Ark application services to $CLUSTER..."

helm upgrade --install ark-completions \
  "$REPO_ROOT/ark/executors/completions/chart" \
  --kube-context "$CLUSTER" --namespace ark-system \
  --set image.repository=ark-completions \
  --set "image.tag=$COMPLETIONS_TAG" \
  --set image.pullPolicy=Never \
  --wait 2>&1 | tail -3

helm upgrade --install ark-broker \
  "$REPO_ROOT/services/ark-broker/chart" \
  --kube-context "$CLUSTER" --namespace default \
  --set image.repository=ark-broker \
  --set "image.tag=$BROKER_TAG" \
  --set image.pullPolicy=Never \
  --wait 2>&1 | tail -3

helm upgrade --install ark-dashboard \
  "$REPO_ROOT/services/ark-dashboard/chart" \
  --kube-context "$CLUSTER" --namespace default \
  --set image.repository=ark-dashboard \
  --set image.tag=main-local \
  --set image.pullPolicy=Never \
  --wait 2>&1 | tail -3

helm upgrade --install ark-api \
  "$REPO_ROOT/services/ark-api/chart" \
  --kube-context "$CLUSTER" --namespace default \
  --set image.repository=ark-api \
  --set image.tag=main-local \
  --set image.pullPolicy=Never \
  --set rbac.clusterWide=true \
  --wait 2>&1 | tail -3

# ── VERIFY ─────────────────────────────────────────────────────────────────
echo ""
echo "==> Pods in $CLUSTER:"
kubectl get pods --context="$CLUSTER" -A --no-headers | grep -v kube-system
