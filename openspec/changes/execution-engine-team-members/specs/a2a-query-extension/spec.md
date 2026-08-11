## ADDED Requirements

### Requirement: QueryRef carries an optional target override

The QueryRef payload SHALL support an optional `target` object with required `type` and `name` fields. When present it names the resource the receiving engine executes, overriding the Query's own `spec.target`. When absent the engine SHALL fall back to `spec.target`.

The controller SHALL NOT send `target` on a top-level dispatch, where `spec.target` is authoritative. The completions engine SHALL send `target: {type: agent, name: <member>}` when dispatching one member of a team, because that Query targets the team rather than the member.

The extension URI SHALL NOT change: the field is purely additive, and a receiver that does not understand it ignores it.

#### Scenario: Top-level dispatch sends no target

- **WHEN** the controller dispatches a Query to a named execution engine
- **THEN** the extension metadata contains exactly `name` and `namespace`, byte-identical to the payload sent before `target` existed
- **AND** the engine resolves the agent from `query.spec.target`

#### Scenario: Team member dispatch sends a target

- **WHEN** the completions engine executes a team member whose agent has an `ExecutionEngine` ref
- **THEN** the A2A message to that engine carries `target: {type: agent, name: <member>}` alongside the QueryRef
- **AND** the engine executes that member rather than the team named by `query.spec.target`

#### Scenario: Engine receives a malformed target

- **WHEN** a QueryRef carries a `target` that is not an object, or is missing `type` or `name`
- **THEN** the receiver rejects the message with an error naming the offending field

#### Scenario: Engine predating the target field

- **WHEN** an engine that does not understand `target` receives a team member call
- **THEN** it ignores the field, sees `spec.target.type: team`, and rejects the call with an error stating the required ark version
- **AND** top-level dispatches to that engine continue to work unchanged

### Requirement: A sub-target invocation does not own the Query

A receiving engine SHALL NOT write to the Query's broker stream, memory, or `status` when the QueryRef carries a `target`, and SHALL NOT treat the invocation as a resumption of the Query's approval cycle. The calling engine owns all of these for the duration of the run; a second writer double-writes memory, churns `status.phase`, and can complete a stream other members are still using.

A sub-target SHALL take its input from the inbound A2A message rather than the Query's own input, because that message carries the accumulated team transcript while the Query records the question posed to the team as a whole.

The `streaming-supported` annotation SHALL be ignored for sub-target invocations, which use blocking `message/send`, because broker chunks are keyed by query name and would interleave across members.

#### Scenario: SDK suppresses broker and status for a sub-target

- **WHEN** an A2A message with a `target` arrives at an engine built with the Python SDK
- **THEN** the SDK does not discover the broker or construct a `BrokerClient`
- **AND** it leaves the query status updater unset, so `stream_chunk` and `update_query_phase` are no-ops
- **AND** `execute_agent()` still receives a fully populated `ExecutionEngineRequest` for the named member

#### Scenario: Completions engine receives a sub-target

- **WHEN** the completions engine receives an A2A message carrying `target: {type: agent, name: X}`
- **THEN** it executes agent X against the inbound message text
- **AND** it writes nothing to the Query's memory, broker stream or status
- **AND** it does not enter the approval-resumption path even if the parent Query has an A2A task

#### Scenario: SDK keeps broker and status for a top-level call

- **WHEN** an A2A message without a `target` arrives
- **THEN** the SDK discovers the broker and sets the query status updater exactly as before

### Requirement: Completions engine dispatches team members to named engines

The completions engine SHALL dispatch a team member whose agent declares a named `ExecutionEngine` to that engine's resolved address over A2A, rather than to the A2AServer path. Agents on the reserved `"a2a"` engine SHALL continue to take the A2AServer path unchanged.

Because the engine contract carries no history field, the completions engine SHALL fold the accumulated team transcript into the member's `userInput` text, including any system messages, which carry instructions the receiving engine must see. With no history it SHALL send the bare user text, leaving single-agent dispatch unchanged.

An agent dispatched over A2A SHALL NOT require a Model, and SHALL NOT be reported unavailable on account of a `modelRef` defaulted onto it by the mutating webhook.

An inbound sub-target names an agent that the receiving completions engine SHALL execute locally rather than dispatching onwards, bounding any chain at one extra hop.

#### Scenario: Sequential team of engine-backed members

- **WHEN** a Query targets a sequential Team whose members all declare a named execution engine
- **THEN** each member is dispatched to that engine in turn and the query completes
- **AND** the second member's input contains the first member's output

#### Scenario: Engine-backed member without a usable Model

- **WHEN** a Team member declares an `executionEngine` and no `modelRef`, and no Model named `default` exists
- **THEN** the team loads successfully, the member executes on its engine, and the agent is not reported unavailable

#### Scenario: Agent whose engine resolves back to a completions engine

- **WHEN** a completions engine receives a sub-target naming an agent whose own `executionEngine` resolves to a completions engine
- **THEN** it executes that agent locally instead of dispatching to itself
- **AND** if that agent has no usable model, the error explains that it must run locally and therefore needs one

### Requirement: Engine-backed selector agents select and terminate by reply text

A selector agent on a named execution engine SHALL select the next speaker from its reply text, matched against the candidate names: exact, then case-insensitive, then a single candidate mentioned as a whole name. A candidate SHALL NOT match when it appears inside a longer word or identifier. The runtime `select-next-speaker` tool SHALL NOT be registered for such a selector, because a tool registered in-process cannot reach an out-of-process engine.

Where the terminate tool is enabled, such a selector SHALL be able to end the run by replying with a terminate token, optionally followed by a closing response, which SHALL reach the user in place of the token. The token SHALL NOT match a candidate whose name merely begins with it.

A configured `spec.selector.terminatePrompt` SHALL be honoured for engine-backed selectors; only the mechanism instruction differs, because an engine has no tool to call.

No match, or an ambiguous one, SHALL surface as the existing invalid-agent error. Local selector agents SHALL be unaffected: tool registration, the terminate tool, forced tool choice and the configured prompt are unchanged.

#### Scenario: Engine selector names a candidate

- **WHEN** an engine-backed selector replies with a candidate name, in any case, alone or embedded in a sentence
- **THEN** that member is selected

#### Scenario: Engine selector names a member whose name resembles the terminate token

- **WHEN** an engine-backed selector replies with the name of a member called `terminate-agent`
- **THEN** that member is selected rather than the run being terminated

#### Scenario: A candidate name appears inside a longer word

- **WHEN** an engine-backed selector's reply contains a candidate's letters only as part of another word
- **THEN** that candidate is not selected

#### Scenario: Engine selector terminates with a closing response

- **WHEN** an engine-backed selector replies with the terminate token followed by a closing response
- **THEN** the run ends and the closing response, without the token, becomes the query's final content

#### Scenario: Engine selector names nothing recognisable

- **WHEN** an engine-backed selector's reply matches no candidate, or matches more than one ambiguously
- **THEN** the selection fails with an invalid-agent error and the team terminates as it does for a local selector

### Requirement: Human-in-the-loop approval is not supported over A2A

An agent executed over either A2A transport SHALL NOT be able to raise a human-in-the-loop approval, because the approval cannot be forwarded to the orchestrator that owns the Query. A peer returning a task in the `input-required` state SHALL be reported as an unsupported capability rather than a generic protocol error.

#### Scenario: Peer returns an input-required task

- **WHEN** an agent dispatched over A2A returns a task in state `input-required`
- **THEN** the run fails with an error naming the task and stating that HITL approval is not supported for agents executed over A2A
