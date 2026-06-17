#!/usr/bin/env bash
# Usage: bash psql-query.sh "<sql>"
# Runs a SQL query against ark-storage-dev postgres in ark-system namespace.
# Reads the password from the ark-storage-dev-password secret.
set -eu
PGPASSWORD=$(kubectl -n ark-system get secret ark-storage-dev-password \
  -o jsonpath='{.data.password}' | base64 -d)
kubectl exec -n ark-system deployment/ark-storage-dev -- sh -c \
  "PGPASSWORD='${PGPASSWORD}' psql -U postgres -d ark -t -c \"$1\""
