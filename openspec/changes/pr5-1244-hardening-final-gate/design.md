# PR5 Hardening and Final Gate Design

## Decision

Fallback from streaming A2A execution to blocking execution only when no stream chunks were emitted. If chunks were already emitted, fail fast and surface the error.

## Runtime Guards

- Streaming guard:
  - count successful streamed chunks
  - fallback allowed only at zero chunks emitted
- Team guard:
  - explicit error when member returns nil result
- Selector guard:
  - assistant label defaults to `assistant` when metadata name is missing

## Final Gate

- Focused completions hardening tests run and pass.
- OpenSpec changes validate cleanly for the linear PR sequence.
