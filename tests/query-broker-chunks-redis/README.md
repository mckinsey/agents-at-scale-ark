# query-broker-chunks-redis

Verifies that completion chunks are stored and served from Redis Streams when the broker runs with `backends.chunk=redis`, including cross-replica fan-out.

## What it tests
- Deploys ark-redis-dev and ark-broker (`backends.chunk=redis`, `replicaCount=2`) in the test namespace
- Runs a query end-to-end; asserts completion and the chunk stream endpoint returns a complete marker
- Cross-replica: writes a chunk directly to replica A, reads it back from replica B — proves live streaming works across pod boundaries

## Running

Set the broker image vars if testing against a locally built image:

```bash
export ARK_BROKER_IMAGE=ark-broker
export ARK_BROKER_IMAGE_TAG=<tag>
chainsaw test tests/query-broker-chunks-redis
```

Successful completion confirms the full pipeline (controller → executor → Redis-backed broker, 2 replicas) works with the chunk backend.
