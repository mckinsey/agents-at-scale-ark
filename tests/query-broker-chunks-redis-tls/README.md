# query-broker-chunks-redis-tls

Verifies that completion chunks are stored and served from Redis Streams over TLS, proving the broker chart mounts the CA certificate and connects via `rediss://`.

## What it tests

- Deploys Redis with TLS enabled and ark-broker configured against it, with the CA cert mounted from a secret
- Runs a query end-to-end and asserts the chunk stream endpoint serves its chunks over the TLS connection
- Cross-replica: a chunk written to one replica is readable from another, so live streaming still works across pod boundaries when the transport is TLS

## Running

Set the broker image vars if testing against a locally built image:

```bash
export ARK_BROKER_IMAGE=ark-broker
export ARK_BROKER_IMAGE_TAG=<tag>
chainsaw test
```

Successful completion validates the TLS variant of `query-broker-chunks-redis` — the same chunk storage and fan-out, but over `rediss://` with chart-supplied trust.
