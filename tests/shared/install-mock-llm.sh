#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../.github/helm-versions.env"
helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \
  --version "${MOCK_LLM_VERSION}" \
  --namespace "$NAMESPACE" \
  --values ../mock-llm-values.yaml \
  --values mock-llm-values.yaml \
  --wait --timeout=120s

MOCK_URL="http://mock-llm.$NAMESPACE.svc.cluster.local:6556"
kubectl run test-mock-llm-ready --image=curlimages/curl --rm -i --restart=Never -n "$NAMESPACE" -- \
  curl -f -s --retry 5 --retry-connrefused --retry-delay 1 "${MOCK_URL}/v1/models"
