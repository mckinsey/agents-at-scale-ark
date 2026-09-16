## ADDED Requirements

### Requirement: Tool accepts an explicit inline script and language

The operator SHALL support `Tool.spec.type: inline` with a required `spec.inline` containing a non-whitespace `source` of at most 65,536 UTF-8 bytes and a required `language` of `bash`, `python`, `node`, or `ts`. There SHALL be no implicit language default or shebang dispatch. Inline validation SHALL be equivalent on both storage backends.

`spec.inline` SHALL be invalid on another type, and an inline Tool SHALL NOT carry other subtype configuration. Inline input schemas SHALL describe JSON objects; an omitted schema SHALL be advertised as an empty-object schema. Non-inline validation SHALL remain unchanged. Updates crossing the inline/non-inline type boundary SHALL require delete/recreate in v1.

#### Scenario: Minimal valid inline tool

- **GIVEN** inline authoring is enabled and the requester has the dedicated author permission in the target namespace
- **WHEN** a Tool is created with `type: inline`, non-empty source, `language: python`, and an object input schema
- **THEN** admission accepts it
- **AND** it remains Pending if runtime prerequisites are incomplete

#### Scenario: Missing or invalid fields

- **WHEN** an inline Tool has missing/whitespace-only source, missing language, or an unsupported language
- **THEN** admission rejects it with an error naming the invalid field

#### Scenario: Source byte limit

- **WHEN** source exceeds 65,536 UTF-8 bytes, including multibyte characters
- **THEN** admission rejects it and recommends MCPServer for larger tools
- **AND** a source of exactly 65,536 bytes is not rejected on size alone

#### Scenario: Conflicting subtype fields

- **WHEN** a non-inline Tool contains `spec.inline`, or an inline Tool contains `spec.http` or another subtype configuration
- **THEN** admission rejects the inconsistent shape

#### Scenario: Conversion requires recreation

- **WHEN** an update, PATCH, or apply changes a Tool from non-inline to inline or from inline to another type
- **THEN** admission rejects the transition with delete/recreate guidance

### Requirement: Inline authoring requires a dedicated permission on both backends

Inline creation and every inline spec update SHALL require `inlineTools.enabled: true` (default false) and an explicitly allowed SubjectAccessReview. The review SHALL use `group: ark.mckinsey.com`, `resource: inlinetools`, `verb: use`, the server-validated request namespace, and the authenticated requester's username, UID, groups, and extra information where present. Missing identity, denial, timeout, and authorization errors SHALL fail closed.

CRD admission SHALL obtain identity from AdmissionReview; the PostgreSQL-backed API server SHALL obtain it from authenticated request context and enforce the same decision in-process. The gate SHALL NOT depend on optional third-party admission plugins, be bypassable by validation-skip labels or namespace selectors, or inherit a configurable fail-open policy. Installations unable to enforce the gate SHALL reject inline authoring. Authentication-disabled aggregated API configurations SHALL reject inline authoring.

No dedicated author permission SHALL be added automatically to existing Tool editors or ark-api's service account. Unchanged-spec metadata operations, status updates, and deletion SHALL retain their normal permissions and remain possible while disabled; these paths SHALL NOT mutate executable spec fields. Non-inline operations SHALL retain their existing authorization behavior.

#### Scenario: Authorized creation and update

- **GIVEN** authoring is enabled and a subject has the dedicated permission in namespace A
- **WHEN** the subject creates an inline Tool or changes its source/language/schema through update, PATCH, or apply in A
- **THEN** the CRD and PostgreSQL admission paths both allow the otherwise-valid operation

#### Scenario: Generic Tool permission is insufficient

- **GIVEN** a subject may create/update Tools but lacks the dedicated author permission
- **WHEN** it attempts inline creation or a spec update
- **THEN** both backends reject the write

#### Scenario: Permission is namespace scoped

- **GIVEN** the subject has the dedicated permission only in namespace A
- **WHEN** it attempts an inline write in namespace B, including with a conflicting body namespace
- **THEN** it cannot use the grant in A to authorize the write in B

#### Scenario: Disabled feature or unavailable authorization

- **WHEN** the feature is disabled, authenticated identity is missing, or SubjectAccessReview fails or times out
- **THEN** inline authoring is rejected on both backends
- **AND** existing resource cleanup remains possible under ordinary permissions

#### Scenario: Security admission cannot be skipped

- **WHEN** an unauthorized inline request carries `ark.mckinsey.com/skip-webhook-validation: "true"`, or optional third-party webhooks are disabled
- **THEN** the mandatory inline security gate still rejects the write

