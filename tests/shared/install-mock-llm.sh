#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../.github/helm-versions.env"
MOCK_LLM_CHART="${HOME}/.cache/helm/charts/mock-llm-${MOCK_LLM_VERSION}.tgz"
if [ ! -f "${MOCK_LLM_CHART}" ]; then
  MOCK_LLM_CHART="oci://ghcr.io/dwmkerr/charts/mock-llm"
fi
helm install mock-llm "${MOCK_LLM_CHART}" \
  --version "${MOCK_LLM_VERSION}" \
  --namespace "$NAMESPACE" \
  --values ../mock-llm-values.yaml \
  --values mock-llm-values.yaml \
  --wait --timeout=120s

MOCK_URL="http://mock-llm.$NAMESPACE.svc.cluster.local:6556"
kubectl run test-mock-llm-ready --image=curlimages/curl --rm -i --restart=Never -n "$NAMESPACE" -- \
  curl -f -s --retry 5 --retry-connrefused --retry-delay 1 "${MOCK_URL}/v1/models"
