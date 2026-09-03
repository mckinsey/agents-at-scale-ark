#!/usr/bin/env bash
set -euo pipefail

max_attempts=3
delay=5

attempt=1
until "$@"; do
  if [[ $attempt -ge $max_attempts ]]; then
    echo ">> Command failed after $attempt attempts: $*" >&2
    exit 1
  fi
  echo ">> Attempt $attempt failed, retrying in ${delay}s: $*" >&2
  sleep "$delay"
  attempt=$((attempt + 1))
  delay=$((delay * 2))
done
