#!/bin/bash

# {{ .Values.mcpServerName }} MCP Server Build Script

set -e

IMAGE_TAG=${1:-latest}
TARGET_CLUSTER=${2:-auto}
IMAGE_NAME="{{ .Values.mcpServerName }}"

echo "Building {{ .Values.mcpServerName }} MCP Server..."
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Target cluster: ${TARGET_CLUSTER}"

# Build the Docker image
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

# Tag and push based on target cluster
case $TARGET_CLUSTER in
    "auto")
        echo "Auto-detecting cluster configuration..."
        # Try to detect if we're in a local development environment
        if kubectl config current-context | grep -E "(microk8s)" > /dev/null 2>&1; then
            echo "MicroK8s cluster detected, loading image locally..."
            docker save ${IMAGE_NAME}:${IMAGE_TAG} | microk8s ctr images import -
        else
            echo "Remote cluster detected, pushing to registry..."
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
        fi
        ;;
    "local"|"microk8s")
        echo "Loading image into MicroK8s..."
        docker save ${IMAGE_NAME}:${IMAGE_TAG} | microk8s ctr images import -
        ;;
    "remote"|"registry")
        echo "Pushing image to registry..."
        docker push ${IMAGE_NAME}:${IMAGE_TAG}
        ;;
    *)
        echo "Unknown target cluster: $TARGET_CLUSTER"
        echo "Valid options: auto, local, microk8s, remote, registry"
        exit 1
        ;;
esac

echo "{{ .Values.mcpServerName }} MCP Server build completed successfully!"
echo ""
echo "Next steps:"
echo "1. Install the Helm chart:"
{{- if .Values.requiresAuth }}
echo "   make install AUTH_TOKEN=your-auth-token"
{{- else }}
echo "   make install"
{{- end }}
echo "2. Check the status:"
echo "   make status"
echo "3. View logs:"
echo "   make logs"