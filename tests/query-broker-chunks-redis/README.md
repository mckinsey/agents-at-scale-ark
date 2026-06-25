# query-broker-chunks-redis

Verifies that completion chunks are stored and served from Redis Streams when the broker runs with `backends.chunk=redis`.

## What it tests
- Deploys a dedicated ark-redis-dev instance and ark-broker (with `backends.chunk=redis`) in the test namespace
- Runs a query end-to-end against the Redis-backed broker
- Asserts the query completes and the chunk stream endpoint returns a complete marker

## Running

Set the broker image vars if testing against a locally built image:

```bash
export ARK_BROKER_IMAGE=ark-broker
export ARK_BROKER_IMAGE_TAG=<tag>
chainsaw test tests/query-broker-chunks-redis
```

Successful completion confirms the full pipeline (controller → executor → Redis-backed broker) works with the chunk backend.
