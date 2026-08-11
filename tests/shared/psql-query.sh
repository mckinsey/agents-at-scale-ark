#!/usr/bin/env bash
# Usage: bash psql-query.sh "<sql>"
# Runs a SQL query against the broker's ark-storage-dev postgres.
# Targets the postgres co-located with the ark-broker deployment (its
# DATABASE_URL uses the bare service name, so the DB is in the broker's
# namespace) - ark-system in CI, default in devspace.
set -eu
NS=""
for candidate in ark-system default; do
  if kubectl -n "$candidate" get deployment ark-broker >/dev/null 2>&1; then
    NS="$candidate"
    break
  fi
done
if [ -z "$NS" ]; then
  for candidate in ark-system default; do
    if kubectl -n "$candidate" get deployment ark-storage-dev >/dev/null 2>&1; then
      NS="$candidate"
      break
    fi
  done
fi
NS=${NS:-ark-system}
PGPASSWORD=$(kubectl -n "$NS" get secret ark-storage-dev-password \
  -o jsonpath='{.data.password}' | base64 -d)
kubectl exec -n "$NS" deployment/ark-storage-dev -- sh -c \
  "PGPASSWORD='${PGPASSWORD}' psql -U postgres -d ark -t -c \"$1\""
