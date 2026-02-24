#!/bin/bash
set -e

echo "=== Waiting for ark-evaluator to be ready ==="

# Wait for deployment to be available
echo "Checking deployment availability..."
kubectl wait --for=condition=Available \
  --timeout=3m \
  deployment/ark-evaluator \
  -n default

# Check that service has endpoints
echo "Checking service endpoints..."
ADDRESSES="[]"
for i in {1..30}; do
  SUBSETS=$(kubectl get endpoints ark-evaluator -n default -o jsonpath='{.subsets}' 2>/dev/null || echo "[]")
  if [ "$SUBSETS" != "[]" ] && [ "$SUBSETS" != "" ] && [ "$SUBSETS" != "null" ]; then
    ADDRESSES=$(kubectl get endpoints ark-evaluator -n default -o jsonpath='{.subsets[0].addresses}' 2>/dev/null || echo "[]")
    if [ "$ADDRESSES" != "[]" ] && [ "$ADDRESSES" != "" ] && [ "$ADDRESSES" != "null" ]; then
      echo "✓ ark-evaluator deployment is ready with endpoints"
      break
    fi
  fi
  echo "Waiting for service endpoints (attempt $i/30)..."
  sleep 2
done

if [ "$ADDRESSES" == "[]" ] || [ "$ADDRESSES" == "" ] || [ "$ADDRESSES" == "null" ]; then
  echo "✗ Service endpoints not ready after 60 seconds"
  exit 1
fi

# Verify service health endpoint responds
echo "Checking service health endpoint..."
for i in {1..30}; do
  POD_NAME="healthcheck-$(date +%s)-$RANDOM"
  if kubectl run -i --rm --restart=Never "$POD_NAME" --image=curlimages/curl:latest --timeout=10s -- \
    curl -f -s http://ark-evaluator.default.svc.cluster.local:8000/health >/dev/null 2>&1; then
    echo "✓ ark-evaluator service health check passed"
    exit 0
  fi
  echo "Waiting for service health check (attempt $i/30)..."
  sleep 2
done

echo "✗ Service health check failed after 60 seconds"
exit 1
