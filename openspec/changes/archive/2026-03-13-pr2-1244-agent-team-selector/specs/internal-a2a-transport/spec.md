## MODIFIED Requirements

### Requirement: Protocol-native internal agent and team loops
The completions executor SHALL run agent, team, selector, and graph orchestration with protocol-native message transport internally.

#### Scenario: Execute team turn with protocol history
- **WHEN** a team member executes within sequential, round-robin, selector, or graph strategy
- **THEN** history accumulation and member invocation use protocol message types end to end

#### Scenario: Preserve provider compatibility boundary
- **WHEN** local model providers are invoked from protocol-native loops
- **THEN** protocol messages are converted at the provider boundary and converted back to protocol for internal accumulation