### Requirement: API inline authoring uses authenticated end-user impersonation

Typed Tool and generic resource create/spec-update paths SHALL require an authenticated user identity and enabled impersonation for inline authoring. They SHALL reject API-key-only or non-impersonated authoring and SHALL NOT retry a denial as ark-api's service account, even when general fallback is enabled. Update checks SHALL consider both the stored and proposed Tool. Direct authenticated Kubernetes service accounts MAY receive explicit author grants; API restrictions do not prohibit those direct callers.

#### Scenario: Authorized dashboard user

- **GIVEN** an authenticated user with impersonation enabled and the dedicated permission
- **WHEN** the user creates or edits an inline Tool through the dashboard
- **THEN** admission evaluates that user, not ark-api's service account

#### Scenario: API identity or permission is insufficient

- **WHEN** an inline authoring request lacks user identity, uses only an API key, has impersonation disabled, or is denied admission
- **THEN** the API rejects it without a service-account retry
- **AND** using the generic resource endpoint does not bypass that decision

### Requirement: Inline tools inherit the existing execution authorization model

Inline Tools SHALL attach through existing `Agent.spec.tools`. Their resolution and invocation SHALL preserve the query/executor resource-access identity, attachment/allowlist restrictions, and applicable approval flows of the chosen execution engine. The dedicated author permission SHALL NOT become an invocation permission. This change SHALL NOT introduce per-user invocation OAuth, a new execute verb, or additional engine features not already supported for existing tools.

#### Scenario: Invoke without author privileges

- **GIVEN** an existing inline Tool and a query execution context that can resolve and use it through the ordinary tool path
- **AND** that execution context lacks the dedicated inline author permission
- **WHEN** the agent invokes the attached Tool
- **THEN** the lack of author permission alone does not reject invocation

#### Scenario: Existing resource restrictions and approval apply

- **WHEN** an inline Tool is resolved and invoked
- **THEN** resolution does not elevate to the controller's identity to bypass the execution context's resource permissions
- **AND** it cannot bypass the chosen engine's existing tool allowlist or configured approval flow

#### Scenario: Runnable in-memory CSV example

- **GIVEN** an agent with the `csv-summarise` Tool from design.md attached and its runtime available
- **WHEN** the model supplies `{"csv":"amount\n2\n3\n"}`
- **THEN** the tool returns text representing `{"rows":2,"total":"5"}`
- **AND** it needs no external file, network access, or third-party package

### Requirement: Inline resolution reuses existing MCP invocation types

The controller SHALL publish an internal activator URL in `Tool.status.resolvedAddress` and the corresponding `status.observedGeneration`. Go `CreateToolExecutor` SHALL adapt inline Tools into existing MCP client configuration and `MCPExecutor`; the Python SDK's `_build_mcp_servers` SHALL emit existing `MCPServerConfig` records as specified by the `mcp-server-resolution` delta. The stored Tool SHALL remain inline; no synthetic MCPServer or duplicate Tool SHALL be created.

Connections SHALL use transport `http` (MCP Streamable HTTP), a namespace/UID-qualified connection identity, and the authored Tool name as the original MCP tool name. Unresolved or stale status SHALL NOT supply a usable connection. Existing tracing, events, result/error handling, and supported attachment transformations SHALL be reused. HTTP tools SHALL retain their separate HTTP execution path.

#### Scenario: Existing MCP and inline tool in one agent

- **GIVEN** an agent with one MCP Tool and one inline Tool
- **WHEN** its tools are registered and invoked
- **THEN** both use the existing MCP invocation implementation after their respective resolution steps
- **AND** inline adaptation preserves applicable attachment aliases/partial arguments and tool events

#### Scenario: Direct Tool query

- **WHEN** a direct Tool query targets an inline Tool through `CreateToolExecutor`
- **THEN** the shared factory supplies an MCP executor rather than rejecting the new type or executing the script locally

#### Scenario: Unresolved inline tool

- **WHEN** an inline Tool is Pending or its observed generation is stale
- **THEN** resolution reports it unavailable using the caller's existing error/skip behavior
- **AND** does not connect directly to a runner or rewrite the stored subtype

### Requirement: Controller reconciles owned, revision-checked runner infrastructure

Each inline Tool SHALL own one source ConfigMap, ServiceAccount, NetworkPolicy, Deployment, and Service in its namespace. Child names SHALL be deterministic and length-safe, labels SHALL distinguish Tool UIDs, and ownership collisions SHALL fail without adopting unrelated resources. Non-inline reconciliation SHALL remain unchanged.

