## Context

The completions engine's agent and team orchestration layer uses `Message` (an alias for `openai.ChatCompletionMessageParamUnion`) throughout. `TeamMember.Execute`, `Agent.executeLocally`, and `Agent.prepareMessages` all accept and return this type. To allow future engines (or a refactored completions engine) to work with protocol messages internally, we introduce parallel protocol-typed interfaces and bridge adapters.

## Goals / Non-Goals

**Goals:**
- Protocol-typed agent/team interface that can coexist with the existing OpenAI-typed interface
- Adapters that allow gradual adoption without breaking existing implementations
- Team orchestration logic works with either interface variant

**Non-Goals:**
- Rewriting the internal OpenAI API call path (provider interaction stays OpenAI-typed)
- Removing the `Message` type alias or `TeamMember` interface
- Changing `ExecutionResult` structure

## Decisions

### 1. Parallel `ProtocolTeamMember` interface

**Decision**: Define `ProtocolTeamMember` with `Execute(ctx, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)`.

**Rationale**: A separate interface avoids breaking the existing `TeamMember` contract. Implementations can satisfy either or both interfaces.

### 2. Adapter-based bridging

**Decision**: Provide `TeamMemberAdapter` (wraps `TeamMember` to satisfy `ProtocolTeamMember`) and `ProtocolTeamMemberAdapter` (wraps `ProtocolTeamMember` to satisfy `TeamMember`). Adapters convert between `Message` and `protocol.Message` at each call boundary.

**Rationale**: This allows team orchestration to be written against one interface while supporting implementations of either type. The conversion happens once per call, not per message.

### 3. Shared dispatcher in team orchestration

**Decision**: Team orchestration files (`team.go`, `team_graph.go`, `team_selector.go`) use a dispatcher function that detects which interface a member implements and calls accordingly, preferring `ProtocolTeamMember` when available.

**Rationale**: Centralizes the interface detection logic. As more members adopt `ProtocolTeamMember`, the adapter path is exercised less frequently.

### 4. Canonical team attribution semantics

**Decision**: Team/member attribution is represented as extension-scoped semantics on protocol messages with a stable schema. OpenAI `assistant.name` remains a compatibility mapping only.

**Rationale**: `Message.role` captures actor class (`user`/`agent`) but not specific member provenance in multi-agent loops. Extension-scoped attribution prevents hidden metadata contracts and keeps selector/team history behavior deterministic.
This mitigates the `Team member identity semantics` risk with schema fields `member.name`, `member.type`, and optional `member.path`.

### 5. Native-first scope around teams/history/callback loops

**Decision**: This change introduces extension semantics only for team/member attribution. History flow and callback-loop semantics remain on native A2A task/message constructs unless future gaps are demonstrated.

**Rationale**: Keeping extension scope narrow prevents unnecessary contract surface area and aligns with protocol portability goals.

### 6. Capability verification linkage

**Decision**: Team-attribution semantics include a controller-side Agent Card capability check. Missing extension declarations are handled with `soft_fail_warn` and dispatch continues.

**Rationale**: Mixed deployments require observability without hard breaks; telemetry-backed soft-fail behavior supports staged migration.

## Risks

**[Conversion overhead]** — Converting messages at each team member call adds CPU cost. Mitigation: the conversion is lightweight (JSON marshal/unmarshal of message content) and team member calls already involve network/LLM latency.

**[Interface proliferation]** — Two parallel interfaces increases API surface. Mitigation: once all members implement `ProtocolTeamMember`, the `TeamMember` interface becomes part of the compatibility layer, not the active path.

**[Attribution drift]** — Team member identity may diverge between protocol and OpenAI paths. Mitigation: canonical extension schema with explicit mapping rules and parity tests.
