---
name: ark-chainsaw-testing
description: Run and write Ark Chainsaw tests with mock-llm. Use for running tests, debugging failures, or creating new e2e tests.
---

# Ark Chainsaw Testing

Run and write Chainsaw e2e tests for Ark resources.

## Running Tests

```bash
# Run all standard tests
(cd tests && chainsaw test --selector 'standard')

# Run specific test
chainsaw test ./tests/query-parameter-ref --fail-fast

# Debug mode - keep resources on failure
chainsaw test ./tests/query-parameter-ref --skip-delete --pause-on-failure
```

## Writing Tests

Reference `tests/CLAUDE.md` for comprehensive patterns.

For a complete working example that shows the correct patterns for writing tests, see [examples.md](examples.md).

## Test Structure

```
tests/my-test/
├── chainsaw-test.yaml      # Test definition
├── mock-llm-values.yaml    # Mock LLM config (if needed)
├── README.md               # Required documentation
└── manifests/
    ├── a03-model.yaml      # Model before Agent
    ├── a04-agent.yaml      # Agent before Query
    └── a05-query.yaml      # Query last
```

## Antipatterns

### `kubectl wait` for CRD conditions

**Never** use `kubectl wait --for=condition=Established` to check CRD readiness. This command crashes with a type error when `.status.conditions` is `nil` (a known kubectl bug: kubernetes/kubernetes#66439):

```
error: .status.conditions accessor error: <nil> is of the type <nil>, expected []interface{}
```

Use a chainsaw `assert` with JMESPath instead — it polls gracefully and waits for the field to appear:

```yaml
# Bad - crashes if .status.conditions is nil
- script:
    content: |
      kubectl apply -f my-crd.yaml
      kubectl wait --for=condition=Established crd/my-crd.example.com --timeout=60s

# Good - polls until condition appears, no nil crash
- script:
    content: |
      kubectl apply -f my-crd.yaml
- assert:
    resource:
      apiVersion: apiextensions.k8s.io/v1
      kind: CustomResourceDefinition
      metadata:
        name: my-crd.example.com
      status:
        (conditions[?type == 'Established']):
          - status: "True"
```

This pattern converts a brittle timeout into an explicit condition check. The same applies to any resource whose `.status.conditions` may start as `nil`.

### `assert` instead of `wait` for Query completion

**Never** use `assert` to wait for a Query to complete. `assert` polls the API server repeatedly; `wait` uses a Kubernetes watch (event-driven), which is faster and cheaper:

```yaml
# Bad - polls every few seconds, hammers the API server
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        phase: done

# Good - uses a watch, fires once the condition is set
- wait:
    apiVersion: ark.mckinsey.com/v1alpha1
    kind: Query
    name: test-query
    timeout: 4m
    for:
      condition:
        name: Completed
        value: 'True'
```

Use `assert` only **after** `wait` has confirmed the query is done — i.e., for post-completion validation of response fields. Keep these as **separate steps** so timing is explicit:

```yaml
- name: wait-for-query-completion
  try:
  - wait:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      name: test-query
      timeout: 4m
      for:
        condition:
          name: Completed
          value: 'True'

- name: validate-response
  try:
  - assert:
      resource:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        metadata:
          name: test-query
        status:
          (response != null): true
          phase: done
```

### Shell scripts for condition checking

Avoid using shell scripts with `kubectl get` + `jq` to validate resource state when chainsaw assertions can express the check declaratively. Shell scripts fail immediately on unexpected `nil` values; assertions retry until the condition is met or the timeout expires.

```yaml
# Bad - fails immediately if field is absent
- script:
    content: |
      val=$(kubectl get myresource foo -o jsonpath='{.status.phase}')
      [ "$val" = "Ready" ] || exit 1

# Good - retries until condition is true
- assert:
    resource:
      apiVersion: example.com/v1
      kind: MyResource
      metadata:
        name: foo
      status:
        phase: Ready
```

## Environment Variables

For real LLM tests (not mock-llm):
```bash
export E2E_TEST_AZURE_OPENAI_KEY="your-key"
export E2E_TEST_AZURE_OPENAI_BASE_URL="your-endpoint"
```
