# Agent/Team Protocol Messages Tasks

## 1. Protocol interfaces and types

- [ ] 1.1 Define `ProtocolTeamMember` interface in `types.go`
- [ ] 1.2 Implement `TeamMemberAdapter` (wraps `TeamMember` -> `ProtocolTeamMember`)
- [ ] 1.3 Implement `ProtocolTeamMemberAdapter` (wraps `ProtocolTeamMember` -> `TeamMember`)

## 2. Agent protocol methods

- [ ] 2.1 Implement `executeLocallyProtocol` on `Agent` operating on `protocol.Message`
- [ ] 2.2 Implement `prepareMessagesProtocol` on `Agent` operating on `protocol.Message`
- [ ] 2.3 Bridge adapter between `executeLocallyProtocol` and the existing OpenAI API call path

## 3. Team orchestration dispatch

- [ ] 3.1 Implement dispatcher function in `team.go` detecting and calling the preferred interface
- [ ] 3.2 Update `team_graph.go` graph execution to use the dispatcher
- [ ] 3.3 Update `team_selector.go` selection logic to use the dispatcher

## 4. Message conversion utilities

- [ ] 4.1 Implement `openAIToProtocolMessage` conversion (single message)
- [ ] 4.2 Implement `protocolToOpenAIMessage` conversion (single message)
- [ ] 4.3 Handle edge cases: tool calls, tool results, system messages, multi-part content

## 5. Testing

- [ ] 5.1 Unit tests for adapter bidirectional conversion round-trips
- [ ] 5.2 Unit tests for dispatcher selecting correct interface
- [ ] 5.3 Integration tests for mixed teams (some members `TeamMember`, some `ProtocolTeamMember`)
- [ ] 5.4 Run existing team and agent tests to verify no regressions

## 6. Team attribution usage contract

Schema definition and package creation are owned by `extension-isolation-architecture` (Step 1, task 3). This section covers how the schema is applied in team orchestration.

- [ ] 6.1 Document how `team-attribution/v1` payload (`member.name`, `member.type`, `member.path`) is populated in protocol team history and selector inputs
- [ ] 6.2 Apply attribution schema to protocol team message accumulation and selector dispatch
- [ ] 6.3 Add adapter mapping tests for attribution semantics <-> OpenAI `assistant.name`

## 7. Native-first scope and capability checks

Capability verifier implementation is owned by `extension-isolation-architecture` (Step 1, task 4) + `controller-response-boundary` (Step 3, task 7). This section covers team-specific integration expectations.

- [ ] 7.1 Document that history and callback-loop semantics remain native A2A for this step (no additional extension contract)
- [ ] 7.2 Verify controller capability verification includes `team-attribution/v1` in required-extension set for team dispatch contexts
- [ ] 7.3 Add soft-fail telemetry assertions for missing team attribution declaration in mixed deployments

## 8. Risk-tracked actions

- [ ] 8.1 Decide whether conversion-overhead telemetry (counter/histogram at adapter call sites) is needed for team execution paths (risk: Conversion overhead)
