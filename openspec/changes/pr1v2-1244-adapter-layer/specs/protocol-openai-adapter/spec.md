## ADDED Requirements

### Requirement: OpenAI to ProtocolMessage conversion
The adapter SHALL convert each OpenAI `ChatCompletionMessageParamUnion` to a `protocol.Message` preserving role, content, and tool structure.

#### Scenario: Convert assistant message with text content
- **WHEN** an OpenAI assistant message with text content is converted
- **THEN** the result SHALL be a `role=agent` protocol message with a TextPart containing the content

#### Scenario: Convert assistant message with tool calls
- **WHEN** an OpenAI assistant message contains tool calls
- **THEN** the result SHALL be a `role=agent` protocol message with DataParts for each tool call containing name, arguments, and call ID

#### Scenario: Convert tool result message
- **WHEN** an OpenAI tool message is converted
- **THEN** the result SHALL be a `role=agent` protocol message with a DataPart containing tool call ID, name, and result content

#### Scenario: Convert user message
- **WHEN** an OpenAI user message is converted
- **THEN** the result SHALL be a `role=user` protocol message with a TextPart

#### Scenario: Convert system message
- **WHEN** an OpenAI system message is converted
- **THEN** the result SHALL NOT produce a protocol message (system messages are agent-local configuration)

### Requirement: ProtocolMessage to OpenAI conversion
The adapter SHALL convert each `protocol.Message` back to the correct OpenAI `ChatCompletionMessageParamUnion` type, preserving round-trip fidelity.

#### Scenario: Round-trip assistant text message
- **WHEN** an OpenAI assistant text message is converted to protocol and back
- **THEN** the resulting OpenAI message SHALL be equivalent to the original

#### Scenario: Round-trip tool call and result sequence
- **WHEN** a sequence of OpenAI messages (assistant with tool calls, tool results) is converted to protocol and back
- **THEN** the resulting OpenAI sequence SHALL preserve message order, tool call IDs, and content

### Requirement: Sequence preservation
The adapter SHALL preserve the order of messages during conversion in both directions.

#### Scenario: Multi-message sequence maintains order
- **WHEN** a sequence of mixed-type messages is converted in either direction
- **THEN** the output sequence SHALL maintain the same order as the input
