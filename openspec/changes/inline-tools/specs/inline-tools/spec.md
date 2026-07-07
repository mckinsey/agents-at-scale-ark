## ADDED Requirements

### Requirement: Tool CRD accepts `type: inline` with an `inline` sub-object

The operator SHALL accept a `Tool` custom resource (`ark.mckinsey.com/v1alpha1`) whose `spec.type` is `inline`. When `spec.type == inline`, the resource SHALL include a `spec.inline` sub-object with:

- `source` (string, required, MUST be non-empty, MUST be ≤ 64 KiB)
- `language` (string, required, MUST be one of `bash`, `python`, `node`, `ts`)

The `spec.inline` field SHALL be permitted only when `spec.type == inline`. The validating webhook SHALL reject any other combination. There is no shebang inference and no implicit default: `language` MUST be supplied explicitly.

#### Scenario: Minimal valid inline tool

- **WHEN** a `Tool` is applied with `spec.type: inline`, a non-empty `spec.inline.source`, and a valid `spec.inputSchema`
- **THEN** the validating webhook accepts the object
- **AND** the controller reconciles the owned `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment` (replicas: 0), `Service`, and synthetic MCP endpoint

#### Scenario: Empty source rejected

- **WHEN** a `Tool` is applied with `spec.type: inline` and `spec.inline.source` empty or missing
- **THEN** the validating webhook rejects the admission with a message naming `spec.inline.source`

#### Scenario: `inline` sub-object on a non-inline tool is rejected

- **WHEN** a `Tool` is applied with `spec.type: http` and a populated `spec.inline`
- **THEN** the validating webhook rejects the admission with a message stating `spec.inline` is only allowed when `spec.type == inline`

#### Scenario: Invalid language rejected

- **WHEN** a `Tool` is applied with `spec.type: inline`, a valid `spec.inline.source`, and `spec.inline.language: ruby`
- **THEN** the validating webhook rejects the admission with a message naming the allowed values (`bash`, `python`, `node`, `ts`)

#### Scenario: Missing language rejected

- **WHEN** a `Tool` is applied with `spec.type: inline`, a valid `spec.inline.source`, and no `spec.inline.language`
- **THEN** the validating webhook rejects the admission with a message stating `spec.inline.language` is required and naming the allowed values (`bash`, `python`, `node`, `ts`)

#### Scenario: Source size cap

- **WHEN** a `Tool` is applied whose `spec.inline.source` exceeds 64 KiB
- **THEN** the validating webhook rejects the admission with a message pointing the author at `MCPServer` for larger payloads

### Requirement: Inline tools attach via the existing `Agent.spec.tools`

The `Agent` CRD SHALL surface inline tools through the existing `spec.tools` mechanism with no new field. From an agent author's perspective, attaching an inline `Tool` is identical to attaching any other `Tool`.

#### Scenario: Attaching an inline tool by name

- **GIVEN** an inline `Tool` named `csv-summarise` and an `Agent` whose `spec.tools` references it
- **WHEN** the agent reconciles
- **THEN** the agent's effective tool list includes `csv-summarise`
- **AND** the agent's `spec.tools` did not require any inline-specific entries

#### Scenario: Inline tool callable end-to-end

- **GIVEN** an `Agent` with `spec.tools` including `csv-summarise` (an inline Python tool)
- **WHEN** the model invokes `csv-summarise(file: "/tmp/data.csv")` during a turn
- **THEN** the call succeeds
- **AND** the response is the script's stdout

### Requirement: Controller reconciles per-tool sandbox infrastructure

For each `Tool` with `spec.type == inline`, the controller SHALL reconcile a set of owned Kubernetes objects such that the script body is mounted at `/tool/source`, the pod runs with the documented security defaults, and external traffic reaches the pod only via the scale-to-zero activator. Each owned object SHALL set an owner reference pointing at the `Tool` so deletion cascades. The reconciliation of these objects SHALL be gated on `spec.type == inline`; `Tool` resources of other types SHALL retain their existing status-only reconciliation.

#### Scenario: In-place source ConfigMap with rollout-triggering annotation

- **WHEN** an inline `Tool` is reconciled
- **THEN** a single `ConfigMap` with a stable name (`<tool>-source`) is created in the tool's namespace containing the script body at key `source`
- **AND** the generated `Deployment`'s pod template carries an annotation (`ark.mckinsey.com/inline-source-hash`) whose value is a deterministic hash of `spec.inline.source`

#### Scenario: Editing source updates in place without orphaning ConfigMaps

- **GIVEN** a reconciled inline `Tool` with its `<tool>-source` ConfigMap
- **WHEN** `spec.inline.source` is edited and the `Tool` is re-reconciled
- **THEN** the same `<tool>-source` ConfigMap is updated in place (no new ConfigMap is created and none is orphaned)
- **AND** the pod-template `ark.mckinsey.com/inline-source-hash` annotation changes, triggering a rollout

#### Scenario: Security-hardened pod template

