# Architecture Question: Is ark-event-manager Solving the Right Problems?

## The Three Problems We're Solving

**Context**: We were told to avoid excessive microservice separation, so we're consolidating multiple concerns into one service.

**The three problems:**

1. **Correlation ID Problem**: Join different entity types (events, messages, queries) under a single correlation ID
   - Events have `correlation_id` (can be session_id, query_id, Argo workflow session_id)
   - Messages have `session_id` and `query_id`
   - Need to query/join them by correlation ID (e.g., "show me everything for this Argo workflow session")

2. **Feeding Events into ARK**: Ingest events from various sources
   - Argo workflows (from Composer)
   - Kubernetes events
   - ARK controllers (query execution, agent calls, etc.)
   - Store them for querying and analysis

3. **Getting ARK Users to Subscribe to Events**: Real-time event streaming
   - Users need to subscribe to events (SSE, GraphQL subscriptions)
   - Stream events by correlation_id, type, filters
   - Real-time monitoring and debugging

## Current Architecture: ark-event-manager

**What it provides:**

1. ✅ **Event Ingestion** (`POST /events`)
   - Receives events from multiple sources (JSON format)
   - Stores in database for querying

2. ✅ **Message Storage** (`POST /messages`, `GET /messages`)
   - Implements MemoryInterface (replaces ark-cluster-memory)
   - Stores conversation messages

3. ✅ **Streaming** (`GET /stream/{query_id}`, GraphQL subscriptions)
   - SSE streaming for real-time event delivery
   - GraphQL subscriptions for event streaming

4. ✅ **Unified Storage** (events + messages in same DB)
   - Both stored in SQLite/PostgreSQL
   - Can query/join by correlation_id

5. ❓ **Correlation ID Query** (partially implemented)
   - Events have `correlation_id` field
   - Messages have `session_id` and `query_id`
   - Missing: Unified query endpoint that joins by correlation ID

## The Counter-Argument

**"Events are telemetry logs only - why not use an off-the-shelf observability solution?"**

