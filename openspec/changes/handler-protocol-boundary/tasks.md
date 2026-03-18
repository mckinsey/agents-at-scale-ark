# Handler Protocol Boundary Tasks

## 1. Refactor buildA2AResponse

- [ ] 1.1 Change `buildA2AResponse` primary parameter from `[]Message` to `[]protocol.Message`
- [ ] 1.2 Implement adapter that converts `[]Message` → `[]protocol.Message` for legacy callers
- [ ] 1.3 Update callers of `buildA2AResponse` to provide protocol messages where available

## 2. Protocol-to-OpenAI serialization

- [ ] 2.1 Implement `protocolToOpenAIJSON` producing OpenAI-compatible JSON from `[]protocol.Message`
- [ ] 2.2 Update `messages` metadata generation to use `protocolToOpenAIJSON`
- [ ] 2.3 Verify `response.raw` output is byte-equivalent to the existing path for standard messages

## 3. Execution result extension

- [ ] 3.1 Add `ProtocolResponseMessages []protocol.Message` field to `ExecutionResult`
- [ ] 3.2 Update handler to prefer `ProtocolResponseMessages` when present, fall back to `ResponseMessages` with adapter

## 4. Dual-write verification

- [ ] 4.1 Verify `responseMessagesV1` is populated from protocol messages (now direct, no conversion needed)
- [ ] 4.2 Verify `messages` metadata is populated via `protocolToOpenAIJSON`
- [ ] 4.3 Verify both outputs are equivalent to pre-change behavior

## 5. Testing

- [ ] 5.1 Unit tests for `protocolToOpenAIJSON` covering text, tool calls, tool results, multi-part content
- [ ] 5.2 Comparison tests: new path output vs. old path output for identical inputs
- [ ] 5.3 Integration tests for handler with protocol-message-producing agents
- [ ] 5.4 Integration tests for handler with legacy OpenAI-message-producing agents (adapter path)
- [ ] 5.5 Run existing handler and e2e tests to verify no regressions

## 6. Semantic fidelity alignment

- [ ] 6.1 Align handler conversion rules with memory required-lossless conversion matrix
- [ ] 6.2 Add attribution mapping fixtures for protocol extension semantics <-> OpenAI compatibility fields
- [ ] 6.3 Add tests asserting deterministic behavior for documented compatibility-only lossy mappings

## 7. Native-first extension scope alignment

- [ ] 7.1 Document that handler introduces no additional history/callback-loop extension contracts for current scope
- [ ] 7.2 Add assertions that compatibility fields are derived from canonical protocol semantics (including extension attribution)

## 8. Risk-tracked actions

- [ ] 8.1 Decide whether to add static analysis (linter rule or code review check) to prevent accidental direct access to deprecated OpenAI-first `ExecutionResult` fields (risk: Result complexity)
