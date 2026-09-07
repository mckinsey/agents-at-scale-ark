#!/usr/bin/env bash
# Usage: bash psql-poll.sh "<sql>" "<expected>" [attempts] [sleep_seconds]
# Polls <sql> against the broker's ark-storage-dev postgres until its trimmed
# result equals <expected>, looping inside one kubectl exec so connection
# overhead is paid once. Prints the final result; exits non-zero if it never
# matched. Picks the ark-storage-dev whose DB holds the broker schema (CI keeps
# it in ark-system, devspace in the broker's namespace).
set -eu
SQL="$1"
EXPECTED="$2"
ATTEMPTS="${3:-80}"
SLEEP="${4:-0.5}"
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
