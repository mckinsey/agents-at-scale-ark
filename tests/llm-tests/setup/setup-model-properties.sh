#!/bin/bash
set -e

NAMESPACE="${1:?}"

if [[ "$MODEL" == *azure* ]]; then
  MODEL_VALUE=$(kubectl get model test-model -n "$NAMESPACE" -o jsonpath='{.spec.model.value}')
  BASE_URL=$(kubectl get model test-model -n "$NAMESPACE" -o jsonpath='{.spec.config.azure.baseUrl.value}')
  API_VERSION=$(kubectl get model test-model -n "$NAMESPACE" -o jsonpath='{.spec.config.azure.apiVersion.value}')

  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: test-model-properties
spec:
  type: azure
  model:
    value: ${MODEL_VALUE}
  config:
    azure:
      properties:
        temperature:
          value: "0.1"
        max_tokens:
          value: "100"
        top_p:
          value: "0.9"
        frequency_penalty:
          value: "0.5"
        presence_penalty:
          value: "0.3"
        seed:
          value: "42"
      baseUrl:
        value: ${BASE_URL}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
      apiVersion:
        value: ${API_VERSION}
EOF

elif [[ "$MODEL" == *openai* ]]; then
  MODEL_VALUE=$(kubectl get model test-model -n "$NAMESPACE" -o jsonpath='{.spec.model.value}')
  BASE_URL=$(kubectl get model test-model -n "$NAMESPACE" -o jsonpath='{.spec.config.openai.baseUrl.value}')

  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: test-model-properties
spec:
  type: openai
  model:
    value: ${MODEL_VALUE}
  config:
    openai:
      properties:
        temperature:
          value: "0.1"
        max_tokens:
          value: "100"
        top_p:
          value: "0.9"
        frequency_penalty:
          value: "0.5"
        presence_penalty:
          value: "0.3"
        seed:
          value: "42"
      baseUrl:
        value: ${BASE_URL}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
EOF

else
  echo "Unsupported MODEL: $MODEL"
  exit 1
fi
