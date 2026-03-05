## ADDED Requirements

### Requirement: Model-target streaming metadata
When a Query targets a Model directly with streaming enabled, every chunk stored in ark-broker SHALL carry `ark.query` matching the query name and `ark.model` matching the model name. The `ark.agent` and `ark.team` fields SHALL be empty.

#### Scenario: Model query chunks have correct metadata
- **WHEN** a Query with `ark.mckinsey.com/streaming-enabled: "true"` targets a Model and completes successfully
- **THEN** all chunks stored in ark-broker for that query have `ark.query` equal to the query name, `ark.model` set to the model name, and `ark.agent` and `ark.team` empty

#### Scenario: Model query final chunk has completedQuery
- **WHEN** a streaming model-target Query completes successfully
- **THEN** the last chunk for that query has `ark.completedQuery` set to a non-null object containing the query name

### Requirement: Agent-target streaming metadata
When a Query targets an Agent with streaming enabled, every chunk SHALL carry `ark.query`, `ark.agent` matching the agent name, `ark.target` matching the agent name, and `ark.model` set to the agent's model.

#### Scenario: Agent query chunks have correct metadata
- **WHEN** a Query with streaming enabled targets an Agent and completes successfully
- **THEN** all chunks for that query have `ark.query` equal to the query name, `ark.agent` equal to the agent name, `ark.target` equal to the agent name, and `ark.model` set

#### Scenario: Agent query final chunk has completedQuery
- **WHEN** a streaming agent-target Query completes successfully
- **THEN** the last chunk has `ark.completedQuery` set to a non-null object

### Requirement: Team-target streaming metadata
When a Query targets a Team with streaming enabled, every chunk SHALL carry `ark.query`, `ark.team` matching the team name, `ark.agent` set to a non-empty value, and `ark.model` set.

#### Scenario: Team query chunks have correct metadata
- **WHEN** a Query with streaming enabled targets a Team and completes successfully
- **THEN** all chunks for that query have `ark.query` equal to the query name, `ark.team` equal to the team name, `ark.agent` non-empty, and `ark.model` set

#### Scenario: Team query final chunk has completedQuery
- **WHEN** a streaming team-target Query completes successfully
- **THEN** the last chunk has `ark.completedQuery` set to a non-null object

### Requirement: Error streaming metadata
When a streaming Query encounters an LLM error, the error chunk sent to ark-broker SHALL carry `ark` metadata and an `error` object with `message` and `type` fields.

#### Scenario: Error chunk has ark metadata
- **WHEN** a Query with streaming enabled targets an Agent whose model returns HTTP 500
- **THEN** ark-broker stores at least one chunk with an `error` field AND `ark.query` equal to the query name

### Requirement: Chunk ordering
Chunks stored in ark-broker for a given query SHALL have monotonically increasing sequence numbers.

#### Scenario: Sequence numbers are ordered
- **WHEN** a streaming Query completes and its chunks are retrieved from ark-broker
- **THEN** each chunk's `sequenceNumber` is strictly greater than the previous chunk's `sequenceNumber`

### Requirement: Stream completion signaling
When a streaming Query completes, ark-broker SHALL mark the query's stream as complete.

#### Scenario: Query stream is marked complete
- **WHEN** a streaming Query reaches phase done or error
- **THEN** the query's stream in ark-broker is marked as complete (the `/complete` endpoint was called)
