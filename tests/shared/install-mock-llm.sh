#!/usr/bin/env bash
set -e
helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \
  --version 0.1.28 \
  --namespace "$NAMESPACE" \
  --values ../mock-llm-values.yaml \
  --values mock-llm-values.yaml \
  --wait --timeout=120s

MOCK_URL="http://mock-llm.$NAMESPACE.svc.cluster.local:6556"
kubectl run test-mock-llm-ready --image=curlimages/curl --rm -i --restart=Never -n "$NAMESPACE" -- \
  curl -f -s --retry 5 --retry-connrefused --retry-delay 1 "${MOCK_URL}/v1/models"
