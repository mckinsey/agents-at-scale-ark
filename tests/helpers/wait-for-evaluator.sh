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
for i in {1..30}; do
  SUBSETS=$(kubectl get endpoints ark-evaluator -n default -o jsonpath='{.subsets}' 2>/dev/null || echo "[]")
  if [ "$SUBSETS" != "[]" ] && [ "$SUBSETS" != "" ] && [ "$SUBSETS" != "null" ]; then
    ADDRESSES=$(kubectl get endpoints ark-evaluator -n default -o jsonpath='{.subsets[0].addresses}' 2>/dev/null || echo "[]")
    if [ "$ADDRESSES" != "[]" ] && [ "$ADDRESSES" != "" ] && [ "$ADDRESSES" != "null" ]; then
      echo "✓ ark-evaluator deployment is ready with endpoints"
      exit 0
    fi
  fi
  echo "Waiting for service endpoints (attempt $i/30)..."
  sleep 2
done

echo "✗ Service endpoints not ready after 60 seconds"
exit 1
