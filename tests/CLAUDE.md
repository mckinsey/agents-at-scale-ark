# Chainsaw Testing Guide

This document covers best practices for writing chainsaw tests in the Ark project.

## Test Taxonomy

Tests use labels in `chainsaw-test.yaml` metadata to control when they run.

### Label-Based Selectors

| Label | Meaning | CI Trigger |
|---|---|---|
| *(no label)* | Standard tests, use mock-llm | Always runs (`!llm,!postgresql` or `!llm`) |
| `llm: "true"` | Requires real LLM API keys | `e2e-tests-llm` job only |
| `postgresql: "true"` | Requires PostgreSQL backend + broker with postgres backend | Excluded from etcd-only runs |
| `etcd-only: "true"` | Requires etcd backend (e.g., uses cluster-scoped CRDs not served by embedded apiserver) | Excluded from postgresql backend runs |
| `requires-images: "true"` | Requires built container images | Conditional |
| `standard: "true"` | Explicit standard marker | Always runs |

### Basic Test Layout
```
tests/
├── test-name/
│   ├── chainsaw-test.yaml
│   ├── README.md             # Required test documentation
│   └── manifests/
│       ├── a00-rbac.yaml
│       ├── a01-secrets.yaml
│       ├── a02-configmaps.yaml
│       ├── a03-model.yaml
│       ├── a04-agent.yaml
│       └── a05-query.yaml
```

### README Documentation
Each test directory MUST include a `README.md` file with this format:

```markdown
# Test Name

Brief description of what the test validates.

## What it tests
- Specific functionality being tested
- Key components or integrations
- Expected behaviors or outcomes

## Running
```bash
chainsaw test
```

One sentence explaining what successful test completion validates.
```

### File Naming Convention
- Use `a00-`, `a01-`, etc. prefixes to control application order
- RBAC files should be first (`a00-rbac.yaml`)
- Dependencies should come before dependents (models before agents, agents before queries)

## RBAC Requirements

