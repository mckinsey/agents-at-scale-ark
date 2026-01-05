# Chainsaw Testing Guide

## Test Structure

```
tests/test-name/
├── chainsaw-test.yaml      # Test definition
├── mock-llm-values.yaml    # Mock LLM config (optional)
├── README.md               # Required documentation
└── manifests/
    ├── a03-agent.yaml
    ├── a04-team.yaml       # Optional
    └── a05-query.yaml
```

### README Format
```markdown
# Test Name

Brief description.

## What it tests
- Functionality being tested

## Running
```bash
chainsaw test ./tests/test-name
```
```

## Test Setup

### Mock LLM and Tenant
Modern tests use Helm charts for setup:

```yaml
steps:
- name: setup
  try:
  - script:
      content: |
        helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \
          --version 0.1.25 \
          --namespace $NAMESPACE \
          --values mock-llm-values.yaml \
          --wait --timeout=120s
      env:
      - name: NAMESPACE
        value: ($namespace)
  - script:
      content: |
        helm install ark-tenant ../../charts/ark-tenant --namespace $NAMESPACE --wait
      env:
      - name: NAMESPACE
        value: ($namespace)
```

### Mock LLM Values
```yaml
# mock-llm-values.yaml
ark:
  model:
    enabled: true
    name: test-model
    provider: openai
    model: gpt-4
    apiKey: mock-api-key

config:
  rules:
    - path: "/v1/chat/completions"
      response:
        status: 200
        content: '{"choices":[{"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}]}'
```

## Assertions

Use conditions for resource readiness:

```yaml
# Model ready
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Model
      metadata:
        name: test-model
      status:
        conditions:
        - type: ModelAvailable
          status: "True"

# Agent ready
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Agent
      metadata:
        name: test-agent
      status:
        conditions:
        - type: Available
          status: "True"

# Query completed
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (conditions[?type == 'Completed']):
        - status: 'True'

# Response validation
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (length(responses)): 1
        (contains(responses[0].content, 'expected-text')): true
```

## Catch Blocks

Add catch blocks for debugging:

```yaml
catch:
- events: {}
- describe:
    apiVersion: ark.mckinsey.com/v1alpha1
    kind: Query
    name: test-query
```

## Model Reference Pattern

```yaml
# Model with provider
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: test-model
spec:
  provider: azure
  model:
    value: gpt-4.1-mini
  config:
    azure:
      baseUrl:
        value: "https://example.openai.azure.com"
      apiKey:
        valueFrom:
          secretKeyRef:
            name: api-key-secret
            key: token

# Agent references model
spec:
  modelRef:
    name: test-model

# Query references agent
spec:
  agent: test-agent
```

## Environment Variables

For real LLM tests (not mock-llm):
- `E2E_TEST_AZURE_OPENAI_KEY`
- `E2E_TEST_AZURE_OPENAI_BASE_URL`

## Debugging

```bash
# Keep resources after failure
chainsaw test tests/test-name --skip-delete

# Pause on failure
chainsaw test tests/test-name --pause-on-failure

# Check events
kubectl get events --sort-by='.lastTimestamp'
```

## HTTP API Testing with Hurl

For services with HTTP APIs, use Hurl inside a test pod:

```yaml
# Mount hurl test file
- script:
    skipLogOutput: true
    content: cat test.hurl
    outputs:
    - name: test_script
      value: ($stdout)
- apply:
    resource:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: hurl-test-files
      data:
        test.hurl: ($test_script)

# Test pod with hurl
- apply:
    resource:
      apiVersion: v1
      kind: Pod
      metadata:
        name: service-test
      spec:
        containers:
        - name: test-client
          image: ghcr.io/orange-opensource/hurl:6.1.1
          command: ["sleep", "300"]
          volumeMounts:
          - name: test-files
            mountPath: /tests
        volumes:
        - name: test-files
          configMap:
            name: hurl-test-files
        restartPolicy: Never

# Execute tests
- script:
    content: |
      kubectl exec service-test -n $NAMESPACE -- hurl --test /tests/test.hurl
    env:
    - name: NAMESPACE
      value: ($namespace)
```

### Hurl Test Example
```hurl
GET http://service-name/health
HTTP 200

POST http://service-name/api/endpoint
Content-Type: application/json
{"data": "value"}
HTTP 200
[Asserts]
jsonpath "$.status" == "success"
```
