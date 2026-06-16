---
source: "Agent2Agent (A2A) Protocol Specification v0.3.0"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/v0.3.0/docs/specification.md"
project_url: "https://a2a-protocol.org/v0.3.0/specification"
license: "Apache-2.0"
---

## 1. Introduction

The Agent2Agent (A2A) Protocol is an open standard designed to facilitate communication and interoperability between independent, potentially opaque AI agent systems. In an ecosystem where agents might be built using different frameworks, languages, or by different vendors, A2A provides a common language and interaction model.

This document provides the detailed technical specification for the A2A protocol. Its primary goal is to enable agents to:

- Discover each other's capabilities.
- Negotiate interaction modalities (text, files, structured data).
- Manage collaborative tasks.
- Securely exchange information to achieve user goals **without needing access to each other's internal state, memory, or tools.**

### 1.1. Key Goals of A2A

- **Interoperability:** Bridge the communication gap between disparate agentic systems.
- **Collaboration:** Enable agents to delegate tasks, exchange context, and work together on complex user requests.
- **Discovery:** Allow agents to dynamically find and understand the capabilities of other agents.
- **Flexibility:** Support various interaction modes including synchronous request/response, streaming for real-time updates, and asynchronous push notifications for long-running tasks.
- **Security:** Facilitate secure communication patterns suitable for enterprise environments, relying on standard web security practices.
- **Asynchronicity:** Natively support long-running tasks and interactions that may involve human-in-the-loop scenarios.

### 1.2. Guiding Principles

- **Simple:** Reuse existing, well-understood standards (HTTP, JSON-RPC 2.0, Server-Sent Events).
- **Enterprise Ready:** Address authentication, authorization, security, privacy, tracing, and monitoring by aligning with established enterprise practices.
- **Async First:** Designed for (potentially very) long-running tasks and human-in-the-loop interactions.
- **Modality Agnostic:** Support exchange of diverse content types including text, audio/video (via file references), structured data/forms, and potentially embedded UI components (e.g., iframes referenced in parts).
- **Opaque Execution:** Agents collaborate based on declared capabilities and exchanged information, without needing to share their internal thoughts, plans, or tool implementations.

For a broader understanding of A2A's purpose and benefits, see [What is A2A?](./topics/what-is-a2a.md).
