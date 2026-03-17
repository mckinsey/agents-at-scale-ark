# Memory Protocol Messages Tasks

## 1. Interface extension

- [ ] 1.1 Add `AddProtocolMessages(ctx, queryID string, messages []protocol.Message) error` to `MemoryInterface`
- [ ] 1.2 Add `GetProtocolMessages(ctx) ([]protocol.Message, error)` to `MemoryInterface`

## 2. HTTP memory implementation

- [ ] 2.1 Implement `AddProtocolMessages` in `memory_http.go` converting protocol messages to wire JSON
- [ ] 2.2 Implement `GetProtocolMessages` in `memory_http.go` converting wire JSON to protocol messages
- [ ] 2.3 Ensure cross-method interoperability (protocol-stored → OpenAI-retrieved and vice versa)

## 3. No-op memory implementation

- [ ] 3.1 Implement `AddProtocolMessages` in `memory_noop.go` as a no-op returning nil
- [ ] 3.2 Implement `GetProtocolMessages` in `memory_noop.go` returning empty slice

## 4. Testing

- [ ] 4.1 Unit tests for HTTP implementation: store via protocol methods, retrieve via OpenAI methods
- [ ] 4.2 Unit tests for HTTP implementation: store via OpenAI methods, retrieve via protocol methods
- [ ] 4.3 Unit tests for protocol message round-trip (store and retrieve via protocol methods)
- [ ] 4.4 Unit tests for DataParts preservation in protocol path
- [ ] 4.5 Run existing memory tests to verify no regressions
