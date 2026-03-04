# AI/ML Platform Storage Research

Research on how major AI/ML platforms handle storage for agent state, conversations, and metadata.

## Executive Summary

| Platform | Primary Storage | Vector DB | Watch/Subscribe | Scalability | Standalone/Clustered |
|----------|-----------------|-----------|-----------------|-------------|---------------------|
| LangGraph | PostgreSQL, Redis | Built-in stores | No native watch | Horizontal via LangGraph Cloud | Both |
| CrewAI | ChromaDB, SQLite | ChromaDB (default) | No | Enterprise via CrewAI AMP | Both |
| AutoGen | Pluggable (Redis, Cosmos DB) | External integration | Event-driven messaging | Kubernetes, actor model | Both |
| Dify | PostgreSQL | Multiple (Weaviate, Qdrant, Milvus, TiDB) | Webhook/Plugin triggers | Kubernetes, Celery workers | Both |
| Flowise | SQLite, PostgreSQL, MySQL, MariaDB | External (via nodes) | No native watch | Queue-based multi-container | Both |

---

## 1. LangChain / LangGraph

### Storage Backends

**Checkpointer System** - LangGraph uses "checkpointers" for state persistence:

- **InMemoryStore** - Development only, no persistence
- **PostgresSaver** - Production-recommended, strong durability, queryable history
- **RedisSaver** - High-speed production, distributed, sub-millisecond retrieval
- **SQLiteSaver** - Local development, single-file storage

**Long-Term Memory**:
- `PostgresStore` for production persistent memory
- `InMemoryStore` for development iteration
- Supports assistant_id-based namespacing for multi-tenant apps
- Deep agents can use CompositeBackend for hybrid storage (transient + persistent paths)

### Conversation History

- Checkpointers save graph state at each step
- Automatic session memory storing user interaction history
- Thread-based conversation isolation
- Support for conversation resumption from any checkpoint

### Watch/Subscription Capabilities

- **No native watch mechanism** for storage changes
- State changes propagate through graph execution
- LangGraph Cloud provides monitoring/observability but not real-time subscriptions

### Scalability

**LangGraph Cloud**:
- Horizontally-scaling servers and task queues
- Built-in persistence with robust Postgres checkpointer
- Handles many concurrent users
- Intelligent caching and automated retries

**Self-Hosted Production Pattern**:
```
Redis (queue + cache) + PostgreSQL (checkpoint persistence)
```

**Redis 0.1.0 Optimizations**:
- Network round trips reduced from O(n) to O(3)
- Designed for agent swarms with hundreds of parallel tasks
- Sub-millisecond checkpoint retrieval

### Standalone vs Clustered

- **Standalone**: SQLite or in-memory checkpointers
- **Clustered**: PostgreSQL + Redis for stateless horizontal scaling

### Key Insights

1. Checkpointer abstraction allows swapping storage backends without code changes
2. Redis integration optimized specifically for AI agent patterns (many small checkpoints)
3. No built-in watch - applications poll or use graph execution events
4. Clear separation: Redis for speed/queues, PostgreSQL for durability

