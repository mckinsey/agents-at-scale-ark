# Aggregation Smoke Test

Validates the aggregation layer plumbing: API discovery, storage round-trip, and watch routing.

## What it tests
- API resource discovery via `ark.mckinsey.com` API group
- Create and read-back a Model resource (storage round-trip)
- Watch stream receives events for new resources (watch routing)

## Running
```bash
chainsaw test tests/aggregation-smoke/
```

Successful completion confirms the aggregation layer correctly routes API requests, persists resources, and delivers watch events.
