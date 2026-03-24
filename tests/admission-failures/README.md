# Admission Failures Test

Comprehensive test of admission controller validation by attempting to create invalid ARK resources.

## What it tests

### Model Validation
- Missing required type field
- Missing required config section
- Invalid/unsupported model type values

### Agent Validation  
- Missing required prompt field
- Empty prompt values
- Deprecated format usage (spec.model instead of spec.modelRef)
- Invalid tool type specification
- Invalid built-in tool names
- Tool name and labelSelector conflicts (mutually exclusive)
- Built-in tools with labelSelector (not allowed)
- Custom tools missing both name and labelSelector
- Built-in tools missing required name

### Query Validation
- Missing required input field
- Empty input values
- Invalid/unsupported target types
- Missing both targets and selector

### Team Validation
- Missing required members field
- Invalid/unsupported strategy values
- Deprecated format usage (spec.targets instead of spec.members)
- Team self-reference (circular dependency)
- Invalid member types (only agent/team allowed)

### Tool Validation
- Missing required type field
- Missing required inputSchema field
- Invalid JSON schema types
- Malformed JSON schema syntax
- Fetcher tools missing required URL
- Fetcher tools with invalid URL format
- Fetcher tools with invalid HTTP methods
- MCP tools missing server reference
- MCP tools missing tool name

### MCPServer Validation
- Missing required address field
- Invalid header configurations
- Invalid secret references

### ExecutionEngine Validation
- Missing required address field

## Running
```bash
chainsaw test
```

Validates that the admission controller properly rejects all invalid resource configurations with appropriate error messages.