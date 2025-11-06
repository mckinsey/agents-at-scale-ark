#!/usr/bin/env bash

set -e -o pipefail

# Colors for output
green='\033[0;32m'
blue='\033[0;34m'
red='\033[0;31m'
nc='\033[0m'

# Require repository parameter
if [ $# -ne 1 ]; then
    echo -e "${red}Usage: $0 <github-repo>${nc}"
    echo "Example: $0 mckinsey/agents-at-scale-ark"
    exit 1
fi

REPO_BRANCH=$1

echo -e "${blue}Binding ARK deployer role to ${REPO_BRANCH}${nc}"

# Check if we're in the project root
if [ ! -f "ark/config/rbac/ark-deployer-role.yaml" ]; then
    echo -e "${red}Error: Must run from project root directory${nc}"
    echo "Could not find: ark/config/rbac/ark-deployer-role.yaml"
    exit 1
fi

# Apply the standard ARK deployer role
echo "Applying ARK deployer ClusterRole..."
kubectl apply -f ark/config/rbac/ark-deployer-role.yaml

# Create ClusterRoleBinding to bind the role to the specified repository
# This connects the OIDC-authenticated GitHub repo identity to deployment permissions
echo "Creating ClusterRoleBinding for ${REPO_BRANCH}..."
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ark-deployer-${REPO_BRANCH//\//-}
  labels:
    app.kubernetes.io/name: ark
    app.kubernetes.io/component: deployer-rbac
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ark-deployer
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: ${REPO_BRANCH}
EOF

echo -e "${green}✔${nc} ARK deployer role bound to ${REPO_BRANCH} successfully"