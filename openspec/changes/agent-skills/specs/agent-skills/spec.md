## ADDED Requirements

### Requirement: Skill CRD defines a sandboxed, scriptable capability

The operator SHALL accept a `Skill` custom resource (`ark.mckinsey.com/v1alpha1`) with the following spec fields: `description` (string, required, ≤ 200 chars), `instructions` (string, required), `runtime` (string, required, one of an operator-configurable allow-list; seed: `python@3.12`, `node@20`, `bash`), `scripts` (list of `{ name, content, schema? }` entries, required, ≥ 1 entry), `network.egress` (optional list of `{ host, port }`), `secrets` (optional list of `{ name, mountPath }`), `serviceAccount.roles` (optional list of `RoleRef` entries, restricted to an operator-configured allow-list), `resources` (optional, standard Kubernetes `ResourceRequirements`), `keepWarm` (optional boolean, default false), and `idleTimeout` (optional duration, default `60s`).

#### Scenario: Minimal valid skill

- **WHEN** a `Skill` is applied with only `description`, `instructions`, `runtime: bash`, and a single `scripts` entry
- **THEN** the validating webhook accepts the object
- **AND** the reconciler creates the owned `ConfigMap`, `ServiceAccount`, `NetworkPolicy` (deny-all), `Deployment` (`replicas: 0`), `Service`, synthetic `MCPServer`, and one `Tool`

#### Scenario: Skill rejected for unknown runtime

- **WHEN** a `Skill` is applied with `runtime: rust@1.75` and the allow-list contains only `python@3.12`, `node@20`, `bash`
- **THEN** the validating webhook rejects the admission
- **AND** the operator logs a reason referencing the allow-list

#### Scenario: Skill rejected when content exceeds the inline cap

- **WHEN** a `Skill` is applied whose total `instructions + scripts[*].content` payload exceeds 900 KiB
- **THEN** the validating webhook rejects the admission with a message pointing the author at MCPServer

### Requirement: Skill controller reconciles to owned Kubernetes objects

The `Skill` controller SHALL, for each `Skill`, reconcile a set of owned objects such that the scripts are mounted at `/skill`, the pod runs with the documented security defaults, and external traffic reaches the pod only via the scale-to-zero activator. Each owned object SHALL set an owner reference pointing at the `Skill`, so that deleting the `Skill` cascades to all owned objects.

#### Scenario: Content-hashed scripts ConfigMap

- **WHEN** a `Skill` is reconciled
- **THEN** a `ConfigMap` named `<skill>-<hash>` is created in the skill's namespace containing one key per script
- **AND** the hash covers `instructions + scripts[*].name + scripts[*].content` deterministically
- **AND** two `Skill`s with byte-identical instructions and scripts collapse to the same `ConfigMap` name

#### Scenario: Security-hardened pod template