The source ConfigMap SHALL have a stable name (`<tool>-source` when it fits), key `source`, and in-place updates. The pod template SHALL carry `ark.mckinsey.com/inline-source-hash`; source and language changes SHALL trigger a rollout. Mount a read-only per-pod snapshot at `/tool/source.sh`, `/tool/source.py`, `/tool/source.js`, or `/tool/source.ts` as appropriate, and verify its checksum before runner readiness. New invocations SHALL wait for the current revision rather than use stale source.

Ready SHALL mean that the current endpoint/configuration and runtime prerequisites are usable, not that a runner pod is warm. Missing runtime or network verification SHALL produce Pending and no usable endpoint. Inline reconciliation SHALL process edits and child drift even if the previous status was Ready. Ordinary reconciliation SHALL NOT overwrite the activator's active replica count.

#### Scenario: Initial and repeated reconciliation

- **WHEN** an inline Tool is reconciled repeatedly with runtime prerequisites satisfied
- **THEN** one owned set of children exists and the initially unused Deployment has zero replicas
- **AND** the Tool can be Ready without starting a runner

#### Scenario: Source edit without orphaned ConfigMaps

- **WHEN** the source of a Ready inline Tool changes
- **THEN** the existing source ConfigMap is updated and the pod-template checksum changes
- **AND** new invocations wait for the matching revision
- **AND** no stale ConfigMaps accumulate and no interrupted call is automatically replayed

#### Scenario: ConfigMap and template race

- **WHEN** a starting runner mounts source whose checksum differs from its expected revision
- **THEN** it does not become ready or execute that source for an invocation

#### Scenario: Hardened pod template

- **WHEN** the runner Deployment is generated
- **THEN** it disables service-account token automounting, runs non-root as UID 65532, and uses `seccompProfile: RuntimeDefault`
- **AND** container security contexts set read-only root filesystems, no privilege escalation, and all capabilities dropped
- **AND** CPU and memory limits are 500m and 256Mi, with no secrets or host namespaces/host paths

#### Scenario: Disable, delete, and downgrade

- **WHEN** inline execution is disabled or a Tool is deleting
- **THEN** new calls are rejected, cached routes/waiters are invalidated, and bounded active work ends before scale-down
- **AND** deleting the Tool removes all owned children on both storage backends
- **AND** downgrade guidance requires verifying child/pod removal before replacing the inline-aware operator

### Requirement: Effective network isolation gates execution

Before publishing a usable endpoint or running scripts, Ark SHALL verify effective isolation for the runner's namespace and policy-relevant labels. Runner policies SHALL deny egress and restrict backend ingress to the activator; activator ingress SHALL be restricted to administrator-selected executor workloads. Neither endpoint SHALL be publicly exposed by this feature. No per-user invocation authentication is implied by these network restrictions.

Verification SHALL account for all selecting policies, including additive allow policies such as the optional ark-tenant allow-all egress policy. It SHALL use a controlled reachable destination, a successful positive control, and representative restricted probes for egress and ingress. Failed or inconclusive verification SHALL block execution with an actionable Pending reason, without silently modifying unrelated policies. Authorized authoring MAY persist a Pending Tool before runtime/network prerequisites are ready.

Relevant policy, label, or configuration changes and loss of verification state SHALL invalidate verification and require rechecking before new execution. Operations guidance SHALL explain standard NetworkPolicy limits, including node-local traffic exceptions and administrator responsibility for node/metadata-service protection.

#### Scenario: Discovery does not prove isolation

- **WHEN** a NetworkPolicy object exists but the CNI ignores it
- **THEN** an allowed restricted probe causes verification to fail
- **AND** no script executes

#### Scenario: Unreachable positive control

- **WHEN** the positive-control connection cannot reach the controlled destination
- **THEN** verification is inconclusive, not successful
- **AND** the Tool remains unavailable for execution

#### Scenario: Overlapping tenant allow-all policy

- **GIVEN** an enforcing CNI and an allow-all policy selecting the actual runner
- **WHEN** verification evaluates the runner context
- **THEN** it rejects that context despite the separate deny-all policy
- **AND** reports that the administrator must correct the overlap before execution

#### Scenario: Effective restrictions pass

- **GIVEN** a reachable positive control and policies allowing only the intended ingress while denying runner egress
- **WHEN** representative probes verify the restrictions
- **THEN** network verification succeeds
- **AND** a real inline script's attempted outbound connection is blocked in the negative e2e check

#### Scenario: Runner cannot be reached by another workload

- **WHEN** a non-activator workload attempts to call a runner directly
- **THEN** the configured backend ingress restriction denies that connection

### Requirement: PID containment is documented as an administrator best practice