**Sources**:
- [LangChain Long-term Memory Docs](https://docs.langchain.com/oss/python/deepagents/long-term-memory)
- [LangGraph Persistence](https://langchain-ai.github.io/langgraphjs/how-tos/persistence/)
- [LangGraph Redis Checkpoint](https://redis.io/blog/langgraph-redis-checkpoint-010/)
- [LangGraph v0.2 Blog](https://www.blog.langchain.com/langgraph-v0-2/)

---

## 2. CrewAI

### Storage Backends

**Memory Types with Default Backends**:

| Memory Type | Backend | Purpose |
|------------|---------|---------|
| Short-Term Memory (STM) | ChromaDB | Current context, RAG-based retrieval |
| Long-Term Memory (LTM) | SQLite3 | Task results across sessions |
| Entity Memory | ChromaDB (RAG) | Tracking people, places, concepts |
| External Memory | Configurable | Custom integrations |

**Default Storage**:
- ChromaDB stores data in `chroma.sqlite3`
- Platform-specific paths via `appdirs` (e.g., `~/.local/share/CrewAI/`)
- Configurable via `CREWAI_STORAGE_DIR` environment variable

**Custom Storage Options**:
- `LTMSQLiteStorage` for long-term data
- `RAGStorage` with Chroma or Pinecone backends
- Couchbase integration for enterprise features

### Embeddings

- OpenAI embeddings by default
- Configurable embedder per crew
- Embedder configuration passed to ShortTermMemory and EntityMemory

### Conversation History

- Managed through memory systems
- Short-term memory provides current conversation context
- Long-term memory persists task outcomes
- Entity memory tracks entities mentioned across conversations

### Watch/Subscription Capabilities

- **No native watch mechanism**
- Memory accessed synchronously during agent execution
- No real-time subscription to memory changes

### Scalability

**Open Source Limitations**:
- ChromaDB lock files prevent concurrent writes
- Need separate storage backends for parallel crew execution
- All memory stored locally by default

**CrewAI AMP (Enterprise)**:
- Automatic serverless scaling
- On-prem or cloud (AWS, Azure, GCP)
- Centralized management, monitoring, security
- 10M+ agents executed in 30 days

**CrewAI Flows**:
- Event-driven orchestration
- Fine-grained state management
- Deterministic execution paths for enterprise auditability

### Standalone vs Clustered

- **Standalone**: ChromaDB + SQLite (default, single process)
- **Clustered**: Requires CrewAI AMP or custom infrastructure with shared storage

### Key Insights

1. Simple defaults (ChromaDB + SQLite) make getting started easy
2. Memory is tied to agent execution, not independently observable
3. Enterprise scale requires AMP platform
4. Concurrent execution needs careful planning (lock files)
5. NVIDIA integration signals enterprise trajectory

**Sources**:
- [CrewAI Memory Docs](https://docs.crewai.com/en/concepts/memory)
- [CrewAI Memory Configuration (DeepWiki)](https://deepwiki.com/crewAIInc/crewAI/7.2-memory-configuration-and-storage)
- [CrewAI Enterprise](https://www.crewai.com/)
- [CrewAI GitHub](https://github.com/crewAIInc/crewAI)

---

## 3. Microsoft AutoGen

### Storage Backends

**Core Storage Model**:
- In-memory conversation history by default
- Pluggable `ChatMessageStore` for custom backends
- `AgentThread` manages conversation state

**Microsoft Agent Framework (MAF) Evolution**:
- Redis for fast state access
- Cosmos DB for distributed persistence
- Graph-based workflow orchestration with checkpointing

**Serialization**:
- Conversations can be serialized/deserialized
- Resume chat from saved state
- Persistent multi-session agents

### Conversation History

**Default Behavior**:
- `AssistantAgent` maintains in-memory history
- `AgentThread` enables conversation continuation
- Thread reuse maintains context across interactions

**Shared Memory**:
- Memory module for storing/retrieving conversation history
- Shareable across agents for context continuity
- Supports short-term, long-term, and episodic memory

**Custom Storage**:
- Subclass `ChatMessageStore` for third-party storage
- Services without in-service storage use Agent Framework storage

### Watch/Subscription Capabilities

**Event-Driven Architecture (v0.4+)**:
- Asynchronous messaging between agents
- Event-driven and request/response patterns
- Actor model for distributed systems

**No Storage Watch**:
- Events are agent-to-agent communication
- No direct storage subscription mechanism
- State changes observed through agent interactions

### Scalability

**AutoGen 0.4 Architecture**:
- Actor model for distributed, scalable systems
- Asynchronous, event-driven design
- Cross-language support (.NET and Python)
- Distributed agent networks across organizational boundaries

**Production Patterns**:
- Kubernetes container orchestration
- Load-balancing algorithms for multi-agent
- Horizontal scaling with cluster management

**Microsoft Agent Framework Features**:
- Checkpointing for long-running processes (pause/resume)
- Human-in-the-loop approval workflows
- Declarative agent definitions (YAML/JSON)

### Standalone vs Clustered

- **Standalone**: In-memory or local file serialization
- **Clustered**: Redis + Cosmos DB via Microsoft Agent Framework, Kubernetes orchestration

### Key Insights

1. Most flexible but least opinionated on storage
2. Event-driven architecture enables distributed agents
3. Microsoft Agent Framework merges AutoGen + Semantic Kernel for production
4. Checkpointing is available but requires explicit implementation
5. Actor model well-suited for complex multi-agent coordination

**Sources**:
- [AutoGen GitHub](https://github.com/microsoft/autogen)
- [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/)
- [Agent Chat History and Memory](https://learn.microsoft.com/en-us/agent-framework/user-guide/agents/agent-memory)
- [AutoGen Multi-Agent Chat](https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/)

---

## 4. Dify

### Storage Backends

**Core Architecture**:
- **PostgreSQL** - Application data, workflows, configurations
- **Vector Database** - Embeddings for RAG/knowledge base
- **Redis** - Caching, distributed state
- **Celery** - Asynchronous task queue

**Vector Database Options**:
| Database | Notes |
|----------|-------|
| Weaviate | Default option |
| Qdrant | High-performance, Rust-based, hybrid search |
| Milvus | Scalable vector search |
| TiDB | Distributed SQL + vector, unified storage |
| Chroma | Lightweight option |

**TiDB Integration Case Study**:
- Dify consolidated ~500K database containers into single TiDB Cloud
- Combined content + vector embeddings in single tables
- SQL queries work for both traditional and vector data

### Conversation History

- Stored in PostgreSQL
- Workflow execution history tracked
- Variable inspection across workflow runs
- Debug session state visualization

### Watch/Subscription Capabilities

**Trigger System** (v1.10.0+):

| Trigger Type | Mechanism | Use Case |
|--------------|-----------|----------|
| Schedule Trigger | Time-based subscription | Cron-like execution |
| Webhook Trigger | HTTP endpoint | Custom system integration |
| Plugin Trigger | External event subscription | GitHub PRs, helpdesk tickets, etc. |

**Real-Time Features**:
- Variable Inspect panel shows real-time workflow state
- Node state saved and visualized
- Debug sessions target exact issues

**Plugin Trigger**:
- Subscribes to external events (GitHub, Gmail, etc.)
- Structured payload parsing
- Automatic workflow initiation on events

### Scalability

**Production Architecture**:
- Flask backend with Celery workers
- Redis for distributed cache
- PostgreSQL for persistence
- Horizontal scaling via worker instances

**Deployment Options**:
- Docker Compose (simple)
- Kubernetes with Helm charts (HA)
- Cloud-agnostic (AWS, Azure, GCP, OVH, on-prem)
- Grafana dashboards for monitoring

### Standalone vs Clustered

- **Standalone**: Docker Compose with local volumes
- **Clustered**: Kubernetes with external PostgreSQL, Redis, and vector DB services

### Key Insights

1. Most complete out-of-box architecture with clear component separation
2. Trigger system provides real subscription to external events
3. TiDB integration shows path to unified SQL + vector storage
4. Strong monitoring story with Grafana integration
5. Plugin architecture enables extensibility without core changes

**Sources**:
- [Dify GitHub](https://github.com/langgenius/dify)
- [Dify Blog - Triggers](https://dify.ai/blog/introducing-trigger)
- [Dify x TiDB](https://dify.ai/blog/dify-x-tidb-supercharge-your-knowledge-pipeline-with-distributed-vector-storage)
- [Dify 1.5.0 Debugging](https://dify.ai/blog/dify-1-5-0-real-time-workflow-debugging-that-actually-works)

---

## 5. Flowise

### Storage Backends

**Database Support**:

| Database | Configuration | Notes |
|----------|--------------|-------|
| SQLite | Default | Single file at `~/.flowise/database.sqlite` |
| PostgreSQL | `DATABASE_TYPE=postgres` | Production recommended |
| MySQL | `DATABASE_TYPE=mysql` | Alternative production |
| MariaDB | `DATABASE_TYPE=mariadb` | MySQL-compatible |

**Configuration Example** (PostgreSQL):
```bash
DATABASE_TYPE=postgres
DATABASE_PORT=5432
DATABASE_HOST=localhost
DATABASE_NAME=flowise
DATABASE_USER=user
DATABASE_PASSWORD=123
PGSSLMODE=require
```

**File Storage**:
- Local, S3, or GCS via `STORAGE_TYPE` env var
- Default: `~/.flowise/storage`
- Files organized by organization > chatflow > session

### Conversation History

- Session-based conversation isolation
- Unique `chatId` generated per interaction (UI/Embedded Chat)
- Custom `sessionId` parameter for explicit separation
- Memory nodes support configurable session IDs

### Watch/Subscription Capabilities

- **No native watch mechanism**
- Flows stored as JSON graph structures
- State accessed through API endpoints
- No real-time subscription to flow changes

### Scalability

**Deployment Architectures**:

| Mode | Description |
|------|-------------|
| Single-Container | Docker with embedded UI, all services in one process |
| Queue-Based Multi-Container | Main server + N workers sharing Redis + database |
| Flowise Cloud | Managed SaaS with multi-tenant features |

**Self-Hosting Considerations**:
- Requires database backup strategy
- Manual update maintenance
- Technical skill for server management

### Standalone vs Clustered

- **Standalone**: SQLite with local storage
- **Clustered**: PostgreSQL/MySQL + Redis + multiple worker containers

### Key Insights

1. Simplest storage model - standard databases, no custom abstractions
2. Visual workflow builder stores flows as JSON
3. Queue-based architecture enables horizontal scaling
4. No vector database built-in (uses LangChain nodes for external DBs)
5. Good fit for teams familiar with traditional web architecture

**Sources**:
- [Flowise Databases Docs](https://docs.flowiseai.com/configuration/databases)
- [Flowise Environment Variables](https://docs.flowiseai.com/configuration/environment-variables)
- [Flowise GitHub](https://github.com/FlowiseAI/Flowise)
- [Flowise Architecture (DeepWiki)](https://deepwiki.com/FlowiseAI/Flowise)

---

## Comparative Analysis

### Storage Architecture Patterns

**Pattern 1: Checkpointer Abstraction (LangGraph)**
- Pros: Swappable backends, clear separation of concerns
- Cons: Requires understanding abstraction layer
- Best for: Applications needing flexible deployment targets

**Pattern 2: Memory Type Separation (CrewAI)**
- Pros: Clear purpose for each storage type
- Cons: Multiple systems to manage, local-only by default
- Best for: Agent memory with distinct short/long-term needs

**Pattern 3: Event-Driven Actor Model (AutoGen)**
- Pros: Natural fit for distributed systems
- Cons: More complex to reason about
- Best for: Complex multi-agent coordination

**Pattern 4: Component-Based (Dify)**
- Pros: Standard components, clear architecture
- Cons: More infrastructure to deploy
- Best for: Production platforms with operations teams

**Pattern 5: Traditional Web Stack (Flowise)**
- Pros: Familiar patterns, easy to understand
- Cons: Limited real-time capabilities
- Best for: Teams from web development background

### Watch/Subscription Summary

| Platform | Watch Type | Mechanism |
|----------|------------|-----------|
| LangGraph | None | Poll or graph execution events |
| CrewAI | None | Synchronous memory access |
| AutoGen | Agent Events | Actor messaging, no storage watch |
| Dify | External Events | Webhook/Plugin triggers for external systems |
| Flowise | None | API polling |

**Key Observation**: None of these platforms provide native storage watch/subscription. Dify comes closest with its trigger system, but this watches external events, not internal storage changes.

### Scalability Approaches

**Horizontal Scaling**:
- All platforms support Kubernetes deployment
- Redis commonly used for queuing/caching
- PostgreSQL commonly used for persistence

**Stateless Services**:
- LangGraph, AutoGen, Dify designed for stateless horizontal scaling
- CrewAI requires enterprise tier for true horizontal scaling
- Flowise uses worker model with shared state

### Recommendations for Ark

Based on this research, considerations for Ark storage architecture:

1. **Checkpointer Pattern** - Consider abstracting storage similar to LangGraph, allowing swappable backends (etcd for Kubernetes-native, PostgreSQL for standalone)

2. **Watch Capability** - Ark's Kubernetes-native approach with etcd/watch is a differentiator. None of these platforms have native storage watch. This enables reactive patterns others can't match.

3. **Memory Types** - CrewAI's separation of short-term/long-term/entity memory is worth considering for agent state organization

4. **Event Integration** - Dify's trigger system shows how to connect to external events. Consider how Kubernetes events could serve similar purpose.

5. **Vector Storage** - All platforms either integrate external vector DBs or have minimal built-in support. May be worth keeping vector concerns separate.

6. **Scalability Path** - Start simple (single instance), but design for stateless horizontal scaling from the beginning