### Essential Pattern
All tests that create queries MUST include RBAC configuration:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: query-test-role
rules:
- apiGroups: ["ark.mckinsey.com"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: [""]
  resources: ["secrets", "configmaps"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: query-test-rolebinding
subjects:
- kind: ServiceAccount
  name: default
  namespace: ($namespace)
roleRef:
  kind: Role
  name: query-test-role
  apiGroup: rbac.authorization.k8s.io
```

### Key Points
- Use default service account, not custom ones
- Grant full permissions to `ark.mckinsey.com` resources
- Include `secrets` and `configmaps` access for parameter resolution
- Use `($namespace)` template for namespace references

## Parameter Templating

### Template Syntax
Use Go template syntax: `{{.parameter_name}}`

### Parameter Sources
- **Direct values**: `{{.agent_name}}`
- **ConfigMap references**: `{{.response_style}}`
- **Secret references**: `{{.special_instruction}}`

### Example Agent with Parameters
```yaml
spec:
  prompt: |
    You are {{.agent_name}} running in {{.test_mode}} mode.
    Your role is: {{.agent_role}}
    Response style: {{.response_style}}
    Maximum tokens per response: {{.max_tokens}}
    API endpoint for additional data: {{.api_endpoint}}
    Special instructions: {{.special_instruction}}
```

## Resource Assertions

### Agent Assertions
Agents don't have a `status.phase` field, so only assert existence:
```yaml
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Agent
      metadata:
        name: test-agent
```

### Query Assertions
Use `wait:` with the `Completed` condition to wait for query completion. This uses a Kubernetes watch instead of polling, which reduces API server load:
```yaml
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

Use `assert:` only for post-completion validation where the query is already known to be done:
```yaml
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        phase: done
```

**Never use `contains()` on response fields without a preceding `wait`.**

JMESPath's `contains()` requires a string or array — it throws a hard type error if the value is `nil`. Before the query completes, `response` is `nil`, so any assertion like `(contains(response.content, 'foo')): true` will immediately error rather than retry:

```yaml
# Bad - crashes on nil if query hasn't completed yet
- apply:
    file: manifests/a04-query.yaml
- assert:
    resource:
      ...
      status:
        (contains(response.content, 'expected text')): true

# Good - wait until response.content is populated, then assert against it
- apply:
    file: manifests/a04-query.yaml
- wait:
    apiVersion: ark.mckinsey.com/v1alpha1
    kind: Query
    name: test-query
    timeout: 2m
    for:
      jsonPath:
        path: '{.status.response.content}'
- assert:
    resource:
      ...
      status:
        (contains(response.content, 'expected text')): true
```

Prefer `for.jsonPath` over `for.condition: Completed=True` whenever the next step reads `response.content`. `Completed=True` can become visible on a watch before `response.content` has propagated to a subsequent read (especially on the postgresql backend, where watch events hop through the WAL consumer), and `contains(nil, ...)` errors rather than failing-with-retry. Waiting on the jsonpath itself fires only once the field is non-empty, so the follow-up assert and any shell-script `kubectl get … jsonpath='{.status.response.content}'` (which has no retry of its own) both see a populated value.

`Completed=True` is still the right wait for tests that only care that the query terminated — for example, error queries where the body of `response.content` is not what's under test.

### Model Assertions
Models should assert existence and readiness:
```yaml
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Model
      metadata:
        name: test-model
```

## Query Response Validation

### Using JP Functions
Use Chainsaw's JP functions for response validation instead of shell scripts:

```yaml
# Validate response exists
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (response != null): true

# Validate specific agent responded
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (response.target.name): 'expected-agent'

# Validate agent did NOT respond (check different target name)
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (response.target.name != 'excluded-agent'): true

# Validate response content length
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Query
      metadata:
        name: test-query
      status:
        (length(response.content) > `50`): true
```

### Label Selector Testing
Test queries with label selectors to validate target selection:

```yaml
# Query with matchLabels selector
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: test-query-selector
spec:
  input: Test query for label selection
  selector:
    matchLabels:
      environment: production
      type: specialist
```

## Using Mock LLM

Standard tests use mock-llm instead of a real LLM. Mock-llm is a configurable HTTP server that intercepts LLM API calls and returns scripted responses, making tests fast, deterministic, and runnable without API keys.

**Only use a real LLM** (with `llm: "true"` label) when the test genuinely requires actual language model reasoning — for example, multi-provider behavioral testing under `tests/llm-tests/`. Everything else should use mock-llm.

### Setup Pattern

Install mock-llm via the shared script, then wait for the Model CR it creates:

```yaml
- name: setup-mock-llm
  try:
  - script:
      timeout: 180s
      content: |
        bash ../shared/install-mock-llm.sh
      env:
      - name: NAMESPACE
        value: ($namespace)

- name: wait-for-model-ready
  try:
  - wait:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: Model
      name: test-model-mock
      timeout: 90s
      for:
        condition:
          name: ModelAvailable
          value: 'True'
```

The script installs the `mock-llm` Helm release using `mock-llm-values.yaml` from the test directory (if present) or the shared defaults. It creates a Model CR named `test-model-mock`.

### Configuring Responses

Create a `mock-llm-values.yaml` in the test directory to script the mock's responses. Rules are evaluated in order — **last match wins**, so place the 500 fallback first and specific rules last:

```yaml
config:
  rules:
  - path: "/v1/chat/completions"
    response:
      status: 500
      content: '"Unrecognised request"'

  - path: "/v1/chat/completions"
    match: "contains(body.messages[0].content || '', 'my agent')"
    response:
      status: 200
      content: '{"choices":[{"message":{"role":"assistant","content":"Hello from mock"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}'
```

### Cleanup

Uninstall mock-llm in the last step's `cleanup` block:

```yaml
    cleanup:
    - script:
        content: |
          helm uninstall mock-llm --namespace $NAMESPACE --wait --timeout=180s || true
        env:
        - name: NAMESPACE
          value: ($namespace)
```

## Resource Dependencies

### Dependency Order
1. RBAC (Role, RoleBinding)
2. mock-llm setup (if needed)
3. Other dependencies (ConfigMaps, Tools, etc.)
4. Agents (reference `test-model-mock`)
5. Queries (depend on Agents)

### Model Reference Pattern

Agents reference the mock model by name:

```yaml
# Agent references mock model
spec:
  modelRef:
    name: test-model-mock

# Query references agent
spec:
  agent: test-agent
```

## Debugging and Troubleshooting

### Keep Resources for Investigation
Use `--skip-delete` flag to keep resources after test failure:
```bash
chainsaw test tests/queries/ --skip-delete
```

### Check Kubernetes Events
When queries fail, examine events to understand the issue:
```bash
kubectl get events --sort-by='.lastTimestamp'
kubectl describe query test-query
```

### Common Event Messages
- `agents.ark.mckinsey.com "test-agent" is forbidden` - Missing RBAC permissions
- `secrets "test-token" is forbidden` - Missing secrets access in RBAC
- Query stuck in `phase: error` - Check agent/model dependencies

## Common Pitfalls and Spec Errors

### Don't Use Labels
Avoid adding labels to resources unless specifically required:
```yaml
# Bad
metadata:
  name: test-agent
  labels:
    test: "true"

# Good  
metadata:
  name: test-agent
```

### Resource Spec Format Errors

#### Agent Model Reference
```yaml
# Wrong - causes "unknown field spec.model" error
spec:
  model: test-model

# Correct - use modelRef
spec:
  modelRef:
    name: test-model
```

#### Team Members vs Targets
```yaml
# Wrong - causes "unknown field spec.targets" error
spec:
  strategy: sequential
  targets:
    - type: agent
      name: test-agent

# Correct - use members
spec:
  strategy: sequential
  members:
    - type: agent
      name: test-agent
```

### Missing RBAC
Query tests will fail with forbidden errors without proper RBAC configuration.

### Wrong Phase Assertion
Don't assert `status.phase` on resources that don't have it (like Agents).

### Parameter Resolution
Ensure ConfigMaps and Secrets exist before resources that reference them.

## Testing Services with Helm Charts

### MCP Services Pattern
For MCP services and other services that have Helm chart packaging, use this deployment pattern:

```yaml
# Deploy service using Helm chart
- name: deploy-service-with-helm
  try:
  - script:
      content: |
        helm install service-name ../chart --namespace $NAMESPACE --wait --timeout=30s
      env:
      - name: NAMESPACE
        value: ($namespace)
```

### Service Test Structure
```
mcp/service-name/test/
├── chainsaw-test.yaml
├── README.md
└── manifests/
    ├── a00-rbac.yaml
    ├── a04-secret.yaml
    ├── a05-model.yaml
    ├── a06-agent.yaml
    └── a07-query.yaml
```

### MCPServer Integration
Services deployed via Helm that create MCPServer resources require:

1. **Wait for MCPServer readiness**:
```yaml
- assert:
    resource:
      apiVersion: ark.mckinsey.com/v1alpha1
      kind: MCPServer
      metadata:
        name: service-name
```

2. **Agent tools reference auto-generated Tool resources**:
```yaml
spec:
  tools:
  - name: service-name-tool-1
    type: mcp
  - name: service-name-tool-2
    type: mcp
```

3. **Additional RBAC for service discovery**:
```yaml
rules:
- apiGroups: ["ark.mckinsey.com"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: [""]
  resources: ["secrets", "configmaps", "services"]
  verbs: ["get", "list", "watch"]
```

### Response Content Validation
For functional testing, validate that service operations actually worked:

```yaml
- name: validate-response-content
  try:
  - assert:
      resource:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        metadata:
          name: test-query
        status:
          # Validate response mentions expected operations
          (contains(response.content, 'operation-evidence')): true
  - script:
      content: |
        RESPONSE=$(kubectl -n $NAMESPACE get query test-query -o jsonpath='{.status.response.content}')
        
        echo "=== Query Response Content ==="
        echo "$RESPONSE"
        echo "=========================="
        
        # Validate specific operations mentioned in response
        if echo "$RESPONSE" | grep -qi "expected-operation"; then
          echo "✓ Response mentions expected operation"
        else
          echo "✗ Response missing expected operation"
          exit 1
        fi
```

### Cleanup Requirements

All tests that use `helm install` should include explicit cleanup sections to uninstall Helm releases. 

#### Cleanup Pattern

Add a `cleanup` section at the same indentation level as `catch` or `try`:

```yaml
    cleanup:
    - script:
        content: |
          helm uninstall ark-tenant --namespace $NAMESPACE --wait --timeout=180s || true
          helm uninstall mock-llm --namespace $NAMESPACE --wait --timeout=180s || true
        env:
        - name: NAMESPACE
          value: ($namespace)
```

#### Key Points

- **Placement**: Add cleanup at the same indentation as `catch` blocks within the last step
- **Blank line**: Include one blank line before the `cleanup:` section
- **Order**: Uninstall charts in reverse order of installation when multiple charts exist
- **Timeout**: Use `--wait --timeout=180s` to match chainsaw's cleanup timeout
- **Error handling**: Always use `|| true` to prevent cleanup failures if releases don't exist
- **Why required**: Explicit uninstalls are faster and more reliable than cascading namespace deletion

#### Example Test Structure

```yaml
spec:
  steps:
  - name: setup-and-test
    try:
    - script:
        content: |
          helm install ark-tenant ../../charts/ark-tenant --namespace $NAMESPACE --create-namespace --wait
    - apply:
        file: manifests/*.yaml
    - wait:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        name: test-query
        timeout: 4m
        for:
          condition:
            name: Completed
            value: 'True'
    catch:
    - events: {}
    - describe:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        name: test-query

    cleanup:
    - script:
        content: |
          helm uninstall ark-tenant --namespace $NAMESPACE --wait --timeout=180s || true
        env:
        - name: NAMESPACE
          value: ($namespace)
```

## Error Handling and Verbosity

### Standard Catch Blocks
All chainsaw tests with Query assertions should include catch blocks to reduce verbosity and provide debugging information:

```yaml
catch:
- events: {}
- describe:
    apiVersion: ark.mckinsey.com/v1alpha1
    kind: Query
    name: query-name
```

### Catch Block Purpose
- `events: {}` - Suppresses detailed event logging noise during normal operation
- `describe:` - Provides structured debugging information for Query resources when failures occur

### Event Validation Best Practices
When validating events in tests, check for presence rather than exact counts to avoid flakiness:

```yaml
# Good - robust presence checking
if [ "$target_execution_complete" -gt 0 ]; then
  echo "✓ TargetExecutionComplete events found"
fi

# Bad - exact count matching (flaky)
if [ "$target_execution_complete" -eq 1 ]; then
  echo "✓ Exactly 1 TargetExecutionComplete event"
fi
```

### Test Structure for Timing
Separate query completion waiting from validation steps to ensure proper timing:

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
```

## HTTP API Testing with Hurl

### Overview
Hurl is used for HTTP API testing of services within chainsaw tests. It provides comprehensive HTTP client functionality with JSON path validation and test assertions.

### Hurl Test File Structure
```
services/{service-name}/test/
├── test.hurl              # HTTP test definitions
├── chainsaw-test.yaml     # Chainsaw integration
└── manifests/
    ├── pod-{service}-test.yaml   # Test pod with hurl image
    └── configmap.yaml            # ConfigMap mounting hurl files
```

### Basic Hurl Test Patterns

#### Health Check Testing
```hurl
# Test service health endpoint
GET http://service-name/health
HTTP 200
[Asserts]
body == "OK"
```

#### JSON API Testing
```hurl
# Test JSON endpoint with validation
GET http://service-name/api/endpoint
HTTP 200
[Asserts]
jsonpath "$.status" == "ready"
jsonpath "$.data" exists
jsonpath "$.data.items" count >= 1
```

#### POST Request with JSON Body
```hurl
# Send JSON data to API
PUT http://service-name/api/resource/session-id
Content-Type: application/json
{
  "data": {
    "field": "value",
    "items": ["item1", "item2"]
  }
}
HTTP 200
[Asserts]
jsonpath "$.success" == true
```

#### Complex JSON Structure Testing
```hurl
# Test complex nested JSON responses
GET http://service-name/api/complex
HTTP 200
[Asserts]
jsonpath "$.messages" count == 3
jsonpath "$.messages[0].role" == "user"
jsonpath "$.messages[0].content" == "Expected content"
jsonpath "$.messages[0].tool_calls" exists
jsonpath "$.messages[0].tool_calls[0].id" == "call_123"
jsonpath "$.messages[0].tool_calls[0].function.name" == "function_name"
```

#### Error Handling Testing
```hurl
# Test error responses
GET http://service-name/api/nonexistent
HTTP 404

POST http://service-name/api/endpoint
Content-Type: application/json
{
  "invalid": "request"
}
HTTP 400
[Asserts]
jsonpath "$.error.code" == -32600
jsonpath "$.error.message" exists
```

### Chainsaw Integration Pattern

#### ConfigMap for Hurl Files
```yaml
# Mount hurl test files into test pod
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
```

#### Test Pod Setup
```yaml
# Pod with hurl Docker image
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
        terminationGracePeriodSeconds: 0
```

#### Test Execution
```yaml
# Execute hurl tests inside pod
- name: run-hurl-tests
  try:
  - script:
      content: |
        kubectl exec service-test -n $NAMESPACE -- hurl --test /tests/test.hurl
      env:
      - name: NAMESPACE
        value: ($namespace)
      timeout: 120s
```

### Service-Specific Examples

#### PostgreSQL Memory Service Pattern
Based on `services/postgres-memory/test/test.hurl`:

```hurl
# Test message storage and retrieval
PUT http://postgres-memory/message/test-session
Content-Type: application/json
{
  "message": {
    "role": "user",
    "content": "Test message"
  }
}
HTTP 200

# Verify message retrieval
GET http://postgres-memory/message/test-session
HTTP 200
[Asserts]
jsonpath "$.messages" count == 1
jsonpath "$.messages[0].role" == "user"
jsonpath "$.messages[0].content" == "Test message"

# Test session isolation
GET http://postgres-memory/message/other-session
HTTP 200
[Asserts]
jsonpath "$.messages" == null
```

#### A2A Gateway Service Pattern
Based on `services/a2agw/test/test.hurl`:

```hurl
# Test agent discovery
GET http://a2agw:8080/agents
HTTP 200
[Asserts]
jsonpath "$" count >= 1
jsonpath "$[*]" contains "agent-name"

# Test agent capabilities
GET http://a2agw:8080/agent/agent-name/.well-known/agent.json
HTTP 200
[Asserts]
jsonpath "$.name" == "agent-name"
jsonpath "$.skills" count >= 1
jsonpath "$.skills[0].id" exists

# Test JSON-RPC messaging
POST http://a2agw:8080/agent/agent-name/jsonrpc
Content-Type: application/json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "messageId": "test-1",
      "role": "user",
      "parts": [{"text": "Test message"}]
    }
  },
  "id": 1
}
HTTP 200
[Asserts]
jsonpath "$.jsonrpc" == "2.0"
jsonpath "$.id" == 1
jsonpath "$.result.messageId" exists
```

### Best Practices

#### Test Organization
- Group related tests logically in single .hurl file
- Use descriptive comments for each test section
- Test happy path first, then error conditions
- Include session isolation tests for stateful services

#### Assertion Strategies
- Test response structure with `jsonpath` exists/count
- Validate specific values with exact matches
- Use `contains` for flexible array content validation
- Test null values explicitly where expected

#### Service URLs
- Use service names for internal Kubernetes DNS resolution
- Include port numbers when services don't use standard ports
- Test both primary endpoints and health checks

#### Error Testing
- Test invalid endpoints (404 responses)
- Test malformed requests (400 responses)
- Validate error response structure and codes
- Test authentication/authorization failures where applicable

### Integration with ARK Testing

#### Combined HTTP and ARK Testing
```yaml
# First test HTTP endpoints directly
- name: run-hurl-tests
  try:
  - script:
      content: kubectl exec test-pod -- hurl --test /tests/test.hurl

