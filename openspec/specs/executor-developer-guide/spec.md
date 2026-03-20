## ADDED Requirements

### Requirement: Executor developer guide exists
The documentation site SHALL include a guide at `docs/content/developer-guide/building-execution-engines.mdx` that explains how to build an Ark execution engine using the Python SDK.

#### Scenario: Developer looks for executor documentation
- **WHEN** a developer navigates to the developer guide section of the docs
- **THEN** a "Building Execution Engines" guide is listed and accessible

### Requirement: Guide references the extension spec
The executor developer guide SHALL reference `ark/api/extensions/query/v1/` as the authoritative contract spec and link to its README.

#### Scenario: Developer reads the guide
- **WHEN** a developer reads the executor guide
- **THEN** the guide explains that Ark uses the A2A v0.3.0 query extension to pass context and links to the schema location in the repo

### Requirement: Guide covers BaseExecutor usage
The guide SHALL include a minimal working example of a `BaseExecutor` subclass with `ExecutorApp`, showing the `execute_agent()` method signature, access to `conversation_id` for stateful engines, and how to run the engine.

#### Scenario: Developer follows the quickstart
- **WHEN** a developer follows the guide's quickstart example
- **THEN** they can create a Python file with a `BaseExecutor` subclass, run it with `ExecutorApp`, and see it serve an agent card at `/.well-known/agent-card.json`

#### Scenario: Developer reads about conversation threading
- **WHEN** a developer reads the guide's section on stateful engines
- **THEN** the guide explains that `request.conversation_id` contains the A2A context ID sent by the controller, and the engine can use it for session management

### Requirement: Guide documents conversation threading for named engines
The guide SHALL include a section explaining how named engines receive conversation IDs via the A2A protocol and how to use them for stateful behavior.

#### Scenario: Developer wants to build a stateful engine
- **WHEN** a developer reads the guide looking for multi-turn support
- **THEN** the guide explains that `ExecutionEngineRequest.conversation_id` is populated from the A2A message's contextId, and the engine can use it to look up or create internal sessions

### Requirement: SDK exports executor types from package root
The `ark_sdk` package SHALL export `BaseExecutor`, `ExecutorApp`, `ExecutionEngineRequest`, and related types from the package root or a clearly documented submodule.

#### Scenario: Developer imports executor types
- **WHEN** a developer reads the guide's import examples
- **THEN** the imports work without needing to discover internal module paths
