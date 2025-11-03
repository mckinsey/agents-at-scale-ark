#!/bin/bash

# Build and push FileSys MCP Server Docker image to local Kubernetes cluster

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IMAGE_NAME="filesystem-mcp-server"
IMAGE_TAG="${1:-latest}"
TARGET_CLUSTER="${2:-auto}"

echo "Building and pushing FileSys MCP Server Docker image..."
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Target cluster: ${TARGET_CLUSTER}"

# Use the centralized build-and-push script
"${PROJECT_ROOT}/scripts/build-and-push.sh" \
    --image "${IMAGE_NAME}" \
    --dockerfile "${SCRIPT_DIR}/Dockerfile" \
    --context "${SCRIPT_DIR}" \
    --tag "${IMAGE_TAG}" \
    --cluster "${TARGET_CLUSTER}"

echo ""
echo "Next steps:"
echo "  Deploy with Helm:"
echo "    helm install filesystem-mcp ./chart"
echo ""
echo "  Test the deployment:"
echo "    kubectl get pods -l app.kubernetes.io/name=mcp-filesystem"