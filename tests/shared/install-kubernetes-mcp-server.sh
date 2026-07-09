#!/usr/bin/env bash
set -e

helm install kubernetes-mcp-server oci://ghcr.io/containers/charts/kubernetes-mcp-server \
  --version 0.1.0 \
  --namespace "$NAMESPACE" \
  --set config.read_only=true \
  --set ingress.enabled=false \
  --set rbac.create=true \
  --set "rbac.extraRoles[0].name=ark-reader" \
  --set "rbac.extraRoles[0].namespace=$NAMESPACE" \
  --set "rbac.extraRoles[0].rules[0].apiGroups[0]=ark.mckinsey.com" \
  --set "rbac.extraRoles[0].rules[0].resources={agents,teams,queries,models,mcpservers,a2aservers,a2atasks,tools,memories,executionengines,arkconfigs}" \
  --set "rbac.extraRoles[0].rules[0].verbs={get,list,watch}" \
  --set "rbac.extraRoleBindings[0].name=ark-reader" \
  --set "rbac.extraRoleBindings[0].namespace=$NAMESPACE" \
  --set "rbac.extraRoleBindings[0].roleRef.name=ark-reader" \
  --wait --timeout=180s

cat <<EOF | kubectl apply -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: MCPServer
metadata:
  name: kubernetes-mcp-server
  namespace: $NAMESPACE
spec:
  address:
    value: http://kubernetes-mcp-server.$NAMESPACE.svc.cluster.local:8080/mcp
  description: k8s mcp server
  transport: http
  pollInterval: 10s
  timeout: 30s
EOF
