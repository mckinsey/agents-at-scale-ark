#!/usr/bin/env bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default values
LOCALHOST_GATEWAY_SERVICE_NAME="${LOCALHOST_GATEWAY_SERVICE_NAME:-localhost-gateway}"
LOCALHOST_GATEWAY_SERVICE_DIR="${LOCALHOST_GATEWAY_SERVICE_DIR:-$SCRIPT_DIR}"
LOCALHOST_GATEWAY_NAMESPACE="${LOCALHOST_GATEWAY_NAMESPACE:-ark-system}"
LOCALHOST_GATEWAY_PORT="${LOCALHOST_GATEWAY_PORT:-8080}"

# Get OUT directory from environment or use default
OUT="${OUT:-out}"
LOG_FILE="${OUT}/install-gateway.log"

# Create output directory if it doesn't exist
mkdir -p "${OUT}"

# Set up logging to both screen and file
exec > >(tee -a "${LOG_FILE}")
exec 2>&1

echo "=== Starting localhost-gateway installation at $(date) ==="

source "${SCRIPT_DIR}/../../.github/helm-versions.env"

echo "Installing Gateway API CRDs..."
kubectl apply -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"

echo "Installing nginx-gateway-fabric CRDs..."
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.0.2/deploy/crds.yaml

echo "Updating helm dependencies..."
(cd "${LOCALHOST_GATEWAY_SERVICE_DIR}/chart" && helm dependency update)

echo "Installing localhost-gateway..."
kubectl create namespace "${LOCALHOST_GATEWAY_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install "${LOCALHOST_GATEWAY_SERVICE_NAME}" "${LOCALHOST_GATEWAY_SERVICE_DIR}/chart" \
    --namespace "${LOCALHOST_GATEWAY_NAMESPACE}" \
    --create-namespace \
    --wait \
    --timeout=10m

echo "localhost-gateway installed successfully"
echo "Waiting for gateway to be ready..."
timeout=60
while [ $timeout -gt 0 ]; do
    if kubectl get gateway localhost-gateway -n "${LOCALHOST_GATEWAY_NAMESPACE}" -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null | grep -q "True"; then
        echo "Gateway is ready"
        break
    fi
    echo "Gateway not ready yet, waiting..."
    sleep 2
    timeout=$((timeout-2))
done

if [ $timeout -le 0 ]; then
    echo "Timeout waiting for gateway to be ready"
    exit 1
fi

echo "Starting port-forwarding on localhost:${LOCALHOST_GATEWAY_PORT}..."
pkill -f "kubectl.*port-forward.*${LOCALHOST_GATEWAY_PORT}:80" || true
sleep 2

if [ "${LOCALHOST_GATEWAY_PORT}" -lt 1024 ]; then
    echo "Note: Port ${LOCALHOST_GATEWAY_PORT} requires sudo privileges"
    sudo -v
    sudo kubectl port-forward -n "${LOCALHOST_GATEWAY_NAMESPACE}" service/localhost-gateway-nginx "${LOCALHOST_GATEWAY_PORT}:80" >/dev/null 2>&1 &
else
    kubectl port-forward -n "${LOCALHOST_GATEWAY_NAMESPACE}" service/localhost-gateway-nginx "${LOCALHOST_GATEWAY_PORT}:80" > /dev/null 2>&1 &
fi

echo "localhost-gateway installation complete"