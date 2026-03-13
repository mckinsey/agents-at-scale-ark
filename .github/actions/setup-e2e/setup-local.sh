#!/usr/bin/env bash
set -euo pipefail

# Local E2E Setup Script
# Mirrors the GitHub Action setup-e2e for local testing
# Usage: ./setup-local.sh [--install-coverage] [--install-evaluator]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"

# Default values
REGISTRY="${DOCKER_CICD_CACHE_REGISTRY:?required}"
REGISTRY_USERNAME="${DOCKER_CICD_CACHE_REGISTRY_USERNAME:?required}"
REGISTRY_PASSWORD="${DOCKER_CICD_CACHE_REGISTRY_PASSWORD:?required}"
ARK_IMAGE_TAG="${ARK_IMAGE_TAG:-local-test}"
INSTALL_COVERAGE="false"
INSTALL_EVALUATOR="false"
STORAGE_BACKEND="etcd"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install-coverage)
      INSTALL_COVERAGE="true"
      shift
      ;;
    --install-evaluator)
      INSTALL_EVALUATOR="true"
      shift
      ;;
    --storage-backend)
      STORAGE_BACKEND="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--install-coverage] [--install-evaluator] [--storage-backend etcd|postgresql]"
      echo "  --install-coverage   Install coverage collection components"
      echo "  --install-evaluator  Install ark-evaluator service"
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
echo "Install Evaluator: ${INSTALL_EVALUATOR}"
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
  --set queryEngine.enabled=true
  --set queryEngine.container.image.repository="${REGISTRY}/ark-query-engine"
  --set queryEngine.container.image.tag="${ARK_IMAGE_TAG}"
  --set queryEngine.container.image.pullPolicy=IfNotPresent
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
  for i in $(seq 1 5); do
    kubectl get agents.ark.mckinsey.com -A --request-timeout=10s &>/dev/null && break
    sleep 2
  done

  if kubectl get crd agents.ark.mckinsey.com &>/dev/null; then
    echo "ERROR: CRD agents.ark.mckinsey.com exists — controller is using etcd, not PostgreSQL aggregated API server"
    exit 1
  fi
  echo "PostgreSQL backend verified (no CRDs present, API served via aggregated API server)"
fi

# Create default model for evaluator if requested
if [ "${INSTALL_EVALUATOR}" = "true" ]; then
  echo "=== Setting up Evaluator ==="
  
  # Require environment variables for evaluator
  if [ -z "${AZURE_OPENAI_KEY:-}" ] || [ -z "${AZURE_OPENAI_BASE_URL:-}" ]; then
    echo "Error: AZURE_OPENAI_KEY and AZURE_OPENAI_BASE_URL environment variables required for evaluator setup"
    exit 1
  fi
  
  # Create secret for default model
  kubectl create secret generic default-model-token \
    --from-literal=token="${AZURE_OPENAI_KEY}" \
    --dry-run=client -o yaml | kubectl apply -f -
  
  # Create default model
  cat <<EOF | kubectl apply -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: default
  namespace: default
spec:
  type: azure
  model:
    value: gpt-4.1-mini
  config:
    azure:
      baseUrl:
        value: "${AZURE_OPENAI_BASE_URL}"
      apiKey:
        valueFrom:
          secretKeyRef:
            name: default-model-token
            key: token
      apiVersion:
        value: "2024-12-01-preview"
EOF

  # Apply RBAC for evaluator access
  cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: evaluator-access-default
rules:
- apiGroups: ["ark.mckinsey.com"]
  resources: ["evaluators", "models"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["services", "secrets"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: evaluator-access-default
  namespace: default
subjects:
- kind: Group
  name: system:serviceaccounts
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: evaluator-access-default
  apiGroup: rbac.authorization.k8s.io
EOF

  # Install ark-evaluator service
  cd "${REPO_ROOT}/services/ark-evaluator/chart"

  helm upgrade --install ark-evaluator . \
    --set image.repository="${REGISTRY}/ark-evaluator" \
    --set image.tag="${ARK_IMAGE_TAG}" \
    --namespace default --create-namespace \
    --wait \
    --timeout=300s
  kubectl -n default rollout status deployment/ark-evaluator --timeout=180s
fi

echo
echo "=== Setup Complete! ==="
echo "ARK is now running in your k3d cluster."
echo "You can verify with:"
echo "  kubectl -n ark-system get pods"
echo "  kubectl -n ark-system logs deployment/ark-controller"