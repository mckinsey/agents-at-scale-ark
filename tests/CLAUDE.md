# Chainsaw Testing Guide

This document covers best practices for writing chainsaw tests in the ARK project.

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
Queries should assert `phase: done` for successful completion:
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

## Environment Variables

### Required Variables
Tests use these environment variables for Azure OpenAI:
- `E2E_TEST_AZURE_OPENAI_KEY`
- `E2E_TEST_AZURE_OPENAI_BASE_URL`

### Script Setup Pattern
```yaml
- script:
    skipLogOutput: true
    content: |
      set -u
      echo "{\"token\": \"$E2E_TEST_AZURE_OPENAI_KEY\", \"url\": \"$E2E_TEST_AZURE_OPENAI_BASE_URL\"}"
    outputs:
    - name: azure
      value: (json_parse($stdout))
```

### Secret Template Pattern
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: test-model-token
type: Opaque
data:
  token: (base64_encode($azure.token))
```

## Resource Dependencies

### Dependency Order
1. RBAC (Role, RoleBinding)
2. Secrets and ConfigMaps
3. Models
4. Agents (depend on Models)
5. Queries (depend on Agents)

### Model Reference Pattern
```yaml
# Model - CORRECT v1alpha1 format
metadata:
  name: test-model
spec:
  type: azure
  model:
    value: gpt-4.1-mini
  config:
    azure:
      baseUrl:
        value: ($azure.url)
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
      apiVersion:
        value: "2024-12-01-preview"

# Agent references model - use modelRef
spec:
  modelRef:
    name: test-model
  
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

#### Secret Template Syntax
```yaml
# Wrong - will cause template parse error
data:
  token: (($azure.token) | @base64)

# Correct - use chainsaw function
data:
  token: (base64_encode($azure.token))
```

#### Model Spec Format
```yaml
# Wrong - old format causes "unknown field" errors
spec:
  provider: azure-openai
  model: gpt-4.1-mini
  baseURL: ($azure.url)
  auth:
    tokenSecret:
      name: test-model-token
      key: token

# Correct - current v1alpha1 format
spec:
  type: azure
  model:
    value: gpt-4.1-mini
  config:
    azure:
      baseUrl:
        value: ($azure.url)
      apiKey:
        valueFrom:
          secretKeyRef:
            name: test-model-token
            key: token
      apiVersion:
        value: "2024-12-01-preview"
```

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
  - assert:
      resource:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        metadata:
          name: test-query
        status:
          phase: done

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
- name: test-ark-integration
  try:
  - assert:
      resource:
        apiVersion: ark.mckinsey.com/v1alpha1
        kind: Query
        status:
          phase: done
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
- Query tests should reach `phase: done`
- No RBAC permission errors in events