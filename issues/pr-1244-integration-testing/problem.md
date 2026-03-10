# Feature: PR #1244 A2A Native Execution Integration Test Suite

**Status**: OPEN
**Type**: FEATURE
**Priority**: High
**Location**: `ark/internal/genai/` (test files)

## Problem Description

PR #1244 (`feat/a2a-native-execution-main-sync`) requires additional integration tests to demonstrate no-regret behavior for streaming and team history propagation. While remediation code exists for identified regressions (streaming payload wrapping, metadata projection, team history propagation, selector behavior, OTEL instrumentation), reviewer confidence depends on explicit end-to-end integration tests that prove these behaviors hold under realistic conditions.

The testing plan defines three workstreams:

1. **Workstream A**: Incremental chunk streaming integration validation
2. **Workstream B**: Team conversation full-history integration validation
3. **Workstream C**: External A2A TCK compliance spike

This problem definition focuses on Workstreams A and B, which require new Go integration tests. Workstream C (TCK spike) is a separate exploratory activity documented in `vibe_artifacts/`.

## Impact / Benefits

- **Reviewer confidence**: Demonstrates streaming and history behavior through integration tests, not just unit assertions
- **Regression detection**: Tests explicitly fail on single-buffer fallback, metadata loss, truncation, reorder, or dedupe overreach
- **PR readiness**: Provides evidence artifacts required for PR approval
- **Anti-flake design**: Tests use deterministic fixtures and sequence assertions over time-dependent behavior
- **Documentation**: Maps each test to the regression it prevents

## Code Analysis

### Current Streaming Test Coverage

The existing streaming integration test (`a2a_streaming_integration_test.go`) validates basic streaming behavior:

```go
// ark/internal/genai/a2a_streaming_integration_test.go:99-132
func TestStreamA2AAgentIntegrationCompat(t *testing.T) {
    testServer := startStreamingTestServer(t)
    defer testServer.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()

    userInput, convErr := OpenAIToA2AMessage(NewUserMessage("hello"))
    require.NoError(t, convErr)
    events, err := StreamA2AAgent(ctx, nil, testServer.URL, nil, "", userInput, nil, "test-agent", "", nil)
    require.NoError(t, err)

    engine := &A2AExecutionEngine{}
    stream := &fakeEventStream{}
    response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)
    require.NoError(t, err)

    assert.Contains(t, response.Content, "delta")
    foundArtifact := false
    foundStatus := false
    for _, chunk := range stream.chunks {
        wrapped, ok := chunk.(ChunkWithMetadata)
        require.True(t, ok)
        require.NotNil(t, wrapped.Ark)
        if _, ok := wrapped.Ark.A2A.(*protocol.TaskArtifactUpdateEvent); ok {
            foundArtifact = true
        }
        if status, ok := wrapped.Ark.A2A.(*protocol.TaskStatusUpdateEvent); ok && status.Status.State == protocol.TaskStateWorking {
            foundStatus = true
        }
    }
    assert.True(t, foundArtifact)
    assert.True(t, foundStatus)
}
```

**Gap**: The test validates individual event types but does not explicitly assert:
- Multiple chunks before terminal completion (incremental, not buffered)
- OpenAI-compatible envelope shape (`choices[].delta`)
- Event ordering (working/progress before completed)

### Current Team History Test Coverage

The team test (`team_test.go`) validates tool-call pairing continuity:

```go
// ark/internal/genai/team_test.go:131-198
func TestTeamExecuteA2ASequentialPreservesPriorMemberToolPairing(t *testing.T) {
    memberOne := &a2aRecordingTeamMember{
        name: "member-one",
        output: []protocol.Message{
            protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
                []protocol.Part{protocol.NewTextPart("calling tool")},
                ToolCallsPayloadV1{...},
            )),
            protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
                []protocol.Part{protocol.NewTextPart(`{"city":"london"}`)},
                ToolResultPayloadV1{...},
            )),
        },
    }
    memberTwo := &a2aRecordingTeamMember{...}

    team := &Team{...}
    result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)
    require.NoError(t, err)
    require.Len(t, memberTwo.seenHistory, 2)
    // Validates tool call ID continuity
}
```

**Gap**: The test validates tool-call pairing but does not explicitly assert:
- Full expected history length exactness
- Message role/content sequence invariants
- Multi-turn accumulation scenarios

### Existing Test Infrastructure

The codebase provides mock types for deterministic testing:

```go
// ark/internal/genai/a2a_execution_test.go:13-28
type fakeEventStream struct {
    chunks []interface{}
}

func (f *fakeEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
    f.chunks = append(f.chunks, chunk)
    return nil
}

// ark/internal/genai/team_test.go:78-103
type a2aRecordingTeamMember struct {
    name        string
    output      []protocol.Message
    seenHistory []protocol.Message
}

func (m *a2aRecordingTeamMember) ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
    m.seenHistory = append([]protocol.Message{}, history...)
    return &ExecutionResult{A2AMessages: m.output}, nil
}
```

### Streaming Test Server

The existing `streamingTestProcessor` provides deterministic A2A streaming behavior:

```go
// ark/internal/genai/a2a_streaming_integration_test.go:16-69
type streamingTestProcessor struct{}

func (p *streamingTestProcessor) ProcessMessage(ctx context.Context, message protocol.Message, options taskmanager.ProcessOptions, handler taskmanager.TaskHandler) (*taskmanager.MessageProcessingResult, error) {
    // Creates task, emits working status, artifact, then completed status
    if options.Streaming {
        go func() {
            defer subscriber.Close()
            _ = handler.UpdateTaskState(&taskID, protocol.TaskStateWorking, nil)
            artifact := protocol.Artifact{...}
            _ = handler.AddArtifact(&taskID, artifact, true, false)
            statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
                protocol.NewTextPart("done"),
            })
            _ = handler.UpdateTaskState(&taskID, protocol.TaskStateCompleted, &statusMessage)
        }()
        return &taskmanager.MessageProcessingResult{StreamingEvents: subscriber}, nil
    }
    // Non-streaming path...
}
```

## Related Files

- `ark/internal/genai/a2a_streaming_integration_test.go` - Existing streaming integration test (needs extension)
- `ark/internal/genai/a2a_execution_test.go` - Streaming consumption tests (envelope assertions may be added)
- `ark/internal/genai/team_test.go` - Team history tests (needs history validation scenarios)
- `ark/internal/genai/agent_tools_test.go` - Merge/dedupe boundary tests
- `ark/internal/genai/a2a_execution.go:153-184` - `consumeA2AStreamEvents` implementation
- `ark/internal/genai/a2a_execution.go:472-491` - `wrapA2AEventForStreaming` wrapper
- `ark/internal/genai/team.go:64-96` - `ExecuteA2A` implementation
- `ark/internal/genai/team.go:284-321` - `executeMemberAndAccumulateA2A` history propagation

## Proposed Implementation

### Workstream A: Incremental Chunk Streaming Integration

**Target File**: `ark/internal/genai/a2a_streaming_integration_test.go`

#### Scenario A1: Incremental Emission Sequence

Add test that explicitly validates multi-chunk behavior:

```go
func TestStreamA2AAgentIntegrationEmitsMultipleChunks(t *testing.T) {
    // Use existing startStreamingTestServer
    // Assert: len(stream.chunks) > 1 before terminal state
    // Assert: at least one intermediate artifact/status before completion
    // Assert: no single-buffer collapse
}
```

**Regression prevented**: Stream emits only a single terminal chunk (buffered fallback).

#### Scenario A2: Compatibility Envelope Integrity

Add test for OpenAI-compatible envelope shape:

```go
func TestStreamA2AAgentIntegrationPreservesEnvelopeShape(t *testing.T) {
    // Assert: each chunk is ChunkWithMetadata
    // Assert: chunk.Choices[].Delta path exists (OpenAI compat)
    // Assert: chunk.Ark.A2A payload present
    // Assert: chunk.Ark metadata includes agent/team/model when context set
}
```

**Regression prevented**: Delta envelope shape regresses, `ark.a2a` metadata missing.

#### Scenario A3: Ordering and State Progression

Add test for event ordering coherence:

```go
func TestStreamA2AAgentIntegrationMaintainsEventOrder(t *testing.T) {
    // Track event sequence: working -> artifact -> completed
    // Assert: working/progress observed before completed
    // Assert: content-bearing updates not reordered behind completion
}
```

**Regression prevented**: Event reordering that could confuse stream consumers.

### Workstream B: Team Conversation Full-History Integration

**Target File**: `ark/internal/genai/team_test.go`

#### Scenario B1: Sequential Member Handoff (Single Turn)

Add test with explicit history length and content assertions:

```go
func TestTeamExecuteA2ASequentialFullHistoryHandoff(t *testing.T) {
    memberOne := &a2aRecordingTeamMember{
        name:   "member-one",
        output: []protocol.Message{msg1, msg2, msg3},
    }
    memberTwo := &a2aRecordingTeamMember{...}

    team := &Team{...}
    result, err := team.ExecuteA2A(ctx, userInput, nil, nil, nil)

    // Assert: memberTwo.seenHistory has exact expected length
    // Assert: history order matches memberOne output order
    // Assert: no messages truncated or added
    require.Len(t, memberTwo.seenHistory, 3)
    assert.Equal(t, extractText(memberTwo.seenHistory[0]), extractText(msg1))
    assert.Equal(t, extractText(memberTwo.seenHistory[1]), extractText(msg2))
    assert.Equal(t, extractText(memberTwo.seenHistory[2]), extractText(msg3))
}
```

**Regression prevented**: History truncation, message reordering.

#### Scenario B2: Tool-Call Continuity (Enhanced)

Extend existing test with stricter assertions:

```go
func TestTeamExecuteA2ASequentialToolCallPairIntegrity(t *testing.T) {
    // Existing memberOne with tool-call + tool-result
    // Add: multiple tool calls in sequence
    // Assert: all call IDs preserved in member2 history
    // Assert: assistant/tool message pairing maintained
}
```

**Regression prevented**: Tool-call/tool-result association breaks.

#### Scenario B3: Multi-Turn Accumulation

Add test for cumulative history across turns:

```go
func TestTeamExecuteA2ASequentialMultiTurnAccumulation(t *testing.T) {
    // Execute first turn
    result1, _ := team.ExecuteA2A(ctx, userInput, nil, nil, nil)

    // Execute second turn with first turn output as history
    result2, _ := team.ExecuteA2A(ctx, userInput2, result1.A2AMessages, nil, nil)

    // Assert: second turn members see all prior messages
    // Assert: cumulative length is first turn + second turn messages
}
```

**Regression prevented**: Multi-turn history loss.

### Test Design Principles

All new tests must follow:

1. **Deterministic fixtures**: Use in-memory task manager, mocked members
2. **No time dependencies**: Sequence/count assertions, not sleep thresholds
3. **Clear terminal conditions**: Tests complete when expected assertions verified
4. **Explicit failure modes**: Each test documents what regression it catches

## Test Requirements

### Workstream A Acceptance Gate

Pass when all are true:
- Incremental multi-chunk behavior proven (>1 chunk before terminal)
- OpenAI envelope shape validated (`choices[].delta`)
- ARK metadata present (`ark.a2a`, `ark.agent`, `ark.team`)
- Event ordering coherent (working before completed)

Fail when any are true:
- Single-chunk buffered behavior passes undetected
- Envelope/metadata regressions not detected

### Workstream B Acceptance Gate

Pass when all are true:
- Full expected history reaches downstream member
- Order and tool pairing integrity validated
- Multi-turn accumulation works correctly
- No external network dependency

Fail when any are true:
- Expected messages missing or reordered
- Tool-call/tool-result pairing breaks silently

### Evidence Requirements

For each workstream:
1. Green focused `go test` output for new tests
2. One note per test describing the regression it prevents
3. Link to exact test function names in PR discussion

## Third-Party Solutions

**Existing Libraries/Tools**:
- `trpc.group/trpc-go/trpc-a2a-go/taskmanager` - Memory task manager for deterministic streaming tests (already used)
- `trpc.group/trpc-go/trpc-a2a-go/server` - Test server creation (already used)
- `github.com/stretchr/testify` - Test assertions (already used)

**Recommendation**: Continue using existing test infrastructure
**Rationale**: Current mock types and in-memory task manager provide deterministic behavior without external dependencies

## Historical Context

### Related Commits

- `a7779d32` - fix: address PR #1244 review regressions in streaming, teams, and telemetry
- `7fbfb6f5` - feat: add stream resumption, edge adapters, model adapters, and observability
- `d70519da` - feat: add native A2A streaming support

### Related Documents

- `vibe_artifacts/pr-1244-further-testing-action-items.md` - Full testing plan
- `vibe_artifacts/pr-1244-second-review-brief.md` - Remediation mapping
- `docs/web/a2a-tck-research-2026-03-04.md` - TCK research for Workstream C

### PR Context

PR #1244 (`feat/a2a-native-execution-main-sync`) implements A2A-native execution as the internal canonical transport. Review feedback identified regressions in:
1. Streaming chunk incrementality
2. Team metadata visibility in streams
3. Team conversation history propagation
4. Selector first-turn behavior
5. OTEL input/output recording

Remediation code has been implemented but reviewer confidence requires integration-level evidence.

## Success Criteria

### Phase 1: Workstream A Complete

1. `TestStreamA2AAgentIntegrationEmitsMultipleChunks` passes
2. `TestStreamA2AAgentIntegrationPreservesEnvelopeShape` passes
3. `TestStreamA2AAgentIntegrationMaintainsEventOrder` passes
4. All tests use deterministic fixtures (no external services)
5. Each test documents what regression it prevents

### Phase 2: Workstream B Complete

1. `TestTeamExecuteA2ASequentialFullHistoryHandoff` passes
2. `TestTeamExecuteA2ASequentialToolCallPairIntegrity` passes
3. `TestTeamExecuteA2ASequentialMultiTurnAccumulation` passes
4. All tests use mocked team members (no external services)
5. Each test documents what regression it prevents

### PR Readiness

1. All Workstream A and B tests pass on focused `go test` run
2. Evidence artifacts linked in PR discussion
3. Regression coverage statement provided
4. `make test` passes in `ark/` directory

## Additional Context

- Source plan: `vibe_artifacts/pr-1244-further-testing-action-items.md`
- Remediation brief: `vibe_artifacts/pr-1244-second-review-brief.md`
- Branch: `feat/a2a-native-execution-main-sync`
- PR: #1244
- Workstream C (A2A TCK spike) is documented separately and does not block PR merge if Workstreams A and B pass
