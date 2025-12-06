# A2A Streaming Task Updates

Enable real-time streaming for A2A tasks. The A2ATask controller manages A2A connections and pushes events to ark-cluster-memory on two topics for consumers.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                     ARK CLUSTER                                           │
│                                                                                           │
│  ┌─────────────────┐          ┌─────────────────────────────────────────────────────┐    │
│  │ Query Controller│          │               A2ATask Controller                     │    │
│  │    (simple)     │          │                  (main worker)                       │    │
│  │                 │          │                                                      │    │
│  │  • Creates      │          │  • Connects to A2A Server (SSE or polling)           │    │
│  │    A2ATask      │─────────▶│  • Receives task update events                       │    │
│  │  • Waits for    │          │  • Updates A2ATask status                            │    │
│  │    completion   │◀─────────│  • Updates Query status                              │    │
│  │                 │          │                                                      │    │
│  └─────────────────┘          └───────┬───────────────────────────────┬─────────────┘    │
│                                       │                               │                  │
│                                       │ SSE or Polling                │                  │
│                                       ▼                               │                  │
│                    ┌──────────────────────────────────────┐           │                  │
│                    │           A2A Server                 │           │                  │
│                    │          (External)                  │           │                  │
│                    └──────────────────────────────────────┘           │                  │
│                                                                       │                  │
│                                                                       │ pushes events    │
│                                                                       ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           ark-cluster-memory                                      │   │
│  │                                                                                   │   │
│  │   ┌────────────────────────────┐      ┌────────────────────────────┐             │   │
│  │   │     a2a-task-updates       │      │        llm-chunks          │             │   │
│  │   │     (raw A2A events)       │      │    (OpenAI format)         │             │   │
│  │   │                            │      │                            │             │   │
│  │   │  • TaskStatusUpdateEvent   │      │  • chat.completion.chunk   │             │   │
│  │   │  • TaskArtifactUpdateEvent │      │  • delta.content           │             │   │
│  │   │  • Full protocol fidelity  │      │  • Compatible with OpenAI  │             │   │
│  │   └────────────────────────────┘      └────────────────────────────┘             │   │
│  │                 │                                   │                             │   │
│  └─────────────────┼───────────────────────────────────┼─────────────────────────────┘   │
│                    │                                   │                                 │
└────────────────────┼───────────────────────────────────┼─────────────────────────────────┘
                     │                                   │
                     ▼                                   ▼
          ┌──────────────────┐                ┌──────────────────┐
          │  A2A Consumers   │                │ OpenAI Consumers │
          │  (raw events)    │                │  (llm-chunks)    │
          └──────────────────┘                └──────────────────┘
```

## Event Flow Example

Query: `"Find customer details for customer 12345"`

```
TIME   EVENT FROM A2A SERVER          A2ATask STATUS              QUERY STATUS              ARK-CLUSTER-MEMORY
────   ──────────────────────         ──────────────              ────────────              ──────────────────

t0     Task                            phase: running              phase: running
       state: submitted               protocolState: submitted    responses[0]:
       history:                       history:                      content: ""
         [{role: user,                  [{role: user,               phase: running
           parts: [{text:                 parts: [{text:
             "Find customer               "Find customer
              details..."}]}]              details..."}]}]
                                                                                            → a2a-task-updates: {state: "submitted", history: [...]}
                                                                                            → llm-chunks: {delta: {content: ""}}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

t1     TaskStatusUpdateEvent          phase: running              phase: running
       state: working                 protocolState: working      responses[0]:
       message:                       history:                      content: "Searching
         role: agent                    [{role: agent,                the database..."
         parts:                          parts: [{text:             phase: working
           [{text: "Searching             "Searching the
             the database..."}]           database..."}]}]
                                                                                            → a2a-task-updates: {state: "working", message: {...}}
                                                                                            → llm-chunks: {delta: {content: "Searching the database..."}}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

t2     TaskArtifactUpdateEvent        phase: running              phase: running
       artifact:                      protocolState: working      responses[0]:
         artifactId: "cust-001"       artifacts:                    content: "Searching
         name: "customer_record"        [{artifactId: "cust-001",      the database...
         parts:                           name: "customer_record",
           [{kind: "data",                parts: [...]}]             Customer Record:
             mimeType: "json",                                        Name: Acme Corp
             data: {                                                  ID: 12345
               name: "Acme Corp",                                     Email: contact@..."
               id: "12345",                                         phase: working
               email: "contact@..."
             }}]
                                                                                            → a2a-task-updates: {artifact: {artifactId: "cust-001", ...}}
                                                                                            → llm-chunks: {delta: {content: "\n\nCustomer Record:\nName: Acme Corp..."}}

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

t3     TaskStatusUpdateEvent          phase: completed            phase: done
       state: completed               protocolState: completed    responses[0]:
       message:                       history:                      content: "Searching
         role: agent                    [...,                          the database...
         parts:                          {role: agent,
           [{text: "Customer              parts: [{text:              Customer Record:
             details have been             "Customer details           Name: Acme Corp
             successfully                  have been                   ID: 12345
             loaded"}]                     successfully                Email: contact@...
       final: true                         loaded"}]}]
                                                                      Customer details
                                                                      have been
                                                                      successfully loaded"
                                                                    phase: done
                                                                                            → a2a-task-updates: {state: "completed", final: true}
                                                                                            → llm-chunks: {delta: {}, finish_reason: "stop"}
```

## Topic Formats

### a2a-task-updates (raw A2A events)

```json
{
  "queryId": "query-xyz",
  "taskId": "task-abc123",
  "type": "TaskStatusUpdateEvent",
  "state": "working",
  "message": {
    "role": "agent",
    "parts": [{"kind": "text", "text": "Searching the database..."}]
  },
  "final": false,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

```json
{
  "queryId": "query-xyz",
  "taskId": "task-abc123",
  "type": "TaskArtifactUpdateEvent",
  "artifact": {
    "artifactId": "cust-001",
    "name": "customer_record",
    "parts": [{
      "kind": "data",
      "mimeType": "application/json",
      "data": {"name": "Acme Corp", "id": "12345"}
    }]
  },
  "timestamp": "2025-01-15T10:30:05Z"
}
```

### llm-chunks (OpenAI-compatible format)

```json
{
  "id": "chunk-1",
  "object": "chat.completion.chunk",
  "choices": [{
    "index": 0,
    "delta": {"content": "Searching the database..."},
    "finish_reason": null
  }],
  "ark": {
    "queryId": "query-xyz",
    "taskId": "task-abc123",
    "agent": "customer-lookup"
  }
}
```

## Consumer Choice

| Topic | Use Case |
|-------|----------|
| `a2a-task-updates` | Full A2A protocol fidelity - artifacts, structured data, task state transitions |
| `llm-chunks` | OpenAI compatibility - works with existing streaming clients, simpler integration |

## Related

- Issue: https://github.com/mckinsey/agents-at-scale-ark/issues/530
- A2ATask CRD: `ark/api/v1alpha1/a2atask_types.go`
- Query CRD: `ark/api/v1alpha1/query_types.go`
