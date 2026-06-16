---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 10. Appendices

### 10.1. Relationship to MCP (Model Context Protocol)

A2A and MCP are complementary protocols designed for different aspects of agentic systems:

- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/):** Focuses on standardizing how AI models and agents connect to and interact with **tools, APIs, data sources, and other external resources.** It defines structured ways to describe tool capabilities (like function calling in LLMs), pass inputs, and receive structured outputs. Think of MCP as the "how-to" for an agent to _use_ a specific capability or access a resource.
- **Agent2Agent Protocol (A2A):** Focuses on standardizing how independent, often opaque, **AI agents communicate and collaborate with each other as peers.** A2A provides an application-level protocol for agents to discover each other, negotiate interaction modalities, manage shared tasks, and exchange conversational context or complex results. It's about how agents _partner_ or _delegate_ work.

**How they work together:**
An A2A Client agent might request an A2A Server agent to perform a complex task. The Server agent, in turn, might use MCP to interact with several underlying tools, APIs, or data sources to gather information or perform actions necessary to fulfill the A2A task.

For a more detailed comparison, see the [A2A and MCP guide](./topics/a2a-and-mcp.md).

### 10.2. Security Considerations Summary

Security is a paramount concern in A2A. Key considerations include:

- **Transport Security:** Always use HTTPS with strong TLS configurations in production environments.
- **Authentication:**
    - Handled via standard HTTP mechanisms (e.g., `Authorization` header with Bearer tokens, API keys).
    - Requirements are declared in the `AgentCard`.
    - Credentials MUST be obtained out-of-band by the client.
    - A2A Servers MUST authenticate every request.
- **Authorization:**
    - A server-side responsibility based on the authenticated identity.
    - Implement the principle of least privilege.
    - Can be granular, based on skills, actions, or data.
- **Push Notification Security:**
    - Webhook URL validation (by the A2A Server sending notifications) is crucial to prevent SSRF.
    - Authentication of the A2A Server to the client's webhook is essential.
    - Authentication of the notification by the client's webhook receiver (verifying it came from the legitimate A2A Server and is relevant) is critical.
    - See the [Streaming & Asynchronous Operations guide](./topics/streaming-and-async.md#security-considerations-for-push-notifications) for detailed push notification security.
- **Input Validation:** Servers MUST rigorously validate all RPC parameters and the content/structure of data in `Message` and `Artifact` parts to prevent injection attacks or processing errors.
- **Resource Management:** Implement rate limiting, concurrency controls, and resource limits to protect agents from abuse or overload.
- **Data Privacy:** Adhere to all applicable privacy regulations for data exchanged in `Message` and `Artifact` parts. Minimize sensitive data transfer.

For a comprehensive discussion, refer to the [Enterprise-Ready Features guide](./topics/enterprise-ready.md).
