#!/usr/bin/env bash
# Fails when the Ark apiserver recovered from a panic during an E2E run.
# The generic apiserver swallows handler panics per request, so pods stay Ready
# and the tests can pass while watch streams are being cut off (#3720).
#
# Usage: check-apiserver-panics.sh <kubectl cluster-info dump directory>
set -euo pipefail

dump="${1:?usage: $0 <cluster-logs-dir>}"

logs=$(find "$dump" -path '*/ark-apiserver-*/logs.txt' | sort)
if [ -z "$logs" ]; then
  echo "::error::no ark-apiserver pod log found under $dump"
  exit 1
fi

# shellcheck disable=SC2086 # paths come from find, one per line, no spaces
if grep -l "apiserver panic'd" $logs; then
  echo "::error::the Ark apiserver recovered from at least one panic during the run; see the cluster-logs artifact"
  exit 1
fi

echo "no apiserver panics in:"
echo "$logs"
