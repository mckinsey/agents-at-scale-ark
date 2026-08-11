#!/usr/bin/env bash
# Usage: bash psql-poll.sh "<sql>" "<expected>" [attempts] [sleep_seconds]
# Polls <sql> against ark-storage-dev postgres until its trimmed result equals
# <expected>, looping inside one kubectl exec so connection overhead is paid
# once. Prints the final result; exits non-zero if it never matched.
# Auto-detects the namespace (ark-system in CI, default in devspace).
set -eu
SQL="$1"
EXPECTED="$2"
ATTEMPTS="${3:-80}"
SLEEP="${4:-0.5}"
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
kubectl exec -n "$NS" deployment/ark-storage-dev -- \
  env "PGPASSWORD=$PGPASSWORD" "SQL=$SQL" "EXPECTED=$EXPECTED" "ATTEMPTS=$ATTEMPTS" "SLEEP=$SLEEP" \
  sh -c '
    i=0
    result=""
    while :; do
      result=$(psql -U postgres -d ark -t -A -c "$SQL" 2>/tmp/psql-poll-err | tr -d " \n")
      [ "$result" = "$EXPECTED" ] && { printf "%s" "$result"; exit 0; }
      i=$((i + 1))
      [ "$i" -ge "$ATTEMPTS" ] && break
      sleep "$SLEEP"
    done
    [ -s /tmp/psql-poll-err ] && cat /tmp/psql-poll-err >&2
    printf "%s" "$result"
    exit 1
  '
