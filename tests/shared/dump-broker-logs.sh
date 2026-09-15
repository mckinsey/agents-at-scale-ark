#!/usr/bin/env bash
# Usage: NAMESPACE=<test-namespace> bash dump-broker-logs.sh
# Dumps ark-broker pods and logs for a failing chainsaw step.
# Tests that talk to the shared broker find it via the ark-config-broker
# configmap, which points at another namespace; tests that install their own
# broker have no such configmap and fall back to the test namespace.
BROKER_NS=$(kubectl get configmap ark-config-broker -n "$NAMESPACE" -o json 2>/dev/null |
  jq -r '.data.serviceRef // empty' 2>/dev/null |
  grep '^namespace:' | sed 's/^namespace:[[:space:]]*//' | tr -d '"' | tr -d ' ')
BROKER_NS=${BROKER_NS:-$NAMESPACE}

echo "=== ark-broker pods (namespace: ${BROKER_NS}) ==="
kubectl -n "$BROKER_NS" get pods -l app.kubernetes.io/name=ark-broker -o wide || true

echo "=== ark-broker logs (namespace: ${BROKER_NS}) ==="
kubectl -n "$BROKER_NS" logs -l app.kubernetes.io/name=ark-broker \
  --all-containers --tail=200 || true
