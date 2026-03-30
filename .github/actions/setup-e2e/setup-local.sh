#!/usr/bin/env bash
set -euo pipefail

# Local E2E Setup Script
# Mirrors the GitHub Action setup-e2e for local testing
# Usage: ./setup-local.sh [--install-coverage]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"

# Default values
REGISTRY="${DOCKER_CICD_CACHE_REGISTRY:?required}"
REGISTRY_USERNAME="${DOCKER_CICD_CACHE_REGISTRY_USERNAME:?required}"
REGISTRY_PASSWORD="${DOCKER_CICD_CACHE_REGISTRY_PASSWORD:?required}"
ARK_IMAGE_TAG="${ARK_IMAGE_TAG:-local-test}"
INSTALL_COVERAGE="false"
STORAGE_BACKEND="etcd"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install-coverage)
      INSTALL_COVERAGE="true"
      shift
      ;;
    --storage-backend)
      STORAGE_BACKEND="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--install-coverage] [--storage-backend etcd|postgresql]"
      echo "  --install-coverage   Install coverage collection components"
      echo "  --storage-backend    Storage backend to use (default: etcd)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== Local ARK E2E Setup ==="
echo "Registry: ${REGISTRY}"
echo "ARK Image Tag: ${ARK_IMAGE_TAG}"
echo "Install Coverage: ${INSTALL_COVERAGE}"
echo "Storage Backend: ${STORAGE_BACKEND}"
echo

# Check kubectl context
echo "=== Checking Kubernetes Context ==="
kubectl config current-context
kubectl get nodes
echo


# Install cert-manager if not present
echo "=== Installing cert-manager ==="
if ! helm list -n cert-manager | grep -q cert-manager; then
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --set crds.enabled=true
else
  echo "cert-manager already installed"
fi

echo "=== Installing Gateway API CRDs ==="
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml

if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  echo "=== Installing PostgreSQL (ark-storage-dev) ==="
  helm upgrade --install ark-storage-dev "${REPO_ROOT}/charts/ark-storage-dev" \
    --namespace ark-system \
    --create-namespace \
    --wait --timeout=120s

  echo "=== Waiting for PostgreSQL Pod Readiness ==="
  kubectl -n ark-system wait --for=condition=ready pod -l app=ark-storage-dev --timeout=120s
fi

echo "=== Installing ARK Controller ==="
cd "${REPO_ROOT}/ark"

HELM_ARGS=(
  --namespace ark-system
  --create-namespace
  --wait --timeout=300s
  --set controllerManager.container.image.repository="${REGISTRY}/ark-controller"
  --set controllerManager.container.image.tag="${ARK_IMAGE_TAG}"
  --set controllerManager.container.image.pullPolicy=IfNotPresent
  --set rbac.enable=true
  --set rbac.impersonation.enabled=true
)

if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  HELM_ARGS+=(
    --set storage.backend=postgresql
    --set storage.postgresql.host=ark-storage-dev
    --set storage.postgresql.port=5432
    --set storage.postgresql.database=ark
    --set storage.postgresql.user=postgres
    --set storage.postgresql.passwordSecretName=ark-storage-dev-password
  )
fi

helm upgrade --install ark-controller ./dist/chart "${HELM_ARGS[@]}"

helm upgrade --install ark-completions ./executors/completions/chart \
  --namespace ark-system \
  --wait --timeout=300s \
  --set image.repository="${REGISTRY}/ark-completions" \
  --set image.tag="${ARK_IMAGE_TAG}" \
  --set image.pullPolicy=IfNotPresent

# Apply coverage configuration if requested
if [ "${INSTALL_COVERAGE}" = "true" ]; then
  echo "=== Setting up Coverage Collection ==="
  kubectl -n ark-system apply -f "${SCRIPT_DIR}/coverage-pvc.yaml" || echo "Coverage PVC may already exist"
  kubectl -n ark-system patch deployment ark-controller --patch-file "${SCRIPT_DIR}/coverage-patch.yaml"
  # Restart deployment to apply coverage configuration
  kubectl -n ark-system rollout restart deployment/ark-controller
fi

# Wait for ARK deployment to be ready
echo "=== Waiting for ARK Deployment ==="
kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-controller

if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  echo "=== Verifying PostgreSQL Backend ==="
  RETRIES=0
  MAX_RETRIES=30
  until kubectl api-resources --api-group=ark.mckinsey.com -o name 2>/dev/null | grep -q "agents\."; do
    RETRIES=$((RETRIES + 1))
    if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
      echo "ERROR: ark.mckinsey.com API group did not become available after ${MAX_RETRIES} attempts"
      echo "Controller logs:"
      kubectl -n ark-system logs deployment/ark-controller --tail=50
      exit 1
    fi
    echo "Waiting for aggregated API server to register... (attempt ${RETRIES}/${MAX_RETRIES})"
    sleep 10
  done
  echo "ark.mckinsey.com API group registered"

  echo "=== Waiting for APIService availability ==="
  kubectl wait --for=condition=Available apiservice v1alpha1.ark.mckinsey.com --timeout=120s
  kubectl wait --for=condition=Available apiservice v1prealpha1.ark.mckinsey.com --timeout=120s 2>/dev/null || true

  echo "=== Warming up aggregated API server ==="
  WARMUP_OK=0
  for i in $(seq 1 30); do
    if kubectl get agents.ark.mckinsey.com -A --request-timeout=5s &>/dev/null \
      && kubectl get models.ark.mckinsey.com -A --request-timeout=5s &>/dev/null \
      && kubectl get queries.ark.mckinsey.com -A --request-timeout=5s &>/dev/null; then
      WARMUP_OK=$((WARMUP_OK + 1))
    else
      WARMUP_OK=0
    fi
    if [ "$WARMUP_OK" -ge 3 ]; then
      echo "Aggregated API server stable (${WARMUP_OK} consecutive successful probes)"
      break
    fi
    sleep 2
  done
  if [ "$WARMUP_OK" -lt 3 ]; then
    echo "WARNING: Aggregated API server may not be fully stable (only ${WARMUP_OK} consecutive successes)"
    echo "Controller logs:"
    kubectl -n ark-system logs deployment/ark-controller --tail=30
  fi

  if kubectl get crd agents.ark.mckinsey.com &>/dev/null; then
    echo "ERROR: CRD agents.ark.mckinsey.com exists — controller is using etcd, not PostgreSQL aggregated API server"
    exit 1
  fi
  echo "PostgreSQL backend verified (no CRDs present, API served via aggregated API server)"
fi

echo
echo "=== Setup Complete! ==="
echo "ARK is now running in your k3d cluster."
echo "You can verify with:"
echo "  kubectl -n ark-system get pods"
echo "  kubectl -n ark-system logs deployment/ark-controller"