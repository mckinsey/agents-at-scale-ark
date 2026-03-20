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

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install-coverage)
      INSTALL_COVERAGE="true"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--install-coverage]"
      echo "  --install-coverage   Install coverage collection components"
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

echo "=== Installing ARK Controller ==="
cd "${REPO_ROOT}/ark"

# Deploy controller with impersonation enabled for E2E tests
helm upgrade --install ark-controller ./dist/chart \
  --namespace ark-system \
  --create-namespace \
  --wait --timeout=300s \
  --set controllerManager.container.image.repository="${REGISTRY}/ark-controller" \
  --set controllerManager.container.image.tag="${ARK_IMAGE_TAG}" \
  --set controllerManager.container.image.pullPolicy=IfNotPresent \
  --set rbac.enable=true \
  --set rbac.impersonation.enabled=true

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

echo
echo "=== Setup Complete! ==="
echo "ARK is now running in your k3d cluster."
echo "You can verify with:"
echo "  kubectl -n ark-system get pods"
echo "  kubectl -n ark-system logs deployment/ark-controller"