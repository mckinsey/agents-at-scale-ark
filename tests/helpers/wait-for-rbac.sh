#!/bin/bash
set -e

# Wait for RBAC permissions to propagate after RoleBinding/ClusterRoleBinding creation
# Note: The RoleBinding/ClusterRoleBinding must already exist (use an assert step before calling this)
# Usage: wait-for-rbac.sh <binding-name> [namespace]
#   If namespace is provided, checks RoleBinding in that namespace
#   If namespace is omitted, checks ClusterRoleBinding

BINDING_NAME="${1:-}"
TARGET_NAMESPACE="${2:-}"

if [ -z "$BINDING_NAME" ]; then
  echo "Error: Binding name required"
  echo "Usage: wait-for-rbac.sh <binding-name> [namespace]"
  exit 1
fi

if [ -n "$TARGET_NAMESPACE" ]; then
  echo "Waiting for RBAC permissions to propagate for RoleBinding: $BINDING_NAME in namespace $TARGET_NAMESPACE"
  BINDING_TYPE="rolebinding"
  NAMESPACE_FLAG="-n $TARGET_NAMESPACE"
else
  echo "Waiting for RBAC permissions to propagate for ClusterRoleBinding: $BINDING_NAME"
  BINDING_TYPE="clusterrolebinding"
  NAMESPACE_FLAG=""
fi

# Extract service account and namespace from binding
SA_INFO=$(kubectl get $BINDING_TYPE "$BINDING_NAME" $NAMESPACE_FLAG -o jsonpath='{.subjects[0].name},{.subjects[0].namespace}' 2>/dev/null)
if [ -z "$SA_INFO" ]; then
  echo "✗ Error: ${BINDING_TYPE} '$BINDING_NAME' not found"
  echo "Make sure to assert the binding exists before calling this script"
  exit 1
fi

SERVICE_ACCOUNT=$(echo "$SA_INFO" | cut -d',' -f1)
SA_NAMESPACE=$(echo "$SA_INFO" | cut -d',' -f2)

# For RoleBinding, check permissions in the role's namespace
# For ClusterRoleBinding, check permissions in the service account's namespace
CHECK_NAMESPACE="${TARGET_NAMESPACE:-$SA_NAMESPACE}"

echo "Verifying permissions for ServiceAccount '$SERVICE_ACCOUNT' (namespace: $SA_NAMESPACE) to access resources in namespace '$CHECK_NAMESPACE'"

# Poll until the service account has the required permissions
MAX_PERMISSION_ATTEMPTS=30
SLEEP_INTERVAL=2

for i in $(seq 1 $MAX_PERMISSION_ATTEMPTS); do
  echo "Attempt $i/$MAX_PERMISSION_ATTEMPTS: Checking if permissions are active..."

  # Test if the service account can get queries
  if kubectl auth can-i get queries.ark.mckinsey.com \
    --as="system:serviceaccount:${SA_NAMESPACE}:${SERVICE_ACCOUNT}" \
    -n "$CHECK_NAMESPACE" >/dev/null 2>&1; then
    echo "✓ ServiceAccount has required permissions"
    echo "✓ RBAC configuration ready"
    exit 0
  fi

  if [ $i -lt $MAX_PERMISSION_ATTEMPTS ]; then
    sleep $SLEEP_INTERVAL
  fi
done

echo "✗ Timeout: RBAC permissions not propagated after $((MAX_PERMISSION_ATTEMPTS * SLEEP_INTERVAL)) seconds"
echo "This may indicate an RBAC configuration issue"
exit 1
