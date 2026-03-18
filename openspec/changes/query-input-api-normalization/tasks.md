# Query Input API Normalization Tasks

## 1. Protocol-typed accessors

- [ ] 1.1 Implement `GetProtocolInputMessages() ([]protocol.Message, error)` on `QuerySpec`
- [ ] 1.2 Implement `SetProtocolInputMessages([]protocol.Message) error` on `QuerySpec`
- [ ] 1.3 Implement raw-JSON-to-protocol-message conversion handling roles, text content, tool calls (as DataParts), and tool results

## 2. Engine integration

- [ ] 2.1 Update `completions/query_parameters.go` `GetQueryInputMessages` to optionally delegate to `GetProtocolInputMessages` internally
- [ ] 2.2 Add deprecation doc comments to `GetInputMessages` / `SetInputMessages`

## 3. Testing

- [ ] 3.1 Round-trip tests: `SetInputMessages` → `GetProtocolInputMessages` produces equivalent content
- [ ] 3.2 Round-trip tests: `SetProtocolInputMessages` → `GetInputMessages` produces equivalent content
- [ ] 3.3 Edge case tests: empty messages, tool-call messages, multi-part content arrays
- [ ] 3.4 Run existing query controller and completions tests to verify no regressions

## 4. Risk-tracked actions

- [ ] 4.1 Document preserved-field inventory: which OpenAI-only fields must survive protocol round-trip for compatibility consumers (risk: Conversion fidelity)