- **WHEN** an inline `Tool` is reconciled
- **THEN** the generated `Deployment`'s pod template sets `automountServiceAccountToken: false`
- **AND** the pod security context is `runAsNonRoot: true`, `runAsUser: 65532`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`
- **AND** the default resource limits are `cpu: 500m`, `memory: 256Mi`
- **AND** the pod sets a PID limit (default `128`) so a fork bomb cannot exhaust node-level PIDs for other pods

#### Scenario: Default-deny egress

- **WHEN** an inline `Tool` is reconciled
- **THEN** a `NetworkPolicy` is created that selects the tool's pod and permits no egress
- **AND** v1 exposes no relaxation knob (an author needing egress SHALL author an `MCPServer` instead)

#### Scenario: Owner-reference cascade on delete

- **WHEN** an inline `Tool` is deleted
- **THEN** every controller-owned object (`ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment`, `Service`, synthetic MCP endpoint) is deleted by the Kubernetes garbage collector

#### Scenario: Non-inline tools keep status-only reconciliation

- **WHEN** a `Tool` with `spec.type: http` is reconciled
- **THEN** no `ConfigMap`, `Deployment`, `Service`, or `NetworkPolicy` is created for it
- **AND** its status transitions to `Ready` exactly as before this change

### Requirement: Scale-to-zero activator brings pods from 0 to 1 on demand

A new `inlinetoolactivator` subsystem in the operator SHALL front each inline tool's `Service` as an HTTP proxy. When a request arrives for a tool whose `Deployment` has zero ready pods, the activator SHALL scale the `Deployment` to `replicas: 1`, wait for readiness, and forward the request. After an inline tool has been idle for `60s`, the controller SHALL scale the `Deployment` back to `replicas: 0`.

#### Scenario: Cold start on first request

- **GIVEN** an inline `Tool` whose `Deployment` has `replicas: 0`
- **WHEN** an MCP request arrives at the tool's `Service`
- **THEN** the activator scales the `Deployment` to `1`
- **AND** the activator waits for a ready pod
- **AND** the request is forwarded and the response returned to the caller

#### Scenario: Scale back after idle

- **GIVEN** an inline `Tool` that last served a request 61 s ago
- **WHEN** the controller's idle sweeper runs
- **THEN** the `Deployment` is scaled to `replicas: 0`

#### Scenario: Cold-start timeout returns a tool error

- **GIVEN** an inline `Tool` whose pod never becomes ready
- **WHEN** an MCP request arrives and the activation deadline is exceeded
- **THEN** the activator returns a tool error indicating the activation timeout

### Requirement: Runner image contract

Ark SHALL publish a single multi-language runner image `ark-inline-runner:v1` (Alpine-based) that bundles `bash`, `python@3.12`, `node@20`, and `tsx`. When started, the image SHALL expose an MCP-shaped HTTP endpoint and SHALL dispatch each invocation solely by the `LANGUAGE` env var (sourced from the required `spec.inline.language`):

- `bash` → `bash /tool/source`
- `python` → `python3 /tool/source`
- `node` → `node /tool/source`
- `ts` → `tsx /tool/source`

The runner SHALL NOT inspect the source for a shebang and SHALL NOT apply an implicit language default; `LANGUAGE` is always present because `spec.inline.language` is required.

The runner SHALL pass the tool's JSON arguments as a single string in `argv[1]`. The runner SHALL stream `stdout` back as the tool result (trimmed to 256 KiB), log `stderr`, and return a tool error if the exit code is non-zero (error message includes the last 4 KiB of `stderr`). The runner SHALL enforce a per-invocation execution timeout (default `30s`): when the timeout expires before the script exits, the runner SHALL kill the process group and return a tool error naming the timeout.

#### Scenario: Language env dispatch

- **GIVEN** an inline `Tool` with `language: python`
- **WHEN** the model invokes the tool
- **THEN** the runner executes `python3 /tool/source <args-json>`

#### Scenario: Shebang in source is not honoured as dispatch

- **GIVEN** an inline `Tool` with `language: python` whose `source` begins with `#!/usr/bin/env bash`
- **WHEN** the model invokes the tool
- **THEN** the runner executes the script under `python3` (the `language` field, not the shebang line, selects the interpreter)

#### Scenario: Runtime timeout kills a hung script

- **GIVEN** an inline `Tool` whose script never exits (infinite loop)
- **WHEN** the model invokes the tool and the per-invocation execution timeout (default `30s`) expires
- **THEN** the runner kills the script's process group
- **AND** the tool call returns an error naming the execution timeout

#### Scenario: JSON arguments arrive on argv[1]

- **GIVEN** an inline Python `Tool` whose source contains `import sys, json; args = json.loads(sys.argv[1])`
- **WHEN** the model invokes the tool with `{"file": "data.csv", "limit": 10}`
- **THEN** the script's `args` dict equals `{"file": "data.csv", "limit": 10}`

#### Scenario: Script fails with non-zero exit

- **GIVEN** an inline `Tool` whose script exits 1 with `"bad input"` on stderr
- **WHEN** the model invokes the tool
- **THEN** the tool call returns an error
- **AND** the error message includes `"bad input"`

