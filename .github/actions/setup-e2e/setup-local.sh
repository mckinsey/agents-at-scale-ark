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
INSTALL_BROKER="false"
STORAGE_BACKEND="etcd"
PREFETCH_TEST_IMAGES="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install-coverage)
      INSTALL_COVERAGE="true"
      shift
      ;;
    --install-broker)
      INSTALL_BROKER="true"
      shift
      ;;
    --storage-backend)
      STORAGE_BACKEND="$2"
      shift 2
      ;;
    --prefetch-test-images)
      PREFETCH_TEST_IMAGES="true"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--install-coverage] [--install-broker] [--storage-backend etcd|postgresql] [--prefetch-test-images]"
      echo "  --install-coverage      Install coverage collection components"
      echo "  --install-broker        Install ark-broker (only needed for tests that use it)"
      echo "  --storage-backend       Storage backend to use (default: etcd)"
      echo "  --prefetch-test-images  Pre-pull chainsaw test images (mock-llm, curl, mockserver, etc.)"
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

if [ "${INSTALL_BROKER}" = "true" ]; then
  echo "=== Pre-creating ark-config-broker ConfigMap ==="
  kubectl create namespace default 2>/dev/null || true
  kubectl apply -f - <<'BROKER_CM_EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: ark-config-broker
  namespace: default
  labels:
    app.kubernetes.io/managed-by: Helm
  annotations:
    meta.helm.sh/release-name: ark-broker
    meta.helm.sh/release-namespace: default
data:
  enabled: "true"
  serviceRef: |
    name: ark-broker
    port: "http"
BROKER_CM_EOF
fi

if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  echo "=== Installing PostgreSQL (ark-storage-dev) ==="
  helm upgrade --install ark-storage-dev "${REPO_ROOT}/charts/ark-storage-dev" \
    --namespace ark-system \
    --create-namespace \
    --wait --timeout=120s

  echo "=== Waiting for PostgreSQL Pod Readiness ==="
  kubectl -n ark-system wait --for=condition=ready pod -l app=ark-storage-dev --timeout=120s
fi

IMAGE_PULL_PIDS=()
if [ "${PREFETCH_TEST_IMAGES}" = "true" ]; then
  echo "=== Pre-pulling test images (background) ==="
  for img in \
    docker.io/curlimages/curl:latest \
    docker.io/mockserver/mockserver:5.15.0 \
    ghcr.io/orange-opensource/hurl:6.1.1 \
    docker.io/python:3.12-bookworm \
    ghcr.io/dwmkerr/mock-llm:0.1.28 \
    ghcr.io/dwmkerr/mock-llm:latest; do
    sudo k3s ctr images pull "$img" &
    IMAGE_PULL_PIDS+=($!)
  done
  if [ -n "${ARK_IMAGE_TAG}" ]; then
    sudo k3s ctr images pull --user "${REGISTRY_USERNAME}:${REGISTRY_PASSWORD}" "${REGISTRY}/ark-mcp:${ARK_IMAGE_TAG}" &
    IMAGE_PULL_PIDS+=($!)
  fi
  echo "Image pulls started (PIDs: ${IMAGE_PULL_PIDS[*]})"
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

if [ "${INSTALL_COVERAGE}" = "true" ]; then
  echo "=== Including coverage collection in Helm install ==="
  kubectl create namespace ark-system 2>/dev/null || true
  kubectl -n ark-system apply -f "${SCRIPT_DIR}/coverage-pvc.yaml" || echo "Coverage PVC may already exist"
  HELM_ARGS+=(
    --set controllerManager.container.env.GOCOVERDIR=/workspace/coverage
    --set 'controllerManager.extraVolumeMounts[0].name=coverage-volume'
    --set 'controllerManager.extraVolumeMounts[0].mountPath=/workspace/coverage'
    --set 'controllerManager.extraVolumes[0].name=coverage-volume'
    --set 'controllerManager.extraVolumes[0].persistentVolumeClaim.claimName=coverage-data'
  )
fi

if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  echo "=== Installing Ark API Server (PostgreSQL aggregated API) ==="
  helm upgrade --install ark-apiserver ./dist/chart-apiserver \
    --namespace ark-system \
    --create-namespace \
    --wait --timeout=300s \
    --set image.repository="${REGISTRY}/ark-controller" \
    --set image.tag="${ARK_IMAGE_TAG}" \
    --set image.pullPolicy=IfNotPresent \
    --set postgresql.host=ark-storage-dev \
    --set postgresql.user=postgres \
    --set postgresql.passwordSecretName=ark-storage-dev-password
fi

helm upgrade --install ark-controller ./dist/chart "${HELM_ARGS[@]}"

helm upgrade --install ark-completions ./executors/completions/chart \
  --namespace ark-system \
  --wait --timeout=300s \
  --set image.repository="${REGISTRY}/ark-completions" \
  --set image.tag="${ARK_IMAGE_TAG}" \
  --set image.pullPolicy=IfNotPresent

echo "=== Waiting for Ark Deployments ==="
kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-controller
if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-apiserver
  kubectl wait --for=condition=Available apiservice v1alpha1.ark.mckinsey.com --timeout=120s
  kubectl wait --for=condition=Available apiservice v1prealpha1.ark.mckinsey.com --timeout=120s 2>/dev/null || true
fi

if [ "${INSTALL_BROKER}" = "true" ]; then
  echo "=== Installing ARK Broker ==="
  helm upgrade --install ark-broker "${REPO_ROOT}/services/ark-broker/chart" \
    --namespace default \
    --create-namespace \
    --set app.image.repository="${REGISTRY}/ark-broker" \
    --set app.image.tag="${ARK_IMAGE_TAG}" \
    --set app.image.pullPolicy=IfNotPresent \
    --set restartController.enabled=false \
    --wait --timeout=300s
fi

if [ "${#IMAGE_PULL_PIDS[@]}" -gt 0 ]; then
  echo "=== Waiting for image pre-pulls to complete ==="
  for pid in "${IMAGE_PULL_PIDS[@]}"; do
    wait "$pid" || echo "Warning: image pull PID $pid failed"
  done
  echo "Image pre-pulls done"
fi

echo
echo "=== Setup Complete! ==="
echo "ARK is now running in your k3d cluster."
echo "You can verify with:"
echo "  kubectl -n ark-system get pods"
echo "  kubectl -n ark-system logs deployment/ark-controller"