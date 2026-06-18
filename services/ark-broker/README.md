# ARK Broker

Event bus for ARK cluster communication. Stores messages, chunks, traces, events, and sessions. Default backend is in-memory; messages can be persisted to Postgres.

## Quickstart

```bash
# Show available commands.
make help

# Deploy to configured cluster (default: in-memory backend).
devspace deploy

# Run in-cluster dev mode.
devspace dev

# Run with Postgres message backend (deploys ark-storage-dev automatically).
BROKER_MESSAGE_BACKEND=postgres devspace dev
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
| `DATABASE_URL` | — | Postgres connection string. Required when `MESSAGE_BACKEND=postgres`. |
| `DATABASE_POOL_MAX` | `10` | Max connections in the pool |
| `DATABASE_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | Per-statement timeout |
| `MESSAGE_VISIBILITY_TTL_SECONDS` | `2592000` | Default message TTL (30 days) |
| `DATABASE_DEBUG_QUERIES` | `false` | Log SQL queries at debug level (SQL text + param count, never values) |

## Database backend

Messages can survive pod restarts by opting in to Postgres storage.

### Local development with devspace

```bash
BROKER_MESSAGE_BACKEND=postgres devspace dev
```

This activates the `broker-postgres` profile, which:
- Deploys `ark-storage-dev` (Postgres 16-alpine, service `ark-storage-dev`, database `ark`) in the `default` namespace and waits for it to be ready.
- Builds the `ark-broker-migrate` init container image locally.
- Sets `DATABASE_URL=postgres://postgres:arkdev123@ark-storage-dev:5432/ark?sslmode=disable` on the broker deployment.
- Runs `golang-migrate` as an init container before the broker starts.

The same var works standalone: `BROKER_MESSAGE_BACKEND=postgres devspace deploy`.

### Enabling in Helm

```yaml
backends:
  message: postgres

database:
  url: "postgres://user:password@host:5432/ark_broker"
```

The chart deploys a `migrate/migrate` init container that applies pending migrations before the broker starts.

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
