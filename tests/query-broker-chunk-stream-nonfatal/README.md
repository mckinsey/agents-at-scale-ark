# Chunk-stream failure is non-fatal and still terminates the stream

Validates that a broken chunk stream neither fails the query nor leaves streaming
consumers hanging.

## What it tests
- A fault proxy sits between the completions executor and the broker: it forwards
  the completion POST but severs the executor's chunk-stream write, forcing the
  executor's abandon latch.
- **Query succeeds**: it still reaches `phase: done` with a response despite every
  chunk write failing.
- **Fault actually fired**: the proxy logged breaking the chunk stream, so the
  abandon path was genuinely exercised (guards against a false green).
- **Stream is terminated**: the broker stream carries the `[DONE]` terminal, so a
  consumer is not left hanging. This requires both fixes — the executor always
  sending the completion signal after abandonment, and the broker storing `[DONE]`
  on completion even when no chunks ever landed.

## Running
```bash
chainsaw test
```

Passing confirms a mid-query chunk-stream failure is non-fatal and the broker
stream is always terminated for consumers.
