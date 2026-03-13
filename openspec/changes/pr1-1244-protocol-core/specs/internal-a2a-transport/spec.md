## ADDED Requirements

### Requirement: Protocol adapter foundation for completions messages
The completions executor SHALL provide a protocol adapter layer that converts between OpenAI chat message unions and A2A protocol messages for internal transport migration.

#### Scenario: Convert OpenAI message to protocol
- **WHEN** completions receives user, assistant, system, or tool messages as OpenAI message unions
- **THEN** the adapter produces protocol messages with equivalent role and text semantics

#### Scenario: Convert protocol message to OpenAI
- **WHEN** completions needs provider-compatible output from protocol-native internal messages
- **THEN** the adapter produces OpenAI message unions that preserve assistant name and tool call context metadata