- **WHEN** a `Skill` is reconciled
- **THEN** the generated `Deployment` sets `automountServiceAccountToken: false`
- **AND** the pod security context is `runAsNonRoot: true`, `runAsUser: 65532`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`
- **AND** the default resource limits are `cpu: 500m`, `memory: 256Mi` unless `spec.resources` overrides them

#### Scenario: Default-deny egress

- **WHEN** a `Skill` is reconciled with no `spec.network.egress` entries
- **THEN** a `NetworkPolicy` is created that selects the skill pod and permits no egress
- **AND** a script in the pod attempting to reach any external host SHALL fail with a connection error

#### Scenario: Opt-in egress allowlist

- **WHEN** a `Skill` is reconciled with `spec.network.egress: [{host: api.example.com, port: 443}]`
- **THEN** the generated `NetworkPolicy` permits egress to `api.example.com:443` only
- **AND** requests to any other destination SHALL fail

#### Scenario: Owner-reference cascade on delete

- **WHEN** a `Skill` is deleted
- **THEN** every controller-owned object (ConfigMap, ServiceAccount, NetworkPolicy, Deployment, Service, MCPServer, all per-script Tool objects) is deleted by the garbage collector

### Requirement: Scale-to-zero activator brings pods from 0 to 1 on demand

The `skillactivator` subsystem SHALL front each skill's `Service` as an HTTP proxy. When a request arrives for a skill whose `Deployment` has zero ready pods, the activator SHALL scale the `Deployment` to `replicas: 1`, wait for readiness, and forward the request. After a skill has been idle for `spec.idleTimeout` (default `60s`), the controller SHALL scale the `Deployment` back to `replicas: 0`. Skills with `spec.keepWarm: true` SHALL NOT be scaled down.

#### Scenario: Cold start on first request

- **GIVEN** a skill whose `Deployment` has `replicas: 0` and no in-flight requests
- **WHEN** an MCP request arrives at the skill's `Service`
- **THEN** the activator scales the `Deployment` to `1`
- **AND** the activator waits for a ready pod
- **AND** the request is forwarded and the response returned to the caller

#### Scenario: Scale back after idle

- **GIVEN** a skill that last served a request 61 s ago with `idleTimeout: 60s` and `keepWarm: false`
- **WHEN** the controller's idle sweeper runs
- **THEN** the `Deployment` is scaled to `replicas: 0`
- **AND** subsequent requests trigger the cold-start path again

#### Scenario: keepWarm skips scale-down

- **GIVEN** a skill with `keepWarm: true` that has been idle for > idleTimeout
- **WHEN** the controller's idle sweeper runs
- **THEN** the `Deployment` remains at `replicas: 1`

#### Scenario: Activator high availability

- **GIVEN** the activator is deployed with `replicas: 2`
- **WHEN** one activator pod is terminated
- **THEN** in-flight requests continue to be served by the remaining replica
- **AND** new requests are routed to the healthy pod

### Requirement: Agents attach skills via `spec.skills`

The `Agent` CRD SHALL expose an optional field `spec.skills`, a list of `{ name: string, namespace?: string }` entries. When present, each referenced `Skill` SHALL contribute to the agent's effective tool surface via the lazy-load protocol. Missing skill references SHALL mark the agent `Available=False` with a reason that names the missing skill.

#### Scenario: Attaching a skill contributes tools

- **GIVEN** an `Agent` with `spec.skills: [{ name: cobol-migrator }]`
- **WHEN** the agent reconciles
- **THEN** the agent's effective MCP tool list includes a `load_skill` built-in plus one `<skill>.<script>` tool per script declared in the referenced Skill
- **AND** the agent's existing `spec.tools` entries remain unaffected

#### Scenario: Missing skill reference

- **GIVEN** an `Agent` with `spec.skills: [{ name: does-not-exist }]`
- **WHEN** the agent reconciles
- **THEN** the agent's `status.conditions` includes `Available=False` with reason `SkillNotFound`
- **AND** the reason message names the missing skill

### Requirement: Lazy-load protocol for skill context

The Ark execution engine SHALL, when building a system prompt for an agent with attached skills, inject a catalog block listing each skill's `name` and `description`. The execution engine SHALL register a built-in tool `load_skill(name: string)` on the agent's tool list. Calling `load_skill` with a valid skill name SHALL return that skill's `spec.instructions`. Per-script tools (`<skill>.<script>`) SHALL be registered from the start but SHALL carry minimal per-tool descriptions — the authoritative "how to use" prose is delivered via `load_skill`.

#### Scenario: Catalog injection

- **GIVEN** an agent with three attached skills `a`, `b`, `c`
- **WHEN** the execution engine assembles the system prompt for a turn
- **THEN** the prompt contains a catalog block with three entries of the form `- <name>: <description>`
- **AND** no full `instructions` bodies appear in the prompt

#### Scenario: load_skill returns full instructions

- **WHEN** the model calls `load_skill(name: "cobol-migrator")`
- **THEN** the tool returns the full `spec.instructions` of the referenced Skill
- **AND** the response is cached for the remainder of the session (subsequent calls in the same session are free)

#### Scenario: load_skill for unknown name

- **WHEN** the model calls `load_skill(name: "typo")` and no such skill is attached
- **THEN** the tool returns an error describing the available skills

### Requirement: Runner image contract

An Ark skill runner image SHALL, when started, locate scripts under `/skill/scripts/`, expose an MCP HTTP server, and advertise one tool per script via `list_tools`. Tool invocation SHALL execute the corresponding script inside the pod, map the tool's JSON arguments to the script's argv, stream `stdout` back as the tool result (trimmed to 256 KiB), log `stderr`, and return a tool error if the exit code is non-zero (tool error message includes the last 4 KiB of `stderr`).

#### Scenario: Successful script invocation

- **GIVEN** a `python@3.12` skill with a script `summarise.py` that reads its first argv and prints a summary
- **WHEN** the agent calls `<skill>.summarise(file: "/skill/scripts/input.csv")`
- **THEN** the runner invokes `python /skill/scripts/summarise.py /skill/scripts/input.csv`
- **AND** the tool response is the script's stdout
- **AND** the call completes with no error

#### Scenario: Script fails with non-zero exit

- **GIVEN** a script that exits with status 1 and writes `"bad input"` to stderr
- **WHEN** the agent invokes that script
- **THEN** the tool call returns an error
- **AND** the error message includes `"bad input"`
- **AND** `stderr` is captured in trace logs

#### Scenario: Oversize stdout is trimmed

- **GIVEN** a script that emits 5 MiB of stdout
- **WHEN** the agent invokes that script
- **THEN** the returned tool result is ≤ 256 KiB
- **AND** the result indicates that the output was truncated

### Requirement: v1 feature scope is explicitly bounded

The v1 `Skill` CRD SHALL NOT support OCI image-based skills, Git-based skill sources, custom runtime images beyond the allow-list, cross-namespace skill references, or streaming tool responses. Authors requiring any of these SHALL continue to use `MCPServer`. These exclusions SHALL be documented in the Skill reference page.

#### Scenario: OCI image source rejected

- **WHEN** a `Skill` is applied with a `spec.source.image` field
- **THEN** the validating webhook rejects the admission with a message pointing the author at MCPServer
