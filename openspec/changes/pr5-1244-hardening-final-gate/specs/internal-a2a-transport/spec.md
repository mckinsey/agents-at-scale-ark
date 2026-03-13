## MODIFIED Requirements

### Requirement: Safe streaming fallback behavior for A2A execution
Ark SHALL fallback from streaming A2A execution to blocking execution only when streaming failed before any chunk was emitted.

#### Scenario: Streaming fails before first chunk
- **WHEN** A2A streaming returns an error and zero chunks were emitted
- **THEN** execution falls back to blocking A2A execution

#### Scenario: Streaming fails after chunk emission
- **WHEN** A2A streaming returns an error after one or more chunks were emitted
- **THEN** execution returns the streaming error and does not execute blocking fallback
