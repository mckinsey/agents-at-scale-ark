#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARK_DIR="${REPO_ROOT}/ark"
TESTS_DIR="${REPO_ROOT}/tests"
IMAGE_TAG="${ARK_IMAGE_TAG:-local-e2e}"
KIND_CLUSTER="${KIND_CLUSTER:-ark-installed-test}"
STORAGE_BACKEND="${STORAGE_BACKEND:-postgresql}"
SELECTOR="${SELECTOR:-!evaluated,!llm}"
TEST_DIRS="${TEST_DIRS:-}"
AZURE_MODEL="${AZURE_MODEL:-gpt-4o-mini}"
SKIP_BUILD="${SKIP_BUILD:-}"
SKIP_DEPLOY="${SKIP_DEPLOY:-}"

usage() {
  cat <<EOF
Local E2E test runner — mirrors CI chainsaw tests against kind cluster.

Usage: $0 [options]

Options:
  --backend <etcd|postgresql>   Storage backend (default: postgresql)
  --selector <expr>             Chainsaw selector (default: !evaluated,!llm)
  --tests <dir1,dir2,...>       Run specific test dirs only
  --azure-model <name>          Azure deployment name (default: gpt-4o-mini)
  --skip-build                  Skip image build (reuse existing)
  --skip-deploy                 Skip helm deploy (reuse running cluster)
  --tag <tag>                   Image tag (default: local-e2e)
  -h, --help                    Show this help

Required env vars:
  AZURE_OPENAI_KEY or file at ~/code/ark/AZURE_OPENAI_KEY
  AZURE_OPENAI_BASE_URL (default: https://eggaiopenainonprod.openai.azure.com/)

Examples:
  $0                                          # Full standard postgresql suite
  $0 --backend etcd                           # Full standard etcd suite
  $0 --tests model-token-usage,team-of-teams  # Specific tests only
  $0 --skip-build --skip-deploy               # Re-run tests only (fast)
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --backend) STORAGE_BACKEND="$2"; shift 2 ;;
    --selector) SELECTOR="$2"; shift 2 ;;
    --tests) TEST_DIRS="$2"; shift 2 ;;
    --azure-model) AZURE_MODEL="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-deploy) SKIP_DEPLOY=1; shift ;;
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "${AZURE_OPENAI_KEY:-}" ]]; then
  KEY_FILE="${HOME}/code/ark/AZURE_OPENAI_KEY"
  if [[ -f "$KEY_FILE" ]]; then
    AZURE_OPENAI_KEY=$(cat "$KEY_FILE")
  else
    echo "ERROR: Set AZURE_OPENAI_KEY or create $KEY_FILE"
    exit 1
  fi
fi
AZURE_OPENAI_BASE_URL="${AZURE_OPENAI_BASE_URL:-https://eggaiopenainonprod.openai.azure.com/}"

echo "=== Local E2E Test Runner ==="
echo "Backend:    ${STORAGE_BACKEND}"
echo "Selector:   ${SELECTOR}"
echo "Image tag:  ${IMAGE_TAG}"
echo "Azure model: ${AZURE_MODEL}"
echo

if [[ -x "${HOME}/.local/bin/helm" ]]; then
  export PATH="${HOME}/.local/bin:${PATH}"
fi
helm_version=$(helm version --short 2>/dev/null || true)
if [[ "$helm_version" == v4* ]]; then
  echo "ERROR: Helm v4 detected ($helm_version). PostgreSQL aggregated API server requires Helm v3."
  echo "Install Helm 3: curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | HELM_INSTALL_DIR=~/.local/bin DESIRED_VERSION=v3.17.3 USE_SUDO=false bash"
  exit 1
fi

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: No kubectl context. Start your kind cluster first."
  exit 1
fi

