#!/usr/bin/env bash
# Usage: bash psql-query.sh "<sql>"
# Runs a SQL query against the broker's ark-storage-dev postgres.
# The broker's postgres is not always co-located with the broker (CI uses an
# FQDN into ark-system; devspace uses a bare name in the broker's namespace),
# so pick the ark-storage-dev whose DB actually holds the broker schema.
set -eu
NS=""
for candidate in ark-system default; do
  kubectl -n "$candidate" get deployment ark-storage-dev >/dev/null 2>&1 || continue
  [ -z "$NS" ] && NS="$candidate"
  PW=$(kubectl -n "$candidate" get secret ark-storage-dev-password \
    -o jsonpath='{.data.password}' 2>/dev/null | base64 -d)
  [ -n "$PW" ] || continue
  HAS=$(kubectl exec -n "$candidate" deployment/ark-storage-dev -- \
    env "PGPASSWORD=$PW" sh -c \
    "psql -U postgres -d ark -t -A -c \"SELECT to_regclass('public.messages') IS NOT NULL;\"" \
    2>/dev/null | tr -d ' \n')
  [ "$HAS" = "t" ] && { NS="$candidate"; break; }
done
NS=${NS:-ark-system}
PGPASSWORD=$(kubectl -n "$NS" get secret ark-storage-dev-password \
  -o jsonpath='{.data.password}' | base64 -d)
kubectl exec -n "$NS" deployment/ark-storage-dev -- sh -c \
  "PGPASSWORD='${PGPASSWORD}' psql -U postgres -d ark -t -c \"$1\""