#### Scenario: Oversize stdout is trimmed

- **GIVEN** an inline `Tool` whose script emits 5 MiB of stdout
- **WHEN** the model invokes the tool
- **THEN** the returned tool result is ≤ 256 KiB
- **AND** the result indicates that the output was truncated

### Requirement: Inline tools surface to the executor through existing MCP plumbing

The execution engine SHALL NOT learn a dedicated code path for inline tools. When a `Tool` of `type: inline` is attached to an agent, the controller SHALL ensure there exists an MCP-shaped endpoint (a synthesised `MCPServer` or an equivalent internal record) such that the executor's standard MCP client invokes the inline tool by name. Tracing, auditing, authentication, and broker integration SHALL apply unchanged.

#### Scenario: Executor uses the same call path for HTTP and inline tools

- **GIVEN** an `Agent` whose `spec.tools` contains both an `http` tool and an `inline` tool
- **WHEN** the executor calls each tool in the same turn
- **THEN** both calls go through the same MCP client interface inside the executor
- **AND** both calls emit the same trace span types and broker events

### Requirement: Inline tools are authorable from the dashboard and persist to the cluster

The ark-api Tool endpoints SHALL accept `spec.type: inline` and the `spec.inline.{source,language}` fields on the existing create/get/list/delete paths. The ark-dashboard SHALL surface inline-tool authoring through the existing Tool editor: the Type selector SHALL offer an `Inline` option alongside the other tool types. When `Inline` is selected the editor SHALL show a required multiline `Source` input and a required `Language` selector offering `Bash`, `Python`, `Node`, and `TS` (no `Auto` option, and no default selection). Creating an inline tool through the dashboard SHALL persist a `Tool` resource of `type: inline` in the selected namespace. The editor SHALL apply client-side validation that mirrors the webhook (non-empty source, source ≤ 64 KiB, a language chosen from the allowed set) for fast feedback, with the webhook remaining authoritative.

#### Scenario: Selecting Inline reveals the source and language fields

- **GIVEN** the dashboard Tool editor opened via "Add Tool"
- **WHEN** the user selects `Inline` in the Type selector
- **THEN** the editor shows the required `Source` and `Language` fields

#### Scenario: Create inline tool via ark-api round-trips

- **WHEN** a client POSTs a Tool with `spec.type: inline`, `spec.inline.source`, and `spec.inline.language: python` to the ark-api tools endpoint
- **THEN** the API persists a `Tool` resource of `type: inline`
- **AND** a subsequent GET returns the same `spec.inline.source` and `spec.inline.language`

#### Scenario: Create inline tool from the dashboard editor

- **GIVEN** the dashboard Tool editor with `Inline` selected as the type
- **WHEN** the author supplies a name, a description, an input schema, a source script, and an explicit language, and submits
- **THEN** a `Tool` of `type: inline` is created in the active namespace with `spec.inline.source` and `spec.inline.language` set
- **AND** the new tool appears in the tools list with an `(inline · <language>)` badge

#### Scenario: Language must be chosen before submit

- **GIVEN** the dashboard Tool editor with `Inline` selected and no `Language` chosen
- **WHEN** the author attempts to submit
- **THEN** the editor blocks submission and shows a validation message that a language is required

#### Scenario: Empty source blocked client-side

- **GIVEN** the dashboard Tool editor with `Inline` selected and an empty `Source`
- **WHEN** the author attempts to submit
- **THEN** the editor blocks submission and shows a validation message naming the source field

### Requirement: v1 feature scope is explicitly bounded

The v1 `inline-tools` capability SHALL NOT support: bundling multiple scripts in one `Tool`, `SKILL.md`-style prose / lazy-load catalogs, languages outside the default runner image (Go, Rust, Ruby, custom interpreter versions), per-tool custom runner images, third-party dependencies (`pip`/`npm` packages beyond each interpreter's standard library, or any package-install step), OCI / Git / HTTP script sources, mounted reference files, cross-namespace tool references, streaming tool responses, or relaxation of the security defaults (egress allow-lists, mounted secrets, RBAC role refs). Authors requiring any of these SHALL continue to use `MCPServer`.

Standard-library-only is a documented non-goal, not webhook-enforced: admission does not parse source for imports. Deny-all egress makes a runtime `pip`/`npm install` fail, so a third-party import fails at execution time — the signal to move to an `MCPServer`.

#### Scenario: Custom runner image rejected

- **WHEN** a `Tool` is applied with `spec.inline.image: my-registry/foo:bar`
- **THEN** the validating webhook rejects the admission with a message pointing the author at `MCPServer`

#### Scenario: Source reference outside `spec.inline.source` rejected

- **WHEN** a `Tool` is applied with `spec.inline.source` empty but a sibling `spec.inline.sourceRef` (ConfigMap reference, Git URL, or similar) populated
- **THEN** the validating webhook rejects the admission with a message stating only `spec.inline.source` is supported in v1
