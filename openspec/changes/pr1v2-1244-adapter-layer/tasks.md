# PR1-v2 Adapter Layer Tasks

## 1. Adapter implementation

- [ ] 1.1 Create `protocol_messages.go` with `ProtocolMessagesFromOpenAI` and `OpenAIMessagesFromProtocol` functions.
- [ ] 1.2 Implement DataPart schemas for tool calls and tool results.
- [ ] 1.3 Implement convenience constructors: `ProtocolAssistantMessage`, `ProtocolUserMessage`, `ProtocolSystemMessage`, `ProtocolToolMessage`.
- [ ] 1.4 Implement `ProtocolMessageText` and `ExtractLastProtocolAssistantMessageContent` helpers.
- [ ] 1.5 Add `ProtocolMessage = protocol.Message` type alias to `types.go`.

## 2. Verification

- [ ] 2.1 Create `protocol_messages_test.go` with round-trip fidelity tests.
- [ ] 2.2 Test sequence preservation for mixed-type message arrays.
- [ ] 2.3 Test DataPart schema correctness for tool calls and results.
- [ ] 2.4 Compile completions package.