if [[ -z "$SKIP_BUILD" ]]; then
  echo "=== Building images ==="
  cd "$ARK_DIR"
  docker build -t "ark-controller:${IMAGE_TAG}" .
  docker build -t "ark-query-engine:${IMAGE_TAG}" -f Dockerfile.query-engine .
  kind load docker-image "ark-controller:${IMAGE_TAG}" --name "$KIND_CLUSTER"
  kind load docker-image "ark-query-engine:${IMAGE_TAG}" --name "$KIND_CLUSTER"
  echo
fi

if [[ -z "$SKIP_DEPLOY" ]]; then
  echo "=== Deploying ark-controller ==="
  cd "$ARK_DIR"

  HELM_ARGS=(
    --namespace ark-system
    --create-namespace
    --wait --timeout=300s
    --set controllerManager.container.image.repository=ark-controller
    --set controllerManager.container.image.tag="${IMAGE_TAG}"
    --set controllerManager.container.image.pullPolicy=IfNotPresent
    --set controllerManager.securityContext.runAsNonRoot=false
    --set queryEngine.enabled=true
    --set queryEngine.container.image.repository=ark-query-engine
    --set queryEngine.container.image.tag="${IMAGE_TAG}"
    --set queryEngine.container.image.pullPolicy=IfNotPresent
    --set queryEngine.container.port=9090
    --set rbac.enable=true
    --set rbac.impersonation.enabled=true
    --set webhook.enable=true
  )

  if [[ "$STORAGE_BACKEND" == "postgresql" ]]; then
    helm upgrade --install ark-storage-dev "${REPO_ROOT}/charts/ark-storage-dev" \
      --namespace ark-system --create-namespace --wait --timeout=120s
    kubectl -n ark-system wait --for=condition=ready pod -l app=ark-storage-dev --timeout=120s

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
  kubectl -n ark-system wait --for=condition=available --timeout=300s deployment/ark-controller

  if [[ "$STORAGE_BACKEND" == "postgresql" ]]; then
    echo "=== Waiting for aggregated API server ==="
    RETRIES=0
    until kubectl api-resources --api-group=ark.mckinsey.com -o name 2>/dev/null | grep -q "agents\."; do
      RETRIES=$((RETRIES + 1))
      if [[ "$RETRIES" -ge 30 ]]; then
        echo "ERROR: API group did not register"
        kubectl -n ark-system logs deployment/ark-controller --tail=20
        exit 1
      fi
      echo "Waiting... (attempt ${RETRIES}/30)"
      sleep 10
    done
    kubectl wait --for=condition=Available apiservice v1alpha1.ark.mckinsey.com --timeout=120s
    kubectl get agents.ark.mckinsey.com -A --request-timeout=10s &>/dev/null || true
  fi
  echo
fi

echo "=== Cleaning stale test namespaces ==="
kubectl get ns | grep chainsaw | awk '{print $1}' | xargs -r kubectl delete ns --wait=false 2>/dev/null || true
sleep 2

echo "=== Swapping model name: gpt-4.1-mini → ${AZURE_MODEL} ==="
find "${TESTS_DIR}/" -name "*.yaml" -exec sed -i "s/gpt-4\.1-mini/${AZURE_MODEL}/g" {} +

cleanup() {
  echo "=== Reverting model name swap ==="
  cd "$REPO_ROOT"
  git checkout -- tests/
}
trap cleanup EXIT

echo "=== Running chainsaw tests ==="
cd "$TESTS_DIR"
mkdir -p /tmp/chainsaw-report

CHAINSAW_ARGS=(
  --config .chainsaw.yaml
  --selector "${SELECTOR}"
)

if [[ -n "$TEST_DIRS" ]]; then
  IFS=',' read -ra DIRS <<< "$TEST_DIRS"
  CHAINSAW_ARGS=("${DIRS[@]/%/\/}" --config .chainsaw.yaml)
fi

E2E_TEST_AZURE_OPENAI_KEY="$AZURE_OPENAI_KEY" \
E2E_TEST_AZURE_OPENAI_BASE_URL="$AZURE_OPENAI_BASE_URL" \
chainsaw test "${CHAINSAW_ARGS[@]}"
