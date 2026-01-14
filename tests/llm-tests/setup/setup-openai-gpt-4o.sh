#!/bin/bash
set -e

NAMESPACE="${1:?}"

# Support both CICD_* and E2E_TEST_* variable naming
OPENAI_API_KEY="${CICD_OPENAI_API_KEY:-${E2E_TEST_OPENAI_API_KEY:?}}"
OPENAI_BASE_URL="${CICD_OPENAI_BASE_URL:-${E2E_TEST_OPENAI_BASE_URL:-https://api.openai.com/v1}}"

kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: test-model-token
type: Opaque
stringData:
  token: ${OPENAI_API_KEY}
EOF

kubectl wait --for=jsonpath='{.metadata.name}'=test-model-token secret/test-model-token -n "$NAMESPACE" --timeout=30s

kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: test-model
spec:
  type: openai
  model:
    value: gpt-4o-mini
  config:
    openai:
      baseUrl:
        value: ${OPENAI_BASE_URL}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
EOF
