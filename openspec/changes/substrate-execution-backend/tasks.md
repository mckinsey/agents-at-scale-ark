## 1. Phase 0 — Prove the seam (AX behind A2A)

- [ ] 1.1 Stand up Agent Substrate (control plane, a WorkerPool, egress gateway) in a test cluster, version-pinned
- [ ] 1.2 Put an A2A front door on AX (or a minimal Substrate harness) and register it as an Ark `ExecutionEngine`
- [ ] 1.3 Bind a test `Agent` via `spec.executionEngine` and run a `Query` end-to-end; confirm it executes as a sandboxed actor and returns a result

## 2. Phase 1 — Bridge + generic runner (completions)

- [ ] 2.1 Scaffold the `ark-substrate-executor` service (A2A server speaking Ark's executor protocol)
- [ ] 2.2 Implement the `ateapi` client: ensure `ActorTemplate`, create/resume/suspend `Actor`, stream, terminate
- [ ] 2.3 Map a `Query` to an actor: provision, run, stream output over A2A, and set the `Query` result on completion
- [ ] 2.4 Surface failures (no capacity, agent error, backend unavailable) as a terminal failed `Query` status, not silent success
- [ ] 2.5 Scaffold the `ark-runner` image honoring the runner contract (`/healthz`, `/readyz`, prepare workspace, run, SIGTERM, guest services)
- [ ] 2.6 Deliver the `Agent`/`Model`/`Tool` spec to the runner and parse it at startup
- [ ] 2.7 Implement the completions adapter, reusing Ark's provider-agnostic model client
- [ ] 2.8 Wire tool/MCP invocation and stream intermediate output to `ark-broker`
- [ ] 2.9 Inject model/tool credentials via env as a Phase-1 stopgap
- [ ] 2.10 Register as an `ExecutionEngine`; e2e test: an opt-in agent runs sandboxed via the completions adapter

## 3. Phase 2 — Config-driven adapters + spec-derived egress

- [ ] 3.1 Define the framework-adapter interface; select the adapter from the agent spec (completions default)
- [ ] 3.2 Add LangChain and Claude Agent SDK adapters (or the adapter contract + stubs)
- [ ] 3.3 Derive an `EgressPolicy` from `modelRef` + `tools`/`mcpServers` and apply it per actor (default-deny otherwise)
- [ ] 3.4 Move credential delivery to Substrate egress-gateway injection (zero-creds-in-sandbox)
- [ ] 3.5 Add a non-default development allow-all egress toggle
- [ ] 3.6 e2e: undeclared host denied, declared model/tool reachable, credentials absent from the sandbox

## 4. Phase 3 — Density + stateful sessions

- [ ] 4.1 Reuse one actor per `(agent, conversationId)`; suspend when idle, resume per query
- [ ] 4.2 Snapshot-backed session state; decide how it reconciles with Ark `Memory`
- [ ] 4.3 Idle auto-suspension for density
- [ ] 4.4 e2e: a follow-up query resumes a warm actor; a stateless agent uses an ephemeral actor

## 5. Compatibility, retirement, and docs

- [ ] 5.1 Version-pin Substrate and add a pre-flight API/protobuf compatibility check
- [ ] 5.2 Keep the `completions` executor as the non-sandboxed tier; document the routing rule
- [ ] 5.3 Deprecate and retire `ark-sandbox` and per-framework executor Deployments (announce BREAKING for dependents)
- [ ] 5.4 Documentation: the executor and runner contract, egress derivation, and the per-agent opt-in guide
- [ ] 5.5 Add e2e/chainsaw coverage for the Substrate engine path (success, failure, egress-denied)
