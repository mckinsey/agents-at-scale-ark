# Controller Response Boundary Tasks

## 1. Remove OpenAI reconstruction from controller

- [ ] 1.1 Remove `protocolMessagesToRawJSON` and related helper functions from `query_controller.go`
- [ ] 1.2 Remove OpenAI type imports from response processing path
- [ ] 1.3 Verify no remaining OpenAI type usage in controller response handling

## 2. Opaque response pass-through

- [ ] 2.1 Rewrite `extractResponseMessages` to read `messages` from A2A metadata as `json.RawMessage`
- [ ] 2.2 Implement `buildFallbackRaw` for cases where executor does not provide `messages` metadata
- [ ] 2.3 Track `responseMessagesV1` presence in response without converting its contents

## 3. Handler-side conversion

- [ ] 3.1 Implement `openAIToProtocolResponseMessages` in `completions/handler.go` for full-fidelity conversion
- [ ] 3.2 Update `buildA2AResponse` to dual-write both `responseMessagesV1` and `messages` metadata
- [ ] 3.3 Use DataParts for tool calls and structured content in protocol messages

## 4. Metadata merge

- [ ] 4.1 Implement `extractArkPayloadMap` merging metadata from all registry extensions (after Step 1, metadata keys come from `registry.Get()`; include `ExecutionContextExtensionURI` if present per `extension-isolation-architecture` task 7.1 disposition)
- [ ] 4.2 Add generic extension helpers to `ark/internal/a2a/extensions.go` (helpers use registry for metadata key discovery)

## 5. Testing

- [ ] 5.1 Unit tests for `extractResponseMessages` with both legacy and protocol-native responses
- [ ] 5.2 Unit tests for `buildFallbackRaw` covering text-only and missing content cases
- [ ] 5.3 Unit tests for metadata merge with overlapping and disjoint sources
- [ ] 5.4 E2E verification that `response.raw` and `responseMessagesV1` are both populated correctly

## 6. Metadata precedence governance

- [ ] 6.1 Document and implement explicit metadata precedence table for merge conflicts
- [ ] 6.2 Emit structured conflict telemetry (key, winner, loser, query context)
- [ ] 6.3 Add tests validating deterministic precedence and telemetry output

## 7. Capability verification and soft-fail policy

Depends on: `extension-isolation-architecture` (Step 1) for `registry.AgentCardDeclarations()`. Escalation threshold governance is owned by `compat-lifecycle-management` (Step 9) task 7.4.

- [ ] 7.1 Add/validate controller-adjacent Agent Card extension capability verifier integration points (uses registry from Step 1)
- [ ] 7.2 Emit `soft_fail_warn` telemetry for missing extension declarations at dispatch
- [ ] 7.3 Add tests for deterministic warning behavior (dispatch continues, telemetry emitted)

## 8. Risk-tracked actions

- [ ] 8.1 Document fallback policy scope: when `buildFallbackRaw` is acceptable vs when missing `messages` metadata is an executor bug (risk: Fallback fidelity)
