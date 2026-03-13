## ADDED Requirements

### Requirement: Agent Card declares execution-context extension
The completions engine Agent Card SHALL declare `ark.mckinsey.com/extensions/execution-context/v1` in its `Capabilities.Extensions` array.

#### Scenario: Agent Card includes extension in capabilities
- **WHEN** a client fetches the completions engine Agent Card
- **THEN** the `capabilities.extensions` field SHALL include `ark.mckinsey.com/extensions/execution-context/v1`

#### Scenario: Extension is discoverable via A2A agent-card endpoint
- **WHEN** an A2A client queries the agent card endpoint for capability negotiation
- **THEN** the response SHALL advertise the execution-context extension URI
