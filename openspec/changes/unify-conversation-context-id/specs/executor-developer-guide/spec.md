## MODIFIED Requirements

### Requirement: Guide covers BaseExecutor usage
The guide SHALL include a minimal working example of a `BaseExecutor` subclass with `ExecutorApp`, showing the `execute_agent()` method signature, access to `conversationId` for stateful engines, and how to run the engine.

#### Scenario: Developer follows the quickstart
- **WHEN** a developer follows the guide's quickstart example
- **THEN** they can create a Python file with a `BaseExecutor` subclass, run it with `ExecutorApp`, and see it serve an agent card at `/.well-known/agent-card.json`

#### Scenario: Developer reads about conversation threading
- **WHEN** a developer reads the guide's section on stateful engines
- **THEN** the guide explains that `request.conversationId` contains the A2A context ID sent by the controller, and the engine can use it for session management

### Requirement: Guide documents conversation threading for named engines
The guide SHALL include a section explaining how named engines receive conversation IDs via the A2A protocol and how to use them for stateful behavior.

#### Scenario: Developer wants to build a stateful engine
- **WHEN** a developer reads the guide looking for multi-turn support
- **THEN** the guide explains that `ExecutionEngineRequest.conversationId` is populated from the A2A message's contextId, and the engine can use it to look up or create internal sessions
