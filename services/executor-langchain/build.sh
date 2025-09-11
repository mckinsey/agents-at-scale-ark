#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔨 Building executor-langchain Docker image..."

# Build from services directory to include ark-sdk
cd ..
../scripts/build-and-push.sh -i executor-langchain -c . -f executor-langchain/Dockerfile

echo ""
echo "Next steps:"
echo "  Deploy with Helm:"
echo "    helm install executor-langchain  ./chart"
echo ""
echo "  Test the deployment:"
echo "    kubectl get pods -l app.kubernetes.io/name=executor-langchain"