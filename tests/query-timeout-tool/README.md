# Query Timeout Tool Test

Tests that query `spec.timeout` propagates to the A2A client, allowing slow tool calls to complete instead of failing at the default 5-minute timeout.

## What it tests
- A slow HTTP tool (5s delay) completes within a query's configured timeout
- Query timeout propagates through the controller to the A2A HTTP client
- Regression test for the fix in query_controller.go where CreateA2AClient was called before context.WithTimeout

## Running
```bash
chainsaw test
```

Successful completion confirms the query timeout reaches the A2A transport layer.
