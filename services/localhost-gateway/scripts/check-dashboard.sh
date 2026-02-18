#!/usr/bin/env bash
# Quick check that ark-dashboard backend exists and is ready for the gateway.
set -e
NAMESPACE="${NAMESPACE:-default}"

echo "=== Service ==="
kubectl get svc ark-dashboard -n "$NAMESPACE" 2>/dev/null || echo "Service ark-dashboard not found - run deploy for ark-dashboard first."

echo ""
echo "=== Pods (app=ark-dashboard) ==="
kubectl get pods -n "$NAMESPACE" -l app=ark-dashboard 2>/dev/null || true

echo ""
echo "=== Recent pod logs (last 30 lines) ==="
pod=$(kubectl get pods -n "$NAMESPACE" -l app=ark-dashboard -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [[ -n "$pod" ]]; then
  kubectl logs -n "$NAMESPACE" "$pod" --tail=30 2>/dev/null || true
else
  echo "No ark-dashboard pod found."
fi
