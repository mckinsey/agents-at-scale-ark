# Ark Broker

Event bus for Ark cluster communication. Stores messages, chunks, traces, events, and sessions. Default backend is in-memory; messages and events can be persisted to Postgres, and completion chunks to Redis Streams.

## Quickstart

```bash
# Show available commands.
make help

# Deploy to configured cluster (default: in-memory backend).
devspace deploy

# Run in-cluster dev mode.
devspace dev

# Run with Postgres message backend.
BROKER_MESSAGE_BACKEND=postgres devspace dev

# Run with Postgres event backend.
BROKER_EVENT_BACKEND=postgres devspace dev

# Run with Redis chunks backend.
BROKER_CHUNK_BACKEND=redis devspace dev

# All backends active at once (profiles are combinable).
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_CHUNK_BACKEND=redis devspace dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server bind address |
| `REQUEST_TIMEOUT_MS` | `0` | HTTP request timeout in milliseconds. Default is no timeout (`0`). |
| `MAX_MESSAGES` | `0` | Max messages to persist (0 = unlimited) |
| `MAX_CHUNKS` | `0` | Max stream chunks to persist (0 = unlimited) |
| `MAX_SPANS` | `0` | Max trace spans to persist (0 = unlimited) |
| `MAX_EVENTS` | `0` | Max events to persist (0 = unlimited) |
| `MESSAGE_BACKEND` | `memory` | Message storage backend: `memory` or `postgres` |
| `EVENT_BACKEND` | `memory` | Event storage backend: `memory` or `postgres` |
| `DATABASE_URL` | — | Postgres connection string. Required when `MESSAGE_BACKEND=postgres` or `EVENT_BACKEND=postgres`. Both backends share the same pool. |
| `DATABASE_POOL_MAX` | `10` | Max connections in the pool |
| `DATABASE_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | Per-statement timeout |
| `MESSAGE_VISIBILITY_TTL_SECONDS` | `2592000` | Default message TTL (30 days) |
| `EVENT_VISIBILITY_TTL_SECONDS` | `2592000` | Default event TTL (30 days) |
| `DATABASE_DEBUG_QUERIES` | `false` | Log SQL queries at debug level (SQL text + param count, never values) |
| `DATABASE_SSL_ROOT_CERT_PATH` | — | Path to the Postgres CA certificate file. When set, the broker passes it to the Postgres driver for server certificate verification. Set automatically by the Helm chart when `database.tls.enabled=true`. |
| `CHUNK_BACKEND` | `memory` | Completion chunk storage backend: `memory` or `redis` |
| `REDIS_URL` | — | Redis connection string. Required when `CHUNK_BACKEND=redis`. Use `redis://` for plain or `rediss://` for TLS. |
| `REDIS_USERNAME` | — | Redis ACL username (optional) |
| `REDIS_PASSWORD` | — | Redis password (optional) |
| `REDIS_TLS_CA_CERT_PATH` | — | Path to CA certificate for TLS connections with self-signed certs. Set automatically by the Helm chart when `redis.tls.enabled=true`. |
| `REDIS_KEY_PREFIX` | `ark-broker` | Prefix for all Redis keys |
| `REDIS_STREAM_TTL_SECONDS` | `3600` | TTL applied to per-query chunk streams |
| `REDIS_CONNECT_TIMEOUT_MS` | `10000` | Redis connection timeout |
| `REDIS_DEBUG_COMMANDS` | `false` | Log Redis connection lifecycle events at debug level (never logs payloads) |

## Database backend (messages and events)

Messages and operation events can survive pod restarts by opting in to Postgres storage. Both backends share a single `DATABASE_URL` and connection pool. You can enable one or both independently.

### Local development with devspace

```bash
# Messages only.
BROKER_MESSAGE_BACKEND=postgres devspace dev

# Events only.
BROKER_EVENT_BACKEND=postgres devspace dev

# Both.
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres devspace dev
```

Activating either backend (or both) triggers the shared `postgres-infra` DevSpace profile, which:
- Deploys `ark-storage-dev` (Postgres 16-alpine, service `ark-storage-dev`, database `ark`) in the `default` namespace and waits for it to be ready.
- Builds the `ark-broker-migrate` init container image locally.
- Sets `DATABASE_URL=postgres://postgres:arkdev123@ark-storage-dev:5432/ark?sslmode=disable` on the broker deployment.
- Runs `golang-migrate` as an init container before the broker starts.

The same vars work standalone: `BROKER_MESSAGE_BACKEND=postgres devspace deploy`.

### Enabling in Helm

```yaml
backends:
  message: postgres   # or: event: postgres, or both
  event: postgres

database:
  url: "postgres://user:password@host:5432/ark_broker"
```

The chart deploys a `migrate/migrate` init container that applies all pending migrations before the broker starts. The `messages` and `events` tables share the same schema.

### Running migrations locally

Install the [`migrate` CLI](https://github.com/golang-migrate/migrate) then:

```bash
export DATABASE_URL="postgres://user:password@localhost:5432/ark_broker"

make db-migrate-up       # apply all pending migrations
make db-migrate-down     # roll back the last migration
make db-migrate-version  # print current schema version

# Create a new migration pair
make db-migrate-create NAME=add_index
```

### Integration tests

The Postgres integration tests use Testcontainers and run automatically with `make test`. No local Postgres required.

To skip them (e.g. in environments without Docker):

```bash
SKIP_INTEGRATION=true make test
```

## Redis chunks backend

Completion chunks are held in-memory by default. With `CHUNK_BACKEND=redis` they are stored in Redis Streams, enabling live chunk streaming across multiple broker replicas.

### Local development with devspace

```bash
BROKER_CHUNK_BACKEND=redis devspace dev
```

This activates the `broker-redis` profile, which:
- Deploys `ark-redis-dev` (Redis 7-alpine, service `ark-redis-dev`, port 6379) in the `default` namespace and waits for it to be ready.
- Sets `REDIS_URL=redis://:arkredisdev123@ark-redis-dev:6379` on the broker deployment.

All three backends can be activated together:

```bash
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_CHUNK_BACKEND=redis devspace dev
```

### Enabling in Helm

```yaml
backends:
  chunk: redis

redis:
  url: "redis://:password@redis-host:6379"
  keyPrefix: "ark-broker"
  streamTtlSeconds: 3600
  connectTimeoutMs: 10000
```

For TLS connections with a self-signed CA:

```yaml
redis:
  url: "rediss://:password@redis-host:6380"
  tls:
    enabled: true
    secretName: my-redis-tls-secret
```

The secret must contain `ca.crt`. The chart mounts it and sets `REDIS_TLS_CA_CERT_PATH` automatically.

### Integration tests

The Redis integration tests use Testcontainers (plain, auth, and TLS variants) and run automatically with `make test`. No local Redis required.

To skip them:

```bash
SKIP_INTEGRATION=true make test
```