Operations documentation SHALL describe node-level PID exhaustion as a residual risk and recommend finite per-pod limits through kubelet `podPidsLimit` or provider/runtime equivalents. It SHALL explain that an ordinary PodSpec has no PID-limit field, configuration belongs to cluster administrators, limits must accommodate processes and threads, and enforcement should be verified outside production. CPU/memory limits and the execution timeout SHALL NOT be described as guaranteeing PID containment.

Ark SHALL NOT prescribe 128, change node configuration, require a dedicated node pool, or gate admission/readiness/execution on PID verification. Existing cluster limits SHALL NOT be bypassed.

#### Scenario: Operator reads deployment guidance

- **WHEN** an operator reviews inline-tool operations guidance
- **THEN** it identifies the risk to neighboring workloads and recommends provider-supported per-pod PID limits
- **AND** it does not claim an Ark-enforced 128-PID guarantee

#### Scenario: PID settings are not accessible to Ark

- **GIVEN** all other admission and runtime prerequisites are met
- **WHEN** Ark cannot inspect or configure the cluster's PID settings
- **THEN** that alone does not prevent authoring, readiness, or invocation

### Requirement: Discovery does not activate runners

The shared activator SHALL terminate stateless MCP Streamable HTTP at a per-tool route qualified by namespace, name, and UID. It SHALL serve initialize, initialized notifications, ping, and `tools/list` from Tool metadata without starting runners or extending their idle lifetime. Discovery SHALL expose the Tool name, description, schema, and annotations, not script source. Unsupported operations and unknown tool names SHALL fail without activation.

Only valid `tools/call` requests SHALL activate a backend, after feature, runtime, network, current UID/revision, and child-ownership checks. The activator SHALL connect to the runner Service only after readiness and SHALL NOT accept caller-selected backend URLs or Deployment names.

#### Scenario: Attached tools remain unused

- **GIVEN** several Ready inline Tools at zero replicas
- **WHEN** an executor initializes connections and lists their tools before a model decision
- **THEN** every runner remains at zero replicas
- **AND** calling one listed Tool subsequently starts only that Tool's runner

#### Scenario: Deleted and recreated Tool

- **WHEN** a request uses the old UID-qualified route after a Tool is deleted and recreated with the same name
- **THEN** the activator rejects the stale route without executing the replacement Tool

### Requirement: Activation and idle scaling have one authority

The activator SHALL run as a singleton Deployment independently of controller replica count in v1. It SHALL coalesce simultaneous cold starts, track pending/active calls, and scale a runner to one replica for invocation. It SHALL scale back to zero only after 60 seconds since the last completed call with no pending or active work. Discovery traffic SHALL NOT refresh this clock.

Activation SHALL have a 60-second deadline shortened by the caller's remaining budget; script execution SHALL have a separate 30-second limit, also bounded by the caller. Handshake timeout SHALL NOT accidentally become the complete invocation budget. Cancellation SHALL propagate to backend work. Restarts/uncertain responses SHALL NOT automatically replay scripts, and recovered runners SHALL be reconciled conservatively before idle scale-down.

#### Scenario: Concurrent cold start

- **WHEN** concurrent calls arrive for one zero-replica Tool
- **THEN** they share one activation to one replica
- **AND** no idle transition interrupts their pending or active work

#### Scenario: Idle runner

- **GIVEN** no pending/active calls and a last completed call more than 60 seconds ago
- **WHEN** the idle sweep runs
- **THEN** the Deployment scales to zero even if discovery requests continue

#### Scenario: Activation timeout or cancellation

- **WHEN** the backend cannot become ready within the activation/caller deadline, or the caller cancels
- **THEN** the call reports failure and pending work is released
- **AND** no script is started later on behalf of the abandoned call

### Requirement: Runner uses bounded literal arguments and text results

Ark SHALL publish per-language images sharing a static Go MCP runner. Bash SHALL include bash/jq/coreutils on Alpine; Python/Node/TypeScript SHALL use distroless language bases, with the TypeScript loader vendored at image build time and invoked without a shell launcher. Every image SHALL be tested with the specified non-root/read-only security settings and a language-appropriate source filename.

The runner SHALL invoke the fixed interpreter directly with the script path followed by one JSON-object argument, without shell interpolation or shebang dispatch. It SHALL reject malformed/non-object arguments, bodies over 128 KiB, and serialized arguments over 64 KiB before script execution, using bounded decoding/capture memory.

