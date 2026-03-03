#!/bin/bash
set -e

# Wait for RBAC ClusterRoleBinding to exist and propagate
# Usage: wait-for-rbac.sh <clusterrolebinding-name>

BINDING_NAME="${1:-}"
if [ -z "$BINDING_NAME" ]; then
  echo "Error: ClusterRoleBinding name required"
  echo "Usage: wait-for-rbac.sh <clusterrolebinding-name>"
  exit 1
fi

echo "Waiting for ClusterRoleBinding: $BINDING_NAME"

# Wait for ClusterRoleBinding to be created
MAX_ATTEMPTS=15
for i in $(seq 1 $MAX_ATTEMPTS); do
  if kubectl get clusterrolebinding "$BINDING_NAME" >/dev/null 2>&1; then
    echo "✓ ClusterRoleBinding '$BINDING_NAME' exists"
    break
  fi

  if [ $i -eq $MAX_ATTEMPTS ]; then
    echo "✗ Timeout waiting for ClusterRoleBinding '$BINDING_NAME'"
    exit 1
  fi

  echo "Attempt $i/$MAX_ATTEMPTS: Waiting for ClusterRoleBinding..."
  sleep 1
done

# Additional wait for RBAC propagation to API server
# RBAC changes can take time to propagate through the API server cache
echo "Waiting for RBAC to propagate to API server..."
sleep 5

echo "✓ RBAC configuration ready"
