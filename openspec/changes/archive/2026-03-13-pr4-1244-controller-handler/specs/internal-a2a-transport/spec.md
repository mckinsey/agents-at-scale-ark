## MODIFIED Requirements

### Requirement: Protocol-native handler and controller execution state
Ark query execution SHALL keep handler and controller orchestration state in protocol-native message form, with OpenAI message shape used only at compatibility boundaries.

#### Scenario: Handler dispatch lifecycle
- **WHEN** handler dispatches execution to agent, team, model, or tool targets
- **THEN** inputs, history, and responses remain protocol-native until boundary serialization

#### Scenario: Controller direct execution response
- **WHEN** controller executes an execution-engine-backed agent directly
- **THEN** protocol message results are serialized to compatibility output without reintroducing OpenAI-shaped internal state