The runner SHALL return one MCP text result after execution, not stream tool responses. Successful stdout SHALL be UTF-8, at most 256 KiB including a truncation indicator, truncated on a character boundary. Invalid UTF-8 stdout SHALL return a tool error. Non-zero exit, invalid output, timeout, and cancellation SHALL be errors, with at most the last 4 KiB of stderr rendered safely. Shared MCP handling SHALL preserve `isError` in the existing tool-result/error reporting path.

The runner SHALL drain output incrementally with bounded buffers/logging, enforce the 30-second/caller deadline, terminate and reap subprocess groups on timeout/cancellation, and clean up remaining children on completion. Authors retain responsibility for semantic argument validation and output content, including prompt-injection risks.

#### Scenario: Supported languages

- **WHEN** each language image executes its sample, including actual TypeScript syntax
- **THEN** the interpreter matches the required language and receives the JSON argument
- **AND** a shebang naming another interpreter does not change dispatch

#### Scenario: Arguments are data

- **WHEN** a call contains shell metacharacters, quotes, Unicode, or nested values
- **THEN** the script receives the same JSON values as data in its single argument
- **AND** Ark does not execute argument content as a shell command

#### Scenario: Invalid or oversized input

- **WHEN** JSON is malformed/non-object, the request exceeds 128 KiB, or serialized arguments exceed 64 KiB
- **THEN** the request fails before spawning the interpreter

#### Scenario: Bounded output

- **WHEN** a script emits 5 MiB of valid UTF-8 stdout and sustained stderr
- **THEN** capture/logging memory remains bounded
- **AND** returned text stays within 256 KiB, remains valid UTF-8, and indicates truncation

#### Scenario: Script error or binary output

- **WHEN** a script exits non-zero or emits invalid UTF-8 stdout
- **THEN** MCP reports a tool error, not a successful opaque-byte result
- **AND** error reporting preserves that failure with bounded, safely rendered stderr

#### Scenario: Hung script and children

- **WHEN** a script or child process hangs, including holding output pipes open, and the execution/caller deadline expires
- **THEN** the runner terminates and reaps the subprocess group and returns an error without waiting indefinitely for pipe closure

### Requirement: Dashboard authoring persists and reports honest status

Typed ark-api Tool endpoints SHALL preserve inline source/language through create, detail read, and PUT update. Handwritten DTOs, generated SDK models, and dashboard serialization SHALL all support the fields. List responses SHALL expose language for the badge without including script source.

The existing Add Tool flow SHALL offer Inline, a required monospace source textarea, and a required language selector with no default. Client validation SHALL check non-whitespace source and UTF-8 byte size without trimming persisted source; server validation remains authoritative. Source/language edits SHALL persist to the active namespace and round-trip when reopened. Admission failures and Pending reasons SHALL be visible.

The authoring-first release SHALL provision no runners or usable execution endpoints. It SHALL persist authorized Tools as Pending with a clear not-yet-executable message until the runtime is installed and prerequisites succeed.

#### Scenario: Create and reopen

- **GIVEN** an authorized impersonated user selects Inline and supplies valid fields
- **WHEN** the form is submitted and reopened
- **THEN** the source and language round-trip unchanged in the selected namespace
- **AND** the list shows an inline/language badge without downloading every script

#### Scenario: Edit and reopen

- **WHEN** an authorized user changes source or language and saves
- **THEN** PUT persists the changes and a subsequent detail read displays them

#### Scenario: Invalid form input

- **WHEN** language is unselected, source is whitespace-only, or its UTF-8 encoding exceeds 64 KiB
- **THEN** submission is blocked with a field-specific error

#### Scenario: Authoring before runtime installation

- **WHEN** an authorized user creates a Tool in the authoring-first release
- **THEN** the dashboard shows Pending and explicitly says it is not executable yet
- **AND** no runner or usable execution endpoint is provisioned

### Requirement: v1 scope remains bounded

Inline SHALL NOT support bundled scripts, custom images, third-party package installation, remote source references, reference-file mounts, cross-namespace attachments, streaming tool results, or author-controlled security relaxation. Unsupported fields SHALL NOT influence execution; clients using strict field validation MAY reject them, while CRD pruning SHALL NOT be misrepresented as a webhook rejection. Admission SHALL reject missing required inline source regardless of a supplied source reference.

#### Scenario: Unsupported image or source reference

- **WHEN** a request supplies a custom image field alongside valid source
- **THEN** it cannot select that image or bypass the fixed language image
- **AND** a request with only a source reference and no inline source is rejected

#### Scenario: Missing third-party package

- **WHEN** a script imports a package absent from the documented runtime
- **THEN** execution reports the import failure without installing packages
- **AND** author guidance directs dependency-requiring tools to MCPServer
