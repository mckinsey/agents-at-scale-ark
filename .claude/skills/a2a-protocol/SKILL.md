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

> **IMPORTANT — Use v0.3 by default.** The primary references in
> `references/v0.3/` are **v0.3.0**, the version currently supported by the
> official [Go](https://github.com/a2aproject/a2a-go) and
> [Python](https://github.com/a2aproject/a2a-python) SDKs and most
> implementations. The v1.0 RC spec is in `references/v1.0-rc/` and should
> only be consulted when explicitly working on v1.0 features or migration
> planning.

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

**Agent discovery:** Clients find agents via `/.well-known/agent.json`

## Specification reference (v0.3)

The primary A2A specification (v0.3.0) is split into sections in `references/v0.3/`:

| File | Contents |
|------|----------|
| [spec-01-introduction.md](./references/v0.3/spec-01-introduction.md) | Goals, principles, design |
| [spec-02-core-concepts.md](./references/v0.3/spec-02-core-concepts.md) | Core concepts summary |
| [spec-03-transport.md](./references/v0.3/spec-03-transport.md) | Transport layer: JSON-RPC 2.0 over HTTP, SSE streaming |
| [spec-04-authentication.md](./references/v0.3/spec-04-authentication.md) | Authentication and authorization |
| [spec-05-agent-card.md](./references/v0.3/spec-05-agent-card.md) | Agent Card structure, discovery, extended cards |
| [spec-06-data-objects.md](./references/v0.3/spec-06-data-objects.md) | Task, Message, Part, Artifact, TaskStatus, streaming events |
| [spec-07-rpc-methods.md](./references/v0.3/spec-07-rpc-methods.md) | All JSON-RPC methods (send, stream, get, cancel, push, resubscribe) |
| [spec-08-error-handling.md](./references/v0.3/spec-08-error-handling.md) | Error codes and handling |
| [spec-09-workflows.md](./references/v0.3/spec-09-workflows.md) | Common workflows and examples |
| [spec-10-appendices.md](./references/v0.3/spec-10-appendices.md) | Appendices |
| [spec-11-compliance.md](./references/v0.3/spec-11-compliance.md) | A2A compliance requirements |

## Topic guides (v0.3)

Conceptual guides from the A2A documentation:

| File | Contents |
|------|----------|
| [topic-what-is-a2a.md](./references/v0.3/topic-what-is-a2a.md) | Overview of A2A purpose and benefits |
| [topic-key-concepts.md](./references/v0.3/topic-key-concepts.md) | Core concepts: actors, elements, interactions |
| [topic-agent-discovery.md](./references/v0.3/topic-agent-discovery.md) | Agent Card discovery mechanisms |
| [topic-life-of-a-task.md](./references/v0.3/topic-life-of-a-task.md) | Task lifecycle and state transitions |
| [topic-streaming-and-async.md](./references/v0.3/topic-streaming-and-async.md) | SSE streaming and async patterns |
| [topic-extensions.md](./references/v0.3/topic-extensions.md) | A2A extension mechanism |
| [topic-enterprise-ready.md](./references/v0.3/topic-enterprise-ready.md) | Enterprise features: auth, security, tracing |
| [topic-a2a-and-mcp.md](./references/v0.3/topic-a2a-and-mcp.md) | A2A vs MCP comparison |

## Key JSON-RPC methods (v0.3)

| Method | Description |
|--------|-------------|
| `message/send` | Send a message, get a response (or initiate a task) |
| `message/stream` | Send a message and stream response via SSE |
| `tasks/get` | Get current state of a task |
| `tasks/cancel` | Cancel a running task |
| `tasks/resubscribe` | Re-subscribe to a task's SSE stream |
| `tasks/pushNotificationConfig/set` | Configure push notification webhook |
| `tasks/pushNotificationConfig/get` | Get push notification config |
| `tasks/pushNotificationConfig/list` | List push notification configs |
| `tasks/pushNotificationConfig/delete` | Delete push notification config |
| `agent/getAuthenticatedExtendedCard` | Get extended Agent Card (authenticated) |

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

Discovered at: `https://myagent.example.com/.well-known/agent.json`

## Quick lookup guide

- **"How do I discover agents?"** → [topic-agent-discovery.md](./references/v0.3/topic-agent-discovery.md), [spec-05-agent-card.md](./references/v0.3/spec-05-agent-card.md)
- **"What are the task states?"** → [topic-life-of-a-task.md](./references/v0.3/topic-life-of-a-task.md), [spec-06-data-objects.md](./references/v0.3/spec-06-data-objects.md)
- **"How does streaming work?"** → [topic-streaming-and-async.md](./references/v0.3/topic-streaming-and-async.md), [spec-07-rpc-methods.md](./references/v0.3/spec-07-rpc-methods.md)
- **"What's the difference between A2A and MCP?"** → [topic-a2a-and-mcp.md](./references/v0.3/topic-a2a-and-mcp.md)
- **"How do extensions work?"** → [topic-extensions.md](./references/v0.3/topic-extensions.md)
- **"What security/auth is needed?"** → [spec-04-authentication.md](./references/v0.3/spec-04-authentication.md), [topic-enterprise-ready.md](./references/v0.3/topic-enterprise-ready.md)
- **"What are the error codes?"** → [spec-08-error-handling.md](./references/v0.3/spec-08-error-handling.md)
- **"Show me workflow examples"** → [spec-09-workflows.md](./references/v0.3/spec-09-workflows.md)

## v1.0 RC reference (use only when needed)

The v1.0 Release Candidate spec is available in `references/v1.0-rc/` for
forward-looking work. Key differences from v0.3 are documented in
[v1.0-rc/topic-whats-new-v1.md](./references/v1.0-rc/topic-whats-new-v1.md).

Only consult v1.0 content when:
- Explicitly planning migration from v0.3 to v1.0
- Working on features that require v1.0-specific capabilities
- The user specifically asks about v1.0
