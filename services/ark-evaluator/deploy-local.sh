#!/bin/bash
set -e

echo "=== Deploying ARK Evaluator with Local Docker Image ==="

# Check if we're in the correct directory
if [ ! -f "chart/Chart.yaml" ]; then
    echo "Error: Please run this script from the services/ark-evaluator directory"
    exit 1
fi

# Option 1: Use minikube's Docker daemon (recommended for minikube)
echo "Checking minikube status..."
if command -v minikube &> /dev/null && minikube status &> /dev/null; then
    echo "Minikube is running. Loading local image into minikube..."

    # Load the local image into minikube
    minikube image load ark-evaluator:latest

    echo "Image loaded into minikube. Verifying..."
    minikube image ls | grep ark-evaluator || true

    # Deploy using Helm with local repository and imagePullPolicy=Never
    echo "Deploying with Helm..."
    helm upgrade --install ark-evaluator ./chart \
        -n default \
        --create-namespace \
        --set image.repository=ark-evaluator \
        --set image.tag=latest \
        --set image.pullPolicy=Never

    echo "✅ Deployment complete with local image!"

elif kubectl config current-context | grep -q "docker-desktop"; then
    # Option 2: For Docker Desktop Kubernetes
    echo "Docker Desktop Kubernetes detected..."

    helm upgrade --install ark-evaluator ./chart \
        -n default \
        --create-namespace \
        --set image.repository=ark-evaluator \
        --set image.tag=latest \
        --set image.pullPolicy=Never

    echo "✅ Deployment complete with local image!"

else
    # Option 3: For other Kubernetes clusters (kind, k3d, etc.)
    echo "Generic Kubernetes cluster detected..."
    echo "Make sure your local image is accessible to your cluster."

    helm upgrade --install ark-evaluator ./chart \
        -n default \
        --create-namespace \
        --set image.repository=ark-evaluator \
        --set image.tag=latest \
        --set image.pullPolicy=IfNotPresent

    echo "⚠️  Note: If the pod fails to pull the image, you may need to:"
    echo "   1. Push the image to a local registry accessible by your cluster"
    echo "   2. Or load the image into your cluster's nodes"
fi

echo ""
echo "Checking deployment status..."
kubectl get pods -n default -l app.kubernetes.io/name=ark-evaluator

echo ""
echo "To watch the pod status:"
echo "  kubectl get pods -n default -l app.kubernetes.io/name=ark-evaluator -w"

echo ""
echo "To check logs:"
echo "  kubectl logs -n default -l app.kubernetes.io/name=ark-evaluator -f"