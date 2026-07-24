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

IMAGE_PULL_PIDS=()
echo "=== Pre-pulling ARK images (background) ==="
for img in \
  "${REGISTRY}/ark-controller:${ARK_IMAGE_TAG}" \
  "${REGISTRY}/ark-completions:${ARK_IMAGE_TAG}" \
  "${REGISTRY}/ark-mcp:${ARK_IMAGE_TAG}"; do
  sudo k3s crictl pull "$img" > /dev/null 2>&1 &
  IMAGE_PULL_PIDS+=($!)
done
if [ "${INSTALL_BROKER}" = "true" ]; then
  sudo k3s crictl pull "${REGISTRY}/ark-broker:${ARK_IMAGE_TAG}" > /dev/null 2>&1 &
  IMAGE_PULL_PIDS+=($!)
fi
if [ "${PREFETCH_TEST_IMAGES}" = "true" ]; then
  echo "=== Pre-pulling test images (background) ==="
  for img in \
    docker.io/curlimages/curl:latest \
    docker.io/mockserver/mockserver:5.15.0 \
    ghcr.io/orange-opensource/hurl:6.1.1 \
    docker.io/python:3.12-bookworm \
    ghcr.io/dwmkerr/mock-llm:0.1.28; do
    sudo k3s crictl pull "$img" > /dev/null 2>&1 &
    IMAGE_PULL_PIDS+=($!)
  done
fi
if [ "${#IMAGE_PULL_PIDS[@]}" -gt 0 ]; then
  echo "Image pulls started (PIDs: ${IMAGE_PULL_PIDS[*]})"
fi

# Install cert-manager if not present
echo "=== Installing cert-manager ==="
if ! helm list -n cert-manager | grep -q cert-manager; then
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --set crds.enabled=true \
    --set startupapicheck.enabled=false
else
  echo "cert-manager already installed"
fi

# Wait for webhook and cainjector to be fully rolled out before proceeding.
# The webhook must be running before any cert-manager resources (Issuer, Certificate)
# can be created, otherwise Helm will get x509 errors calling the webhook TLS endpoint.
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=120s
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=120s

# Wait for cainjector to populate the webhook's CABundle field. Only needed on first
# install — once the selfsigned-issuer exists it persists across re-deploys.
if ! kubectl get issuer selfsigned-issuer -n ark-system > /dev/null 2>&1; then
  echo "Waiting for cert-manager webhook CABundle..."
  until kubectl get mutatingwebhookconfiguration cert-manager-webhook -o jsonpath='{.webhooks[0].clientConfig.caBundle}' 2>/dev/null | grep -q .; do sleep 2; done
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
    --set ssl.enabled=true \
    --wait --timeout=120s

  echo "=== Waiting for PostgreSQL Pod Readiness ==="
  kubectl -n ark-system wait --for=condition=ready pod -l app=ark-storage-dev --timeout=120s

  echo "=== Copying ark-storage-dev TLS secret to default namespace ==="
  kubectl -n ark-system get secret ark-storage-dev-tls -o json | \
    python3 -c "
import sys, json
s = json.load(sys.stdin)
out = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': s['metadata']['name'], 'namespace': 'default'}, 'type': s['type'], 'data': s['data']}
print(json.dumps(out))
" | kubectl apply -f -
fi

BROKER_PID=""

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
    --set postgresql.passwordSecretName=ark-storage-dev-password \
    --set postgresql.sslMode=verify-full \
    --set postgresql.sslSecretName=ark-storage-dev-tls \
    --set postgresql.sslRootCertKey=ca.crt
fi

echo "=== Installing ARK Completions (background) ==="
helm upgrade --install ark-completions ./executors/completions/chart \
  --namespace ark-system \
  --create-namespace \
  --wait --timeout=300s \
  --set image.repository="${REGISTRY}/ark-completions" \
  --set image.tag="${ARK_IMAGE_TAG}" \
  --set image.pullPolicy=IfNotPresent &
ARK_COMPLETIONS_PID=$!

helm upgrade --install ark-controller ./dist/chart "${HELM_ARGS[@]}"

if [ "${INSTALL_BROKER}" = "true" ]; then
  echo "=== Installing ARK Broker (background) ==="
  BROKER_HELM_ARGS=(
    --namespace default
    --create-namespace
    --set app.image.repository="${REGISTRY}/ark-broker"
    --set app.image.tag="${ARK_IMAGE_TAG}"
    --set app.image.pullPolicy=IfNotPresent
    --set restartController.enabled=false
    --wait --timeout=300s
  )
  if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
    POSTGRES_PASSWORD=$(kubectl -n ark-system get secret ark-storage-dev-password \
      -o jsonpath='{.data.password}' | base64 -d)
    BROKER_HELM_ARGS+=(
      --set memory.createMemoryCRD=false
      --set backends.message=postgres
      --set backends.event=postgres
      --set "database.url=postgres://postgres:${POSTGRES_PASSWORD}@ark-storage-dev.ark-system.svc.cluster.local:5432/ark?sslmode=verify-full"
      --set "database.migrateUrl=postgres://postgres:${POSTGRES_PASSWORD}@ark-storage-dev.ark-system.svc.cluster.local:5432/ark?sslmode=verify-full&sslrootcert=/etc/pg-ssl/ca.crt"
      --set database.tls.enabled=true
      --set database.tls.secretName=ark-storage-dev-tls
      --set database.tls.mountPath=/etc/pg-ssl
      --set migrate.image.repository="${REGISTRY}/ark-broker-migrate"
      --set migrate.image.tag="${ARK_IMAGE_TAG}"
    )
  fi
  helm upgrade --install ark-broker "${REPO_ROOT}/services/ark-broker/chart" \
    "${BROKER_HELM_ARGS[@]}" &
  BROKER_PID=$!
fi

# Verify cert-manager issued the webhook certificate end-to-end. rollout status +
# CABundle checks above confirm pods are running and the webhook config is patched,
# but don't catch issuance failures (e.g. broken RBAC, controller errors). This
# ensures the webhook is serving valid TLS before any further Helm calls.
kubectl wait --for=condition=Ready certificate/serving-cert -n ark-system --timeout=60s

echo "=== Waiting for ARK Completions ==="
wait "${ARK_COMPLETIONS_PID}"

echo "=== Waiting for Ark Deployments ==="
kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-controller
if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
  kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-apiserver
  kubectl wait --for=condition=Available apiservice v1alpha1.ark.mckinsey.com --timeout=120s
  kubectl wait --for=condition=Available apiservice v1prealpha1.ark.mckinsey.com --timeout=120s 2>/dev/null || true
fi

if [ -n "${BROKER_PID}" ]; then
  echo "=== Waiting for ARK Broker ==="
  wait "${BROKER_PID}"
  if [ "${STORAGE_BACKEND}" = "postgresql" ]; then
    kubectl rollout status deployment/ark-broker -n default --timeout=120s
  fi
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