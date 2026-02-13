# Agent-as-Tool Patterns

This directory demonstrates how to use agents as tools, enabling coordinator agents to delegate tasks to specialist agents.

## Overview

The **agent-as-tool** pattern allows agents to call other agents as if they were tools. This enables:

- **Modular agent design**: Break complex tasks into specialized agents
- **Hierarchical coordination**: Coordinators delegate to specialists
- **Code reuse**: Share specialist agents across multiple coordinators

## Patterns

### Pattern 1: Legacy String Input

The original, simpler pattern using a string `input` parameter.

**When to use**:
- Quick prototyping
- Simple delegation without context
- Backward compatibility with existing agents

**Example Tool**:
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: call-research-agent
spec:
  type: agent
  description: "Delegate research tasks"
  inputSchema:
    type: object
    properties:
      input:
        type: string
        description: "The research task to delegate"
    required: ["input"]
  agent:
    name: research-agent
```

**Invocation from coordinator prompt**:
```
call-research-agent(input="Research the history of quantum computing")
```

### Pattern 2: A2A-Native Message (Recommended)

Enhanced pattern using the A2A message format for richer communication.

**When to use**:
- Passing conversation history to specialists
- Multi-turn stateful conversations (via contextId)
- Complex multi-part messages (text, files, data)
- Production workloads requiring full context

**Requirements**:

Both the Tool and target Agent must have the A2A annotation:
```yaml
annotations:
  ark.mckinsey.com/a2a-experimental-enabled: "true"
```

**Example Tool**:
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: call-research-agent-a2a
  annotations:
    ark.mckinsey.com/a2a-experimental-enabled: "true"
spec:
  type: agent
  description: "Delegate research tasks with A2A message support"
  inputSchema:
    type: object
    properties:
      message:
        type: object
        description: "A2A message with parts array"
        properties:
          role:
            type: string
            enum: ["user"]
            default: "user"
          parts:
            type: array
            description: "Message content parts (text, file, or data)"
            items:
              type: object
              properties:
                kind:
                  type: string
                  enum: ["text", "file", "data"]
                text:
                  type: string
                  description: "Text content (when kind='text')"
      history:
        type: array
        description: "Previous messages for conversation context"
      contextId:
        type: string
        description: "Context ID for stateful multi-turn conversations"
      input:
        type: string
        description: "Simple text input (fallback - prefer 'message')"
  agent:
    name: research-agent-a2a
```

**Invocation examples from coordinator prompt**:

1. Simple string (fallback):
   ```
   call-research-agent-a2a(input="Research quantum computing")
   ```

2. A2A message:
   ```
   call-research-agent-a2a(message={
     "role": "user",
     "parts": [{"kind": "text", "text": "Research quantum computing"}]
   })
   ```

3. With conversation history:
   ```
   call-research-agent-a2a(
     message={"role": "user", "parts": [{"kind": "text", "text": "Tell me more about qubits"}]},
     history=[
       {"role": "user", "parts": [{"kind": "text", "text": "What is quantum computing?"}]},
       {"role": "assistant", "parts": [{"kind": "text", "text": "Quantum computing uses qubits..."}]}
     ]
   )
   ```

4. With context ID:
   ```
   call-research-agent-a2a(
     message={"role": "user", "parts": [{"kind": "text", "text": "question"}]},
     contextId="session-123"
   )
   ```

## Files in This Directory

| File | Description |
|------|-------------|
| `coordinator-example.yaml` | Complete example showing both patterns |

## Quick Start

1. **Deploy the example**:
   ```bash
   kubectl apply -f samples/a2a-experimental/agent-as-tool/coordinator-example.yaml
   ```

2. **Test legacy pattern**:
   ```yaml
   apiVersion: ark.mckinsey.com/v1alpha1
   kind: Query
   metadata:
     name: test-coordinator
   spec:
     input: "Research the latest AI trends and provide analysis"
     target:
       type: agent
       name: coordinator-agent
   ```

3. **Test A2A-native pattern**:
   ```yaml
   apiVersion: ark.mckinsey.com/v1alpha1
   kind: Query
   metadata:
     name: test-coordinator-a2a
     annotations:
       ark.mckinsey.com/a2a-experimental-enabled: "true"
   spec:
     input: "Research the latest AI trends and provide analysis"
     target:
       type: agent
       name: coordinator-agent-a2a
   ```

## Schema Reference

The A2A inputSchema exposes:

| Property | Type | Description |
|----------|------|-------------|
| `message` | object | A2A message with role and parts array |
| `message.role` | string | Always "user" for delegation |
| `message.parts` | array | Content parts (text, file, data) |
| `history` | array | Previous messages for conversation context |
| `contextId` | string | Context ID for stateful conversations |
| `input` | string | Simple text fallback |

## Documentation

- [A2A Native Execution RFC](../../../docs/content/reference/a2a-native-execution.mdx) - Full technical specification
- [ARK Reference Documentation](../../../docs/content/reference/) - System reference docs
