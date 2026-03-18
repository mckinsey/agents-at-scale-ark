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
The guide SHALL include a minimal working example of a `BaseExecutor` subclass with `ExecutorApp`, showing the `execute_agent()` method signature and how to run the engine.

#### Scenario: Developer follows the quickstart
- **WHEN** a developer follows the guide's quickstart example
- **THEN** they can create a Python file with a `BaseExecutor` subclass, run it with `ExecutorApp`, and see it serve an agent card at `/.well-known/agent-card.json`

### Requirement: SDK exports executor types from package root
The `ark_sdk` package SHALL export `BaseExecutor`, `ExecutorApp`, `ExecutionEngineRequest`, and related types from the package root or a clearly documented submodule.

#### Scenario: Developer imports executor types
- **WHEN** a developer reads the guide's import examples
- **THEN** the imports work without needing to discover internal module paths
