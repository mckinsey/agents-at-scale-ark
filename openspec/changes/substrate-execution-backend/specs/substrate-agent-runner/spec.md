## Purpose

A generic in-sandbox runner that executes an Ark agent from its declarative Agent/Model/Tool
specification via a selectable framework adapter, so the agent framework is chosen by
configuration rather than by baking a separate runner image per framework.

## ADDED Requirements

### Requirement: Honor the execution backend's runner contract

The runner SHALL serve the backend's health and readiness probes, prepare the agent's
workspace once, run the agent, and shut down cleanly on termination within the backend's
grace period.

#### Scenario: Reports readiness after setup
- **WHEN** the agent's workspace preparation has completed
- **THEN** the runner reports ready; until then it reports not-ready

#### Scenario: Clean shutdown on termination
- **WHEN** the runner is asked to stop
- **THEN** it terminates the agent and exits within the grace period

### Requirement: Execute the agent from its declarative spec

The runner SHALL execute the agent using the `Agent`/`Model`/`Tool` specification supplied by
the executor, selecting a framework adapter from that spec. It MUST NOT require a
framework-specific image; the same runner image SHALL serve multiple agents and frameworks.

#### Scenario: Completions adapter by default
- **WHEN** the agent specifies no framework
- **THEN** the runner executes it with the completions adapter using Ark's provider-agnostic model client

#### Scenario: Explicit adapter selection
- **WHEN** the agent specifies a framework adapter
- **THEN** the runner executes the agent with that adapter

### Requirement: Invoke the model and tools and stream output

The runner SHALL call the configured model and invoke the agent's tools and MCP servers as
the adapter directs, SHALL stream intermediate output for observability, and SHALL return the
agent's final result to the executor.

#### Scenario: Tool invocation in the loop
- **WHEN** the adapter decides to call a configured tool or MCP server
- **THEN** the runner invokes it and feeds the result back into the agent loop

#### Scenario: Output streamed and result returned
- **WHEN** the agent emits output
- **THEN** the runner streams it for observability and returns the final result to the executor
