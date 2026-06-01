## Ark Broker

In-memory event bus (Node.js/Express) providing streaming, messaging, tracing,
and session management for the Ark cluster. Currently coupled to the completions
executor's message format (OpenAI-format messages and chunks).

### Broker Types (`ark-broker/src/`)

- **MemoryBroker** (`memory-broker.ts`) — stores chat messages, grouped by
  conversation/query ID
- **CompletionChunkBroker** (`chunks-broker.ts`) — stores streaming
  chunks, tracks completion with `[DONE]` markers
- **TraceBroker** (`trace-broker.ts`) — stores OTEL spans, supports session
  filtering via `ark.session.id`
- **EventBroker** (`event-broker.ts`) — stores controller operation events
  (QueryExecutionStart, LLMCallComplete, etc.)
- **SessionsBroker** (`sessions-broker.ts`) — event-sourced materialized view,
  enriched by events and messages from other brokers

### Key Features

- All endpoints support `?watch=true` for Server-Sent Events streaming with
  cursor-based pagination
- OTLP protobuf ingestion at `POST /v1/traces`
- Optional JSON file persistence (disabled by default)

### Build

```bash
make build         # Build Docker image
make test          # Run tests
```

---

## Conventions for contributors (humans and LLMs)

The toolchain enforces most of these. The rules below are mandatory; CI rejects
violations.

### Verify locally before every commit

```bash
cd services/ark-broker
make lint && make test
```

### Mandatory toolchain

- **ESLint** (`eslint.config.js`, flat config) — `no-console: 'error'`,
  `@typescript-eslint/no-floating-promises: 'error'`. Type-aware lint via
  `tsconfig.eslint.json`.
- **Prettier** (`.prettierrc.json` mirrors `tools/ark-cli`) — `npm run format`
  before commit.
- **pino** + **pino-http** — the only logging primitives.
- **zod** — the only way config enters the process.
- **Jest** — test runner. Use a silent logger in test setup.

### Dependency injection (no singletons, no module-level globals)

- Never `export const logger`, `export const config`, or any other shared
  instance from a module. Construct in `index.ts` and pass down.
- `index.ts` is the **single composition root**. It builds the logger, parses
  config, and calls `buildApp({config, logger})`.
- `server.ts` exports `buildApp(deps)` and returns `{app, brokers}`. It holds
  no module-level state.
- Storage classes (`BrokerItemStream`, `JsonFileStore`, `SessionsBroker`)
  accept a `logger: Logger` as a constructor dep, plus the narrow primitives
  they need (`path?`, `maxItems?`). Pass a `logger.child({broker: 'memory'})`
  from `buildApp` for log discriminability.
- Utility functions (`sse.ts`, `swagger.ts`) take logger as a function
  parameter, never import it.
- Route handlers use **`req.log`** — the per-request child logger that
  `pino-http` attaches. It carries `req.id` automatically.

### Configuration (plain object, not a class)

- `src/config/` exports `loadConfig(env): AppConfig`. `AppConfig` is a
  `Readonly<{...}>` **type**, not a class. `loadConfig` returns
  `Object.freeze(...)` at the top level and on every slice.
- Validate everything with zod (`src/config/schema.ts`). Cross-field rules
  via `superRefine`.
- **No `process.env` reads outside `src/config/`.** If you need a value at
  runtime, plumb it through `AppConfig`. (The two reads remaining in
  `swagger.ts` and `index.ts` predate this rule and are scoped to boot.)
- Boot fails fast: invalid env → `logger.error({err}, 'invalid configuration')`
  → `process.exit(1)`. No silent defaults that mask misconfiguration.

### Logging

- `createLogger(config)` returns a fresh pino instance — no shared state, no
  module-level export.
- Production: JSON output, ISO 8601 timestamps (`stdTimeFunctions.isoTime`),
  level emitted as a string label (`{level: "info"}`, not `{level: 30}`).
- Development: `pino-pretty` transport, gated by `pretty: true` at construction.
- Sensitive headers (`authorization`, `cookie`, `x-api-key`, `x-auth-token`,
  `x-csrf-token`, `set-cookie`, `proxy-authorization`) and credential-bearing
  fields (`password`, `token`, `secret`, `apiKey`, `accessToken`,
  `refreshToken`, …) are redacted by default at top level and one level deep.
  Add new paths in `src/logging/logger.ts:REDACT_PATHS`.
- Structured logs only: `logger.info({key: value}, 'message')`. Don't build
  strings with template literals — let the aggregator filter on fields.
- `console.*` is banned by ESLint. There is no escape hatch.

### HTTP middleware order in `buildApp`

```
cors → json → requestId → pino-http (createHttpLogger) → routes
  → createErrorHandler → notFoundHandler
```

- `requestId` honors incoming `X-Request-ID` or generates a UUID; echoed in
  the response header.
- `createHttpLogger(logger)` mounts `pino-http` with `genReqId: req => req.id`.
  Every handler downstream gets `req.log` automatically.
- Setup middlewares are **named factories** (`createHttpLogger`,
  `createErrorHandler`), never constructed inline at the call site.

### Error handling

- Every async handler ends with `try { ... } catch (err) { next(err); }`.
  ESLint `no-floating-promises` enforces awaits.
- All error and 404 responses share the shape
  `{ error: { code, message, requestId, stack? } }`. `requestId` echoes the
  request id from the header so clients can correlate.
- `stack` is included only when `config.nodeEnv === 'development'`
  (`includeStack` dep to `createErrorHandler`).

### Testing

- Test runner: Jest with `ts-jest`.
- When constructing an app inline (not via `buildApp`), mount the same
  middleware chain — `requestId` and `createHttpLogger(silentLogger)` are
  required so `req.log` exists.
- Silent logger in setup: `createLogger({level: 'silent', pretty: false})`.
  Pass it to broker constructors.
- For structured assertions on log lines, pass a `Writable` destination to
  `createLogger` (see `test/error-handler.test.ts`).

### Commit messages

The repo uses Conventional Commits (enforced by Release Please). Beyond that:

- Format: `type(broker): description` for changes inside this service.
- Subject is mandatory; body is **optional and only added when it captures
  non-obvious why** (constraints, tradeoffs, motivation the diff cannot
  convey).
- **No per-file enumerations in the body.** The diff already shows that.
- **No teasers** ("wired up next commit", "follow-up coming"). Each commit
  stands on its own.
- **No `Co-Authored-By` trailers** in this repo.

### Imports

The `@ark-broker/` alias maps to `./src/` and is resolved at build time by `tsc-alias`.

- **Cross-tree** (import crosses a top-level `src/` subdirectory boundary): use the alias — `@ark-broker/brokers/x.js`, `@ark-broker/http/sse.js`, `@ark-broker/logging/logger.js`.
- **Intra-module** (same domain folder or adjacent sibling): use a relative path — `'./schemas.js'`, `'../errors.js'`.

### Route domains

Each route domain under `src/http/routes/` is a three-file module:

- **`schemas.ts`** — zod schema objects and `z.infer<>` derived types. No router logic here.
- **`handlers.ts`** — exported `handle*` functions taking `(req, res, broker, ...params)`. No Express router registration.
- **`index.ts`** — `createXxxRouter(deps)` factory. Registers routes, calls `safeParse`, delegates to handlers.

When adding a new route domain, follow this pattern — do not add a flat single-file route directly under `routes/`.

### Engineering style

- Prefer **named factories in a dedicated module** over inline construction
  at the call site. If `const foo = factoryCall(...)` is used only on the
  next line, extract it.
- Prefer **sequential top-level statements** over wrapper functions that
  invert the flow. If the work is "build X, then read Y, then maybe touch
  X", write three statements — not a helper that builds-and-returns-Y so X
  can be referenced inside it.
- **No classes when a type + factory suffices.** Config, request handlers,
  middleware factories, logger factories — all plain functions returning
  plain objects.
- Don't add features, helpers, or abstractions beyond what the task
  requires. Three similar lines is better than a premature abstraction.
- Add comments only when the _why_ is non-obvious. Don't restate what the
  code already says.