# Then test ARK integration
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
```

This pattern validates both the service's HTTP API functionality and its integration with the ARK platform.

## Test Execution

### Local Testing
```bash
# Run all tests
chainsaw test tests/

# Run specific test
chainsaw test tests/queries/

# Debug mode with cleanup disabled 
chainsaw test tests/ --test-dir tests/queries --pause-on-failure
```

### Validation
- Each test should pass independently when run individually

## Playwright UI Testing

### Radix UI Select

Two things make Radix UI Select options unstable for Playwright:

1. **React re-render race**: Filling a form field and immediately clicking a Select trigger can race with React Hook Form's blur/validation re-render, causing the trigger to be briefly detached or the select to open and immediately close.
2. **Open animation**: `data-state="open"` fires at the *start* of the entry animation (zoom-in, slide-in), not the end. Playwright sees the bounding box still changing and reports "element is not stable". The animation must fully complete before options are clickable.

Best practices for reliable Select interaction:

1. Scope the trigger selector to the dialog to avoid matching other comboboxes on the page.
2. Blur the form input before clicking the trigger, so React re-renders from validation happen before the click.
3. Retry the click if the listbox doesn't appear (handles transient close).
4. Do NOT require `[data-side]` in the listbox selector — Radix Popper sets it asynchronously and it may not be present immediately in headless CI.

```python
name_input.fill(tool_name)
name_input.blur()  # Trigger form validation re-render before clicking select

