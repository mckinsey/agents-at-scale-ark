## Purpose

Defines an Ark ExecutionEngine whose backend is Agent Substrate: it dispatches an agent's
queries to a sandboxed actor and returns the result, mapping Ark's one-shot query model onto
Substrate's long-lived actor lifecycle.

## ADDED Requirements

### Requirement: Dispatch to the Substrate backend via the ExecutionEngine seam

The Substrate executor SHALL be addressable as an Ark `ExecutionEngine`. An `Agent` whose
`spec.executionEngine` names it SHALL have its queries executed on the Substrate backend,
with no change required to the agent-facing API. Agents that do not name it MUST be
unaffected.

#### Scenario: Agent bound to the Substrate engine
- **WHEN** a `Query` targets an `Agent` whose `spec.executionEngine` names the Substrate engine
- **THEN** the executor receives the query over A2A and runs the agent as a Substrate actor

#### Scenario: Other agents unaffected
- **WHEN** a `Query` targets an agent that does not name the Substrate engine
- **THEN** it continues to run on its existing executor unchanged

### Requirement: Run a query as a sandboxed actor and return the result

For each query the executor SHALL ensure the agent's actor template and egress policy exist,
create or resume an actor to run the agent, stream the agent's output back over A2A, and set
the query result on completion.

#### Scenario: First query provisions an actor
- **WHEN** a query arrives for an agent/session that has no existing actor
- **THEN** the executor provisions the template, egress policy, and a new actor, then runs the agent

#### Scenario: Result returned over A2A
- **WHEN** the agent produces its final output
- **THEN** the executor streams output and sets the query's result to that output

### Requirement: Lifecycle mapping for stateful vs stateless agents

For a stateful agent (one with a conversation/session), the executor SHALL reuse a single
actor per `(agent, conversationId)` across queries — suspending it when idle and resuming it
for the next query. For a stateless agent the executor SHALL use an ephemeral actor per query
and MUST NOT retain it for reuse.

#### Scenario: Follow-up query resumes the same actor
- **WHEN** a later query arrives with the same `conversationId` for a stateful agent
- **THEN** the executor resumes the existing suspended actor instead of creating a new one

#### Scenario: Stateless query uses a throwaway actor
- **WHEN** a stateless agent's query completes
- **THEN** its actor is not retained for subsequent queries

### Requirement: Surface failures instead of reporting silent success

WHEN the actor cannot be scheduled, the agent run errors, or the backend is unavailable, the
executor SHALL report a terminal failed query status with a diagnostic message. It MUST NOT
report success for a query whose agent did not complete its work.

#### Scenario: No worker capacity
- **WHEN** the worker pool has no room for the actor
- **THEN** the query is reported failed with the capacity error

#### Scenario: Agent run failed
- **WHEN** the agent errors or does not produce its result
- **THEN** the query status reflects failure rather than a silent success
