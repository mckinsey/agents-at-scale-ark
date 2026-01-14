#!/bin/bash
set -e

NAMESPACE="${1:?}"

# Support both CICD_* and E2E_TEST_* variable naming
AZURE_OPENAI_KEY="${CICD_AZURE_OPENAI_KEY:-${E2E_TEST_AZURE_OPENAI_KEY:?}}"
AZURE_OPENAI_BASE_URL="${CICD_AZURE_OPENAI_BASE_URL:-${E2E_TEST_AZURE_OPENAI_BASE_URL:?}}"
AZURE_OPENAI_API_VERSION="${CICD_AZURE_OPENAI_API_VERSION:-${E2E_TEST_AZURE_OPENAI_API_VERSION:-2024-12-01-preview}}"

kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: test-model-token
type: Opaque
stringData:
  token: ${AZURE_OPENAI_KEY}
EOF

kubectl wait --for=jsonpath='{.metadata.name}'=test-model-token secret/test-model-token -n "$NAMESPACE" --timeout=30s

kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: test-model
spec:
  type: azure
  model:
    value: gpt-4o-mini
  config:
    azure:
      baseUrl:
        value: ${AZURE_OPENAI_BASE_URL}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
      apiVersion:
        value: ${AZURE_OPENAI_API_VERSION}
EOF