type_trigger = page.locator("[role='dialog'] [role='combobox']").first
type_trigger.scroll_into_view_if_needed()
type_trigger.wait_for(state="visible", timeout=15000)

listbox = page.locator("[role='listbox'][data-state='open']")
for attempt in range(3):
    type_trigger.click()
    try:
        listbox.wait_for(state="visible", timeout=5000)
        break
    except Exception:
        pass  # retry

self.wait_for_animations_complete(listbox)
page.locator("[role='option']:has-text('HTTP')").first.click()
```

`wait_for_animations_complete` uses the Web Animations API to block until all running animations on the element and its subtree finish:

```python
handle = locator.element_handle(timeout=timeout)
if handle:
    page.evaluate("el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished))", handle)
```

Use `page.evaluate(fn, handle)` rather than `locator.evaluate(fn)` — the latter can cause Playwright to refocus the element, which closes Radix dropdowns.

`{subtree: true}` is required — without it, `getAnimations()` only checks the listbox container, not the option elements that are actually animating.

If options are still detaching after this, the likely cause is a parent component re-rendering while the dropdown is open (e.g. a `form.watch()` call in React Hook Form re-rendering on blur/validation). Fix it in the component by replacing `form.watch(name)` with `useWatch({ control, name })`, which only re-renders when the field value changes.

- Query tests should reach `phase: done`
- No RBAC permission errors in events

## PostgreSQL Broker Tests

Tests labeled `postgresql: "true"` run in the `storage-backend: postgresql` CI matrix, where the broker uses a Postgres backend (MESSAGE_BACKEND=postgres). This means broker messages are persisted in the `messages` table of the `ark-storage-dev` Postgres instance in `ark-system`.

Use this label when a test needs to verify broker message persistence, `expires_at`, or other Postgres-specific behavior.

### Querying Postgres from a chainsaw test

Use the shared `psql-query.sh` script to run SQL against `ark-storage-dev`:

```yaml
- name: verify-postgres
  try:
  - script:
      timeout: 30s
      content: |
        TTL=$(bash ../shared/psql-query.sh \
          "SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::int FROM messages WHERE query_id='my-query' LIMIT 1;" \
          | tr -d ' \n')
        echo "ttl_seconds: ${TTL}"
        [ "${TTL}" = "3600" ] || { echo "expected 3600, got ${TTL}"; exit 1; }
      env:
      - name: NAMESPACE
        value: ($namespace)
```

The script reads the password from the `ark-storage-dev-password` secret in `ark-system` and execs psql on the `ark-storage-dev` deployment.