# Query Timeout Tool Test

Exercises the query-with-timeout + slow-tool path end-to-end.

## What it tests
- A slow HTTP tool (5s delay) completes within a query's configured timeout
- The full path: controller → A2A client → completions executor → tool call → response

## Limitations
This test does not strictly regress the bug fixed in `query_controller.go` (where `CreateA2AClient` was called before `context.WithTimeout`, causing a hard 5-minute default). Reproducing that bug requires a tool sleep > 5 minutes, which is impractical for CI. The test validates the code path but passes with both old and new code.

## Running
```bash
chainsaw test
```
