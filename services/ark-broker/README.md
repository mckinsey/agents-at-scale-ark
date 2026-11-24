# Ark Broker

Event bus for Ark cluster communication. Stores messages, chunks, traces, events, and sessions. Default backend is in-memory; messages, events, and sessions can be persisted to Postgres, and completion chunks to Redis Streams.

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

# Run with Postgres sessions backend (requires the other two Postgres backends).
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_SESSIONS_BACKEND=postgres devspace dev

# Run with Redis chunks backend.
BROKER_CHUNK_BACKEND=redis devspace dev

# All backends active at once (profiles are combinable).
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_SESSIONS_BACKEND=postgres BROKER_CHUNK_BACKEND=redis devspace dev
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
| `SESSIONS_BACKEND` | `memory` | Sessions storage backend: `memory` or `postgres`. `postgres` requires `MESSAGE_BACKEND=postgres` and `EVENT_BACKEND=postgres`. |
| `DATABASE_URL` | — | Postgres connection string. Required when `MESSAGE_BACKEND=postgres`, `EVENT_BACKEND=postgres`, or `SESSIONS_BACKEND=postgres`. All three backends share the same pool. |
| `DATABASE_POOL_MAX` | `10` | Max connections in the pool |
| `DATABASE_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | Per-statement timeout |
| `MESSAGE_VISIBILITY_TTL_SECONDS` | `2592000` | Default message TTL (30 days) |
| `EVENT_VISIBILITY_TTL_SECONDS` | `2592000` | Default event TTL (30 days) |
| `SESSIONS_VISIBILITY_TTL_SECONDS` | `2592000` | Session TTL (30 days), slid forward on each event or message. Must be >= the message and event TTLs. |
| `ROW_REAP_INTERVAL_SECONDS` | `3600` | Interval between expired-row reaper runs. `0` disables the reaper. Max `2147483` (~24 days). |
| `ROW_REAP_BATCH_SIZE` | `10000` | Rows deleted per `DELETE` statement while the reaper drains a backlog |
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

## Database backend (messages, events, and sessions)

Messages, operation events, and sessions can survive pod restarts by opting in to Postgres storage. The three backends share a single `DATABASE_URL` and connection pool.

Messages and events can be enabled independently. Sessions cannot: a session is materialized from both streams, so `SESSIONS_BACKEND=postgres` requires the other two to be `postgres` as well, and `SESSIONS_VISIBILITY_TTL_SECONDS` to be at least as long as the message and event TTLs. Both rules are checked at startup and the process exits with an explanatory message if they are not met.

Sessions on Postgres are also shared across replicas: a write is announced with `NOTIFY` after its transaction commits, and every replica `LISTEN`s, so `GET /sessions?watch=true` delivers updates regardless of which replica produced them.

### Local development with devspace

```bash
# Messages only.
BROKER_MESSAGE_BACKEND=postgres devspace dev

# Events only.
BROKER_EVENT_BACKEND=postgres devspace dev

# Messages and events.
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres devspace dev

# Sessions — the other two have to be set explicitly alongside it.
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_SESSIONS_BACKEND=postgres devspace dev
```

Activating any of these backends triggers the shared `postgres-infra` DevSpace profile, which:
- Deploys `ark-storage-dev` (Postgres 16-alpine, service `ark-storage-dev`, database `ark`) in the `default` namespace and waits for it to be ready.
- Builds the `ark-broker-migrate` init container image locally.
- Sets `DATABASE_URL=postgres://postgres:arkdev123@ark-storage-dev:5432/ark?sslmode=disable` on the broker deployment.
- Runs `golang-migrate` as an init container before the broker starts.

The same vars work standalone: `BROKER_MESSAGE_BACKEND=postgres devspace deploy`.

### Enabling in Helm

```yaml
backends:
  message: postgres   # message and event can each be enabled on their own
  event: postgres
  sessions: postgres  # requires both of the above

database:
  url: "postgres://user:password@host:5432/ark_broker"
```

The chart deploys a `migrate/migrate` init container that applies all pending migrations before the broker starts. The `messages`, `events`, `sessions`, and `session_queries` tables share the same schema.

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

All backends can be activated together:

```bash
BROKER_MESSAGE_BACKEND=postgres BROKER_EVENT_BACKEND=postgres BROKER_SESSIONS_BACKEND=postgres BROKER_CHUNK_BACKEND=redis devspace dev
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
