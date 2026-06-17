#!/usr/bin/env bash
# Usage: bash psql-query.sh "<sql>"
# Runs a SQL query against ark-storage-dev postgres.
# Auto-detects the namespace (ark-system in CI, default in devspace).
set -eu
NS=$(kubectl get deployment --all-namespaces \
  -o jsonpath='{range .items[?(@.metadata.name=="ark-storage-dev")]}{.metadata.namespace}{end}' 2>/dev/null)
NS=${NS:-ark-system}
PGPASSWORD=$(kubectl -n "$NS" get secret ark-storage-dev-password \
  -o jsonpath='{.data.password}' | base64 -d)
kubectl exec -n "$NS" deployment/ark-storage-dev -- sh -c \
  "PGPASSWORD='${PGPASSWORD}' psql -U postgres -d ark -t -c \"$1\""
