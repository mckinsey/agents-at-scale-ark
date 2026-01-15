# Example: Query Parameter Ref Test

A complete working example testing query parameter resolution with mock-llm.

## Test Structure

```
tests/query-parameter-ref/
├── chainsaw-test.yaml
├── mock-llm-values.yaml
├── README.md
└── manifests/
    ├── a02-configmap.yaml
    ├── a03-secret-params.yaml
    ├── a04-agent.yaml
    └── a05-query.yaml
```

## chainsaw-test.yaml

```yaml
apiVersion: chainsaw.kyverno.io/v1alpha1
kind: Test
metadata:
  name: query-parameter-ref
spec:
  steps:
    - try:
      # Install mock-llm with Ark Model and custom config
      - script:
          content: |
            helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \
              --version 0.1.23 \
              --namespace $NAMESPACE \
              --values mock-llm-values.yaml
          env:
          - name: NAMESPACE
            value: ($namespace)
      # Install ark-tenant for RBAC
      - script:
          content: |
            helm install ark-tenant ../../charts/ark-tenant --namespace $NAMESPACE --create-namespace --wait
          env:
          - name: NAMESPACE
            value: ($namespace)
      # Apply ConfigMap, Secret
      - apply:
          file: manifests/a0[2-3]-*.yaml
      # Wait for Model to be available
      - assert:
          resource:
            apiVersion: ark.mckinsey.com/v1alpha1
            kind: Model
            metadata:
              name: mock-gpt-4.1
            status:
              conditions:
              - type: ModelAvailable
                status: "True"
      # Apply agent and query
      - apply:
          file: manifests/a04-agent.yaml
      - apply:
          file: manifests/a05-query.yaml
      # Assert query completes
      - assert:
          timeout: 5s
          resource:
            apiVersion: ark.mckinsey.com/v1alpha1
            kind: Query
            metadata:
              name: test-query-with-params
            status:
              phase: done
      # Validate response contains resolved parameter
      - assert:
          timeout: 1s
          resource:
            apiVersion: ark.mckinsey.com/v1alpha1
            kind: Query
            metadata:
              name: test-query-with-params
            status:
              (length(responses)): 1
              (contains(responses[*].target.name, 'test-agent')): true
              (contains(responses[0].content, 'QueryAgent123')): true
      catch:
      - events: {}
      - describe:
          apiVersion: ark.mckinsey.com/v1alpha1
          kind: Query
          name: test-query-with-params
```

## mock-llm-values.yaml

```yaml
terminationGracePeriodSeconds: 3
ark:
  model:
    enabled: true
    name: mock-gpt-4.1
    type: openai
    model: gpt-4.1
    pollInterval: 3s
    apiKey: mock-api-key

config:
  rules:
  - path: "/v1/chat/completions"
    match: "@"
    response:
      status: 200
      content: |
        {
          "id": "mock-{{timestamp}}",
          "object": "chat.completion",
          "model": "{{jmes request body.model}}",
          "choices": [{
            "message": {{jmes request body.messages[0]}},
            "finish_reason": "stop"
          }]
        }
```

## manifests/a04-agent.yaml

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: test-agent
spec:
  modelRef:
    name: mock-gpt-4.1
  prompt: |
    Your name is {{.agent_name}}.
  parameters:
    - name: agent_name
      valueFrom:
        queryParameterRef:
          name: your_name
```

## manifests/a05-query.yaml

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: test-query-with-params
spec:
  input: What's your name?
  parameters:
    - name: your_name
      value: "QueryAgent123"
  targets:
    - type: agent
      name: test-agent
```

## Key Patterns

1. **Mock-LLM echoes system message** - Use `{{jmes request body.messages[0]}}` to echo back for deterministic validation
2. **Short timeouts** - Use 5-10s for mock-llm tests
3. **Catch blocks** - Always include `events: {}` and `describe:` for debugging
4. **JMESPath assertions** - Use `(contains(...))` and `(length(...))` for response validation