**ARK already has:**
- ✅ OpenTelemetry integration (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- ✅ Kubernetes events (structured event recording)
- ✅ Prometheus metrics (mentioned in docs)

**Standard observability stack could handle events:**
- **OpenTelemetry** → Jaeger/Tempo for traces
- **Prometheus** → Grafana for metrics
- **Loki/ELK** → Log aggregation
- **Kubernetes Events** → Already in K8s API

**If we use off-the-shelf for telemetry, ark-event-manager would focus on:**
- Messages (memory interface) - replaces ark-cluster-memory
- Streaming (real-time query execution chunks)
- Correlation queries (join messages with telemetry from observability stack)

## The Question

**Is consolidating these three problems into one service the right approach?**

### Option A: Current Approach (Consolidated Service - Events + Messages + Streaming)

**Pros:**
- ✅ Avoids microservice proliferation
- ✅ Single service to deploy/maintain
- ✅ Unified storage makes correlation queries easier
- ✅ Replaces ark-cluster-memory (consolidation benefit)

**Cons:**
- ❌ Service does multiple things (event ingestion, message storage, streaming)
- ❌ Might be harder to scale different concerns independently
- ❌ More complex codebase

### Option B: Use Off-the-Shelf for Telemetry + Focused Service

**Split concerns:**
1. **Telemetry/Events**: Use standard observability stack
   - OpenTelemetry → Jaeger/Tempo
   - Prometheus → Grafana
   - Loki/ELK → Log aggregation
   - Kubernetes Events → K8s API
   
2. **ark-event-manager**: Focused on ARK-specific concerns
   - Messages (memory interface) - replaces ark-cluster-memory
   - Streaming (real-time query execution chunks)
   - Correlation queries (join messages with telemetry via correlation_id)

**Pros:**
- ✅ Use battle-tested observability tools (OpenTelemetry, Prometheus, etc.)
- ✅ Less custom code to maintain
- ✅ Standard tooling that teams already know
- ✅ Better scalability (observability stacks are designed for high volume)
- ✅ ark-event-manager focuses on ARK-specific needs (messages, streaming, correlation)

**Cons:**
- ❌ Need to integrate with observability stack (but OpenTelemetry is already integrated)
- ❌ Correlation queries span two systems (but correlation_id links them)
- ❌ Need to ensure correlation_id flows through to observability stack

### Option C: Separate Concerns (Microservices)

**Could split into:**
1. **Event Store**: Just event ingestion + storage
2. **Memory Service**: Just message storage (keep ark-cluster-memory or replace)
3. **Streaming Service**: Just streaming (SSE, GraphQL subscriptions)

**Pros:**
- ✅ Single responsibility per service
- ✅ Can scale independently
- ✅ Clearer boundaries

**Cons:**
- ❌ More services to deploy/maintain (violates "avoid microservice separation")
- ❌ Harder to do correlation queries across services
- ❌ More network calls for unified queries

## Assessment

**For the three problems:**

1. **Correlation ID Problem**: 
   - ✅ **Current architecture works** (events + messages in same DB)
   - ✅ **Option B also works** (correlation_id links messages to telemetry in observability stack)
   - Both can add unified query endpoint: `GET /correlation/{correlation_id}`

2. **Feeding Events into ARK**: 
   - ✅ **Current architecture works** (`POST /events` endpoint)
   - ✅ **Option B uses standard stack** (OpenTelemetry, Prometheus, K8s Events)
   - **Question**: Are events really just telemetry, or do they need ARK-specific processing?

3. **Getting Users to Subscribe**: 
   - ✅ **Current architecture works** (SSE, GraphQL subscriptions)
   - ❓ **Option B**: Do we need custom streaming, or can Grafana/Loki handle it?
   - **Key question**: Is streaming for query execution chunks (ARK-specific) or general telemetry?

## Recommendation

**The key question: Are events just telemetry, or do they need ARK-specific processing?**

### If Events Are Just Telemetry (Option B - Recommended)

**Use standard observability stack:**
- OpenTelemetry → Jaeger/Tempo (traces)
- Prometheus → Grafana (metrics)
- Loki/ELK (logs)
- Kubernetes Events (structured events)

**ark-event-manager focuses on:**
- Messages (memory interface) - replaces ark-cluster-memory ✅
- Streaming (real-time query execution chunks) - ARK-specific ✅
- Correlation queries (join messages with telemetry) - via correlation_id ✅

**Benefits:**
- ✅ Less custom code to maintain
- ✅ Use battle-tested tools
- ✅ Better scalability for telemetry
- ✅ Standard tooling teams know
- ✅ Still avoids microservice proliferation (one ARK service + standard stack)

**Implementation:**
1. Ensure `correlation_id` flows through to OpenTelemetry traces/logs
2. ark-event-manager queries observability stack by correlation_id
3. Unified endpoint: `GET /correlation/{correlation_id}` joins messages + telemetry

### If Events Need ARK-Specific Processing (Option A)

**Keep current architecture IF:**
- Events need custom processing beyond standard telemetry
- Events are tightly coupled with messages (same transaction, etc.)
- Need custom event schema/validation

**What's missing:**
1. **Unified Correlation Query Endpoint**:
   ```python
   GET /correlation/{correlation_id}
   # Returns:
   {
     "correlation_id": "argo-session-123",
     "events": [...],  # All events with this correlation_id
     "messages": [...],  # All messages with matching session_id/query_id
     "timeline": [...]  # Merged, sorted by timestamp
   }
   ```

2. **Better Correlation ID Strategy**:
   - Ensure Argo workflow session IDs are stored in ARK entities
   - Use Argo session ID as `correlation_id` for events
   - Make it easy to join everything by Argo session ID

## Data Model Question: Generic Parent-Child Relationships

**Current Problem:**
- Events have `correlation_id`
- Messages have `session_id` and `query_id`
- Queries have `session_id` and `query_id`
- Multiple ID fields scattered across entities
- Hard to query "everything related to X"

**Proposed Solution: Generic Parent-Child Relationship Model**

Instead of multiple ID fields, use a generic relationship table:

```python
class EntityRelationship(SQLModel, table=True):
    """Generic parent-child relationship between any entities."""
    __tablename__ = "entity_relationships"
    
    id: int | None = Field(default=None, primary_key=True)
    parent_type: str = Field(..., description="Entity type (e.g., 'argo_workflow', 'query', 'session')")
    parent_id: str = Field(..., description="Parent entity ID", index=True)
    child_type: str = Field(..., description="Entity type (e.g., 'query', 'message', 'event')")
    child_id: str = Field(..., description="Child entity ID", index=True)
    relationship_type: str = Field(default="child", description="Type: child, sibling, etc.")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Composite index for fast lookups
    __table_args__ = (
        Index('idx_parent', 'parent_type', 'parent_id'),
        Index('idx_child', 'child_type', 'child_id'),
    )
```

**Example Hierarchy:**
```
Argo Workflow (parent)
  ├── ARK Query (child)
  │     ├── Message (child of query)
  │     ├── Event (child of query)
  │     └── Agent Call (child of query)
  └── Event (child of workflow)
```

**Benefits:**
- ✅ **Flexible**: Can model any hierarchy (workflow → query → message, session → query → event, etc.)
- ✅ **Queryable**: Single query gets all children/descendants of a parent
- ✅ **Extensible**: Easy to add new relationship types
- ✅ **No hardcoded IDs**: No need for `correlation_id`, `session_id`, `query_id` scattered everywhere
- ✅ **Recursive queries**: Can query all descendants, not just direct children

**Query Examples:**
```python
# Get all entities for an Argo workflow
SELECT * FROM entity_relationships 
WHERE parent_type = 'argo_workflow' AND parent_id = 'workflow-123'
# Returns: all queries, messages, events related to this workflow

# Get all descendants recursively
WITH RECURSIVE descendants AS (
  SELECT child_type, child_id FROM entity_relationships
  WHERE parent_type = 'argo_workflow' AND parent_id = 'workflow-123'
  UNION ALL
  SELECT er.child_type, er.child_id FROM entity_relationships er
  INNER JOIN descendants d ON er.parent_type = d.child_type AND er.parent_id = d.child_id
)
SELECT * FROM descendants;
```

**Migration Path:**
1. Add `EntityRelationship` table
2. Populate from existing `correlation_id`, `session_id`, `query_id` fields
3. Keep old fields for backward compatibility (deprecate later)
4. New entities use relationship table only

**Alternative: Polymorphic Association**
```python
class Entity(SQLModel, table=True):
    """Base entity with relationships."""
    id: str = Field(..., primary_key=True)
    entity_type: str = Field(..., index=True)  # 'query', 'message', 'event', etc.
    parent_id: str | None = Field(default=None, index=True)  # Reference to parent
    parent_type: str | None = Field(default=None, index=True)
    # ... entity-specific fields
```

## Is Generic Parent-Child Relationship Model Feasible/Good Idea?

### ✅ **Pros: It's a Well-Established Pattern**

**Common Patterns:**
- **Polymorphic Associations**: Used in Rails, Django, many ORMs
- **Closure Table**: For deep hierarchies (e.g., categories, org charts)
- **Adjacency List**: Simple parent-child (what we're proposing)
- **Materialized Path**: Store full path (e.g., `/workflow/query/message`)

**Real-World Examples:**
- **GitHub**: Issues, PRs, comments use polymorphic associations
- **Jira**: Issues, subtasks, comments linked via relationships
- **Salesforce**: Generic relationship objects for custom objects
- **Content Management**: Pages, posts, comments in hierarchical structures

### ✅ **Advantages**

1. **Flexibility**: Model any hierarchy without schema changes
2. **Extensibility**: Add new entity types without migrations
3. **Query Power**: Single query gets all related entities
4. **No Redundancy**: One relationship table vs multiple ID fields per entity
5. **Future-Proof**: Easy to add new relationship types (sibling, related, etc.)

### ⚠️ **Challenges & Trade-offs**

**1. Query Complexity**
```sql
-- Simple: Get all children of a workflow
SELECT * FROM entity_relationships 
WHERE parent_type = 'argo_workflow' AND parent_id = 'workflow-123';

-- Complex: Get all descendants recursively
WITH RECURSIVE descendants AS (...);  -- Can be slow on large hierarchies
```

**2. Performance Considerations**
- **Indexes**: Need composite indexes on `(parent_type, parent_id)` and `(child_type, child_id)`
- **Join Performance**: Joining across entity types can be slower than direct foreign keys
- **Query Optimization**: Database can't use foreign key constraints for optimization

**3. Data Integrity**
- **No Foreign Key Constraints**: Can't enforce referential integrity at DB level
- **Orphaned Records**: Need application-level validation
- **Type Safety**: `parent_type`/`child_type` are strings (typos possible)

**4. Query Complexity**
- **Type Filtering**: Need to filter by entity type in every query
- **Polymorphic Joins**: Can't use simple JOINs, need UNION or separate queries per type

### 🔄 **Alternatives**

**Option 1: Hybrid Approach (Recommended)**
```python
# Keep specific fields for common cases (fast queries)
class Message(SQLModel, table=True):
    session_id: str = Field(index=True)  # Common query path
    query_id: str | None = Field(index=True)  # Common query path
    # ... other fields

# Use relationship table for flexible/cross-cutting relationships
class EntityRelationship(SQLModel, table=True):
    parent_type: str
    parent_id: str
    child_type: str
    child_id: str
```

**Benefits:**
- ✅ Fast queries for common cases (direct foreign keys)
- ✅ Flexible relationships for complex cases
- ✅ Best of both worlds

**Option 2: Materialized Path**
```python
class Event(SQLModel, table=True):
    path: str = Field(..., index=True)  # '/argo_workflow:123/query:456'
    # Query: WHERE path LIKE '/argo_workflow:123%'
```

**Benefits:**
- ✅ Very fast queries (single index lookup)
- ✅ Easy to get all descendants
- ❌ Harder to update when hierarchy changes

**Option 3: Keep Current Approach (Simpler)**
```python
# Just use correlation_id consistently
class Event(SQLModel, table=True):
    correlation_id: str = Field(index=True)  # Can be workflow_id, query_id, etc.

class Message(SQLModel, table=True):
    session_id: str = Field(index=True)
    query_id: str | None = Field(index=True)
    # Add workflow_id if needed
```

**Benefits:**
- ✅ Simple, straightforward
- ✅ Fast queries (direct indexes)
- ✅ Easy to understand
- ❌ Less flexible (need schema changes for new relationships)

### 📊 **Recommendation**

**For ARK's Use Case:**

**Use Hybrid Approach:**
1. **Keep specific fields** for common, performance-critical queries:
   - `Message.session_id`, `Message.query_id` (fast message lookups)
   - `Event.correlation_id` (fast event filtering)

2. **Add relationship table** for flexible, cross-cutting relationships:
   - Link Argo workflows to ARK queries
   - Link queries to multiple parents (workflow + session)
   - Future: Link related queries, sibling relationships, etc.

**Why Hybrid?**
- ✅ Performance: Common queries stay fast (direct indexes)
- ✅ Flexibility: Complex relationships possible without schema changes
- ✅ Migration: Can add relationship table incrementally
- ✅ Best of both worlds

**Implementation:**
```python
# Fast path: Direct queries
messages = await db.query(Message).filter(Message.session_id == session_id).all()

# Flexible path: Relationship queries
workflow_entities = await db.query(EntityRelationship).filter(
    EntityRelationship.parent_type == 'argo_workflow',
    EntityRelationship.parent_id == workflow_id
).all()
```

**When to Use Full Generic Model:**
- If you have many entity types (>10)
- If relationships change frequently
- If you need complex multi-parent relationships
- If query performance is less critical than flexibility

**When to Keep Current Approach:**
- If relationships are simple and stable
- If query performance is critical
- If you only have a few entity types
- If you prefer simplicity over flexibility

## Next Steps

**Decision needed:**
1. **Are events just telemetry?** → Use Option B (standard observability stack)
2. **Do events need ARK-specific processing?** → Use Option A (current architecture)
3. **Data model: Use generic parent-child relationships?** → Replace multiple ID fields with relationship table

**If Option B:**
1. Ensure `correlation_id` flows to OpenTelemetry/Prometheus
2. Simplify ark-event-manager to focus on messages + streaming
3. Add correlation query endpoint that joins messages + telemetry

**If Option A:**
1. Add unified correlation query endpoint
2. Ensure Argo session IDs flow through to ARK entities
3. Document the correlation ID strategy clearly

**If Generic Relationships:**
1. Design `EntityRelationship` table schema
2. Create migration from existing ID fields
3. Update query endpoints to use relationship table
4. Deprecate old `correlation_id`, `session_id`, `query_id` fields
