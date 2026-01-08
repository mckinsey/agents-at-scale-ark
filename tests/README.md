# ARK Tests

End-to-end tests for Agents at Scale (ARK) using Chainsaw testing framework.

## Current Test Coverage

### ✅ Well-Tested Resource Types

#### Core Resource Tests
- **`models/`** - Basic model creation and configuration
- **`agents/`** - Agent creation and model references  
- **`queries/`** - Basic query execution

#### Parameter and Configuration Tests
- **`agent-parameters/`** - Parameter injection from ConfigMaps/Secrets
- **`query-parameters/`** - Query parameter templating
- **`agent-default-model/`** - Default model fallback behavior

#### Tool Integration Tests
- **`agent-tools/`** - External tool integration 
- **`weather-chicago/`** - Real-world API integration

#### Query Targeting Tests
- **`query-label-selector/`** - Label-based agent selection
- **`query-token-usage/`** - Token usage tracking

#### Team Coordination Tests
- **`team-sequential/`** - Sequential team workflows
- **`team-round-robin/`** - Round-robin with terminate tool

#### Validation Tests
- **`admission-failures/`** - Comprehensive admission controller validation

### ❌ Critical Test Coverage Gaps

| Resource Type | Current Tests | Available Samples | Coverage Status |
|---------------|---------------|-------------------|-----------------|
| **Evaluator** | 0 | 2+ | 🔴 **No Coverage** |
| **Memory** | 0 | 1+ | 🔴 **No Coverage** |
| **MCPServer** | 0 | 3+ | 🔴 **No Coverage** |
| **ExecutionEngine** | 0 | 3+ | 🔴 **No Coverage** |
| **Team Strategies** | 2/4 | 4+ | 🟡 **Partial Coverage** |
| **Model Providers** | 1/3 | 8+ | 🟡 **Partial Coverage** |

## Test Implementation Roadmap

### Phase 1: Critical Resource Coverage (Weeks 1-3)
**Priority: HIGH - Foundation resources with no test coverage**

#### Memory Integration Tests
- [ ] **`memory-basic/`** - Basic postgres memory with session isolation
- [ ] **`memory-session-continuity/`** - Session continuity across queries  
- [ ] **`memory-cross-session/`** - Multi-user session isolation

#### Evaluator Integration Tests
- [ ] **`evaluator-basic/`** - Single LLM evaluator with queries
- [ ] **`evaluator-multiple/`** - Multiple evaluator selection
- [ ] **`evaluator-label-selector/`** - Label-based evaluator discovery

#### MCP Server Integration Tests
- [ ] **`mcp-filesystem/`** - Local filesystem MCP server
- [ ] **`mcp-github/`** - Remote GitHub MCP with authentication
- [ ] **`mcp-tool-discovery/`** - MCP-based tool integration

### Phase 2: Advanced Team Strategies (Weeks 4-5)
**Priority: HIGH - Core team functionality gaps**

#### Graph Strategy Tests
- [ ] **`team-graph-strategy/`** - Directed graph team execution
- [ ] **`team-graph-complex/`** - Multi-path graph workflows

#### Selector Strategy Tests  
- [ ] **`team-selector-strategy/`** - AI-driven participant selection
- [ ] **`team-selector-complex/`** - Context-aware selection logic

### Phase 3: Execution Engine Integration (Weeks 6-7)
**Priority: MEDIUM - External execution frameworks**


#### LangChain Engine Tests
- [ ] **`execution-engine-langchain/`** - LangChain agent execution
- [ ] **`langchain-tool-integration/`** - Tool chain workflows

### Phase 4: Enhanced Model & Query Coverage (Weeks 8-9)
**Priority: MEDIUM - Configuration and integration completeness**

#### Multi-Provider Model Tests
- [ ] **`model-azure-properties/`** - Azure OpenAI with custom properties
- [ ] **`model-bedrock-claude/`** - AWS Bedrock Claude integration  
- [ ] **`model-gemini-vertex/`** - Google Gemini integration
- [ ] **`model-fallback-strategy/`** - Model fallback handling

#### Advanced Query Patterns  
- [ ] **`query-service-account/`** - Service account integration
- [ ] **`query-timeout-retry/`** - Timeout and retry logic
- [ ] **`query-evaluation-flow/`** - Query → Evaluator integration

### Phase 5: Security & Performance Testing (Weeks 10-11)
**Priority: LOW - Production readiness**

#### Security & RBAC Tests
- [ ] **`rbac-cross-namespace/`** - Cross-namespace access patterns
- [ ] **`secret-management/`** - Secure credential handling
- [ ] **`service-account-permissions/`** - Fine-grained permissions

#### Performance & Reliability Tests
- [ ] **`load-testing-queries/`** - High-volume query execution
- [ ] **`concurrent-team-execution/`** - Parallel team workflows  
- [ ] **`resource-cleanup/`** - Proper resource lifecycle management

## Test Categories

### Core Resource Tests
Basic functionality for individual resource types.

### Integration Tests
Multi-resource workflows and complex interactions.

### Validation Tests
Admission controller and error handling scenarios.

### Performance Tests
Load testing and scaling validation.

## Running Tests

### All Tests
```bash
chainsaw test tests/
```

### Specific Test
```bash
chainsaw test tests/queries/
```

### Debug Mode
```bash
chainsaw test tests/queries/ --skip-delete
```

## Environment Requirements

Set these environment variables:
- `E2E_TEST_AZURE_OPENAI_KEY` - Azure OpenAI API key
- `E2E_TEST_AZURE_OPENAI_BASE_URL` - Azure OpenAI base URL

## Test Structure

Each test follows this pattern:
```
test-name/
├── chainsaw-test.yaml    # Test definition
├── README.md            # Test documentation
└── manifests/           # Kubernetes resources
    ├── a00-rbac.yaml    # RBAC configuration
    ├── a01-secret.yaml  # Secrets
    └── ...              # Other resources
```

## Implementation Complexity

### Low Complexity (1-2 days each)
- Memory basic integration tests
- Single evaluator tests  
- Filesystem MCP tests
- Basic graph/selector team tests

### Medium Complexity (3-5 days each)  
- Multi-evaluator coordination tests
- Remote MCP with authentication tests
- Complex team strategy tests
- Multi-provider model tests

### High Complexity (1-2 weeks each)
- Execution engine integration tests
- Load testing and performance validation
- Complex security and RBAC validation

## Success Metrics

### Coverage Goals
- **Resource Coverage**: 100% of CRD types have basic functional tests
- **Integration Coverage**: All major integration patterns tested  
- **Sample Validation**: Every sample configuration has corresponding test
- **Admission Testing**: All validation scenarios covered

### Quality Gates
- All tests pass consistently in CI/CD pipeline
- Test execution time < 15 minutes total
- Clear test failure diagnostics and error messages
- Documentation for each test scenario and purpose

## Contributing

When adding new tests:

1. **Follow the standard test structure** with chainsaw-test.yaml, README.md, and manifests/
2. **Include comprehensive README** explaining what the test validates
3. **Use proper resource naming** with a00-, a01- prefixes for dependency order
4. **Add RBAC configuration** for tests that create queries
5. **Update this roadmap** when implementing planned tests

## Current Status

- **Tests Implemented**: 15+ test scenarios
- **Resource Types Covered**: 6/9 (67%)
- **Critical Gaps**: Memory, Evaluator, MCP, ExecutionEngine
- **Next Priority**: Phase 1 (Memory, Evaluator, MCP integration)