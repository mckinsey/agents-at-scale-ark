---
name: a2a-protocol
description: >-
  Reference documentation for the Agent2Agent (A2A) protocol. Use when building
  A2A servers or clients, configuring Ark A2AServer resources, debugging A2A
  communication, or answering questions about the A2A specification, Agent Cards,
  task lifecycle, streaming, extensions, or protocol bindings.
allowed-tools: Read, Grep
---

# A2A Protocol Reference

Reference skill for the [Agent2Agent (A2A) Protocol](https://a2a-protocol.org),
an open standard by Google / the A2A Project (Linux Foundation) for
communication between independent AI agent systems.

> **Attribution:** All specification and topic content in `references/` is
> sourced from the [official A2A repository](https://github.com/google-a2a/A2A)
> under the Apache-2.0 license. Each file includes source attribution in its
> YAML frontmatter.

## When to use this skill

- Building or debugging an A2A server or client
- Configuring Ark `A2AServer` custom resources
- Understanding Agent Cards, task lifecycle, or message formats
- Implementing streaming (SSE) or push notifications
- Working with A2A extensions
- Comparing A2A with MCP

## Protocol overview

A2A enables agents built on different frameworks to discover capabilities,
negotiate interaction modes, manage collaborative tasks, and exchange
information — without exposing internal state, memory, or tools.

**Core actors:**

- **User** — human or automated service initiating a request
- **A2A Client** — application or agent acting on behalf of the user
- **A2A Server** — agent exposing an HTTP endpoint implementing A2A

**Core elements:**

| Element    | Purpose                                                    |
|------------|------------------------------------------------------------|
| Agent Card | JSON metadata: identity, capabilities, endpoint, auth      |
| Task       | Stateful unit of work with unique ID and lifecycle         |
| Message    | Single communication turn (role: "user" or "agent")        |
| Part       | Content container: text, file reference, or structured data |
| Artifact   | Tangible output generated during a task                    |

**Interaction patterns:**

- **Request/Response** — synchronous with polling for long-running tasks
- **Streaming (SSE)** — real-time incremental updates over open connection
- **Push Notifications** — async webhooks for disconnected/long-running tasks

**Task lifecycle:** `submitted` → `working` → `input-required` → `completed` / `failed` / `canceled`

**Agent discovery:** Clients find agents via `/.well-known/agent-card.json`

## Specification reference

The full A2A specification (RC v1.0) is split into sections in `references/`:

| File | Contents |
|------|----------|
| [spec-01-introduction.md](./references/spec-01-introduction.md) | Goals, principles, spec structure |
| [spec-02-terminology.md](./references/spec-02-terminology.md) | Requirements language, core concepts |
| [spec-03-operations.md](./references/spec-03-operations.md) | All protocol operations (Send, Stream, Get, List, Cancel, Subscribe, Push Notifications, Extended Agent Card) |
| [spec-04-data-model.md](./references/spec-04-data-model.md) | Task, Message, Part, Artifact, streaming events, push notification objects |
| [spec-05-binding-requirements.md](./references/spec-05-binding-requirements.md) | Protocol binding requirements and interoperability |
| [spec-06-workflows.md](./references/spec-06-workflows.md) | Common workflows and examples |
| [spec-07-authentication.md](./references/spec-07-authentication.md) | Authentication and authorization |
| [spec-08-agent-card.md](./references/spec-08-agent-card.md) | Agent Card structure, discovery, extended cards |
| [spec-09-jsonrpc-binding.md](./references/spec-09-jsonrpc-binding.md) | JSON-RPC 2.0 protocol binding |
| [spec-10-grpc-binding.md](./references/spec-10-grpc-binding.md) | gRPC protocol binding |
| [spec-11-http-rest-binding.md](./references/spec-11-http-rest-binding.md) | HTTP+JSON/REST protocol binding |
| [spec-12-custom-binding.md](./references/spec-12-custom-binding.md) | Guidelines for custom bindings |
| [spec-13-security.md](./references/spec-13-security.md) | Security considerations |
| [spec-14-iana.md](./references/spec-14-iana.md) | Media type, header, and well-known URI registrations |
| [spec-appendix-a-migration.md](./references/spec-appendix-a-migration.md) | Migration from earlier versions |
| [spec-appendix-b-mcp.md](./references/spec-appendix-b-mcp.md) | Relationship to MCP |

## Topic guides

Conceptual guides from the A2A documentation:

| File | Contents |
|------|----------|
| [topic-what-is-a2a.md](./references/topic-what-is-a2a.md) | Overview of A2A purpose and benefits |
| [topic-key-concepts.md](./references/topic-key-concepts.md) | Core concepts: actors, elements, interactions |
| [topic-agent-discovery.md](./references/topic-agent-discovery.md) | Agent Card discovery mechanisms |
| [topic-life-of-a-task.md](./references/topic-life-of-a-task.md) | Task lifecycle and state transitions |
| [topic-streaming-and-async.md](./references/topic-streaming-and-async.md) | SSE streaming and async patterns |
| [topic-extensions.md](./references/topic-extensions.md) | A2A extension mechanism |
| [topic-enterprise-ready.md](./references/topic-enterprise-ready.md) | Enterprise features: auth, security, tracing |
| [topic-a2a-and-mcp.md](./references/topic-a2a-and-mcp.md) | A2A vs MCP comparison |
| [topic-definitions.md](./references/topic-definitions.md) | Glossary of terms |
| [topic-whats-new-v1.md](./references/topic-whats-new-v1.md) | Changes in v1.0 |

## Key JSON-RPC methods

| Method | Description |
|--------|-------------|
| `message/send` | Send a message and get a response |
| `message/stream` | Send a message and stream response via SSE |
| `tasks/get` | Get current state of a task |
| `tasks/list` | List tasks, optionally filtered by context |
| `tasks/cancel` | Cancel a running task |
| `tasks/resubscribe` | Re-subscribe to a task's SSE stream |
| `tasks/pushNotificationConfig/set` | Configure push notification webhook |
| `tasks/pushNotificationConfig/get` | Get push notification config |
| `tasks/pushNotificationConfig/list` | List push notification configs |
| `tasks/pushNotificationConfig/delete` | Delete push notification config |

## Agent Card example

```json
{
  "name": "My Agent",
  "description": "An agent that does useful things",
  "url": "https://myagent.example.com/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "skills": [
    {
      "id": "summarize",
      "name": "Summarize Text",
      "description": "Summarizes long text into key points"
    }
  ],
  "securitySchemes": {
    "bearer": {
      "type": "http",
      "scheme": "bearer"
    }
  },
  "security": [{ "bearer": [] }]
}
```

Discovered at: `https://myagent.example.com/.well-known/agent-card.json`

## Quick lookup guide

- **"How do I discover agents?"** → [topic-agent-discovery.md](./references/topic-agent-discovery.md), [spec-08-agent-card.md](./references/spec-08-agent-card.md)
- **"What are the task states?"** → [topic-life-of-a-task.md](./references/topic-life-of-a-task.md), [spec-04-data-model.md](./references/spec-04-data-model.md)
- **"How does streaming work?"** → [topic-streaming-and-async.md](./references/topic-streaming-and-async.md), [spec-03-operations.md](./references/spec-03-operations.md)
- **"What's the difference between A2A and MCP?"** → [topic-a2a-and-mcp.md](./references/topic-a2a-and-mcp.md), [spec-appendix-b-mcp.md](./references/spec-appendix-b-mcp.md)
- **"How do extensions work?"** → [topic-extensions.md](./references/topic-extensions.md)
- **"What security/auth is needed?"** → [spec-07-authentication.md](./references/spec-07-authentication.md), [spec-13-security.md](./references/spec-13-security.md), [topic-enterprise-ready.md](./references/topic-enterprise-ready.md)
- **"How do I implement an A2A server?"** → [spec-09-jsonrpc-binding.md](./references/spec-09-jsonrpc-binding.md) (JSON-RPC), [spec-11-http-rest-binding.md](./references/spec-11-http-rest-binding.md) (REST)
- **"What changed in v1.0?"** → [topic-whats-new-v1.md](./references/topic-whats-new-v1.md), [spec-appendix-a-migration.md](./references/spec-appendix-a-migration.md)
