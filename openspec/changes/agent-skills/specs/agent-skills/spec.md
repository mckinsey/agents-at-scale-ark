## ADDED Requirements

### Requirement: Skill CRD wraps a Claude-Code-shaped file bundle

The operator SHALL accept a `Skill` custom resource (`ark.mckinsey.com/v1alpha1`) with the following spec fields:

- `files` (map of relative path → string content, required, MUST contain a `SKILL.md` entry)
- `tools.exclude` (optional list of relative paths under `scripts/` to skip during script discovery)
- `tools.include` (optional list of relative paths outside `scripts/` to expose as tools despite not matching the discovery rule)
- `network.egress` (optional list of `{ host, port }`)
- `secrets` (optional list of `{ name, mountPath }`)
- `serviceAccount.roles` (optional list of `RoleRef` entries, restricted to an operator-configured allow-list)
- `resources` (optional, standard Kubernetes `ResourceRequirements`)
- `preload` (optional boolean, default false; when true, the skill's full SKILL.md body is inlined into the system prompt every turn rather than fetched lazily via `load_skill`)
- `keepWarm` (optional boolean, default false)
- `idleTimeout` (optional duration, default `60s`)

The `Skill` CRD SHALL NOT include `runtime`, `description`, `instructions`, or `scripts` fields. Prose and metadata are sourced from `files["SKILL.md"]`. The language each script runs as is determined at invocation time by the runner image (per the "Runner image contract" requirement); a single skill may freely mix bash, python, and node scripts.

#### Scenario: Minimal valid skill

- **WHEN** a `Skill` is applied with a `files` map containing only a `SKILL.md` entry whose frontmatter declares `description`
- **THEN** the validating webhook accepts the object
- **AND** the reconciler creates the owned `ConfigMap`, `ServiceAccount`, `NetworkPolicy` (deny-all), `Deployment` (`replicas: 0`), `Service`, synthetic `MCPServer`, and zero `Tool` objects (no scripts to discover)

#### Scenario: Skill rejected when SKILL.md is missing

- **WHEN** a `Skill` is applied with a `files` map that does not contain a key `SKILL.md`
- **THEN** the validating webhook rejects the admission with a message naming the missing file

#### Scenario: Skill mixes bash and python scripts

- **GIVEN** a `Skill` whose `files` contains `scripts/extract.sh` (bash, with shebang) and `scripts/summarise.py` (python, `.py` extension)
- **WHEN** the agent invokes `<skill>_extract`
- **THEN** the runner executes the bash script
- **WHEN** the agent invokes `<skill>_summarise`
- **THEN** the runner executes the python script
- **AND** both invocations succeed in the same per-skill pod with no per-skill runtime configuration

#### Scenario: Skill rejected when the bundle exceeds the inline cap

- **WHEN** a `Skill` is applied whose total `files` payload exceeds 900 KiB
- **THEN** the validating webhook rejects the admission with a message pointing the author at MCPServer

#### Scenario: Script in unsupported language reports a tool error

- **GIVEN** a `Skill` whose `files` contains `scripts/convert.go`
- **WHEN** the agent invokes `<skill>_convert`
- **THEN** the runner returns a tool error indicating the `.go` extension is not in the v1 dispatch allow-list and pointing the author at MCPServer for languages outside the runner image
- **AND** the rest of the skill's scripts continue to work normally

### Requirement: SKILL.md is parsed for description and instructions

The reconciler SHALL parse `files["SKILL.md"]` as a markdown document with optional YAML frontmatter delimited by `---` lines. The frontmatter, if present, SHALL be parsed as YAML; the field `description` (string, ≤ 200 chars) is required and is what surfaces in the agent's catalog. The body — everything after the closing `---` — is what `load_skill(name)` returns. Skills whose SKILL.md cannot be parsed, or whose frontmatter lacks `description`, SHALL be rejected by the validating webhook.

#### Scenario: Frontmatter description used as catalog entry

- **GIVEN** a `Skill` whose `SKILL.md` frontmatter is `description: Analyse a COBOL file and draft a Python rewrite`
- **WHEN** an agent attaches the skill
- **THEN** the agent's catalog block contains the line `- <name>: Analyse a COBOL file and draft a Python rewrite`

#### Scenario: load_skill returns the markdown body only

- **GIVEN** a `SKILL.md` containing `---\ndescription: …\n---\n\nWhen analysing a COBOL program:\n…`
- **WHEN** the model calls `load_skill(name)` for that skill
- **THEN** the returned content is the markdown body
- **AND** the YAML frontmatter is not included

#### Scenario: SKILL.md missing description rejected

- **WHEN** a `SKILL.md` is provided with frontmatter that lacks a `description` field
- **THEN** the validating webhook rejects the admission

#### Scenario: SKILL.md frontmatter parse error rejected

- **WHEN** a `SKILL.md` is provided with malformed YAML frontmatter
- **THEN** the validating webhook rejects the admission with a parser error message

### Requirement: Inline fenced scripts in SKILL.md auto-extract to `scripts/`

The reconciler SHALL, when materialising the on-cluster `ConfigMap` for a `Skill`, walk `files["SKILL.md"]` and extract every fenced code block whose info string contains a `name=<filename>` attribute (`name="…"`, `name='…'`, or `name=<token>` with no surrounding whitespace). Each extracted block SHALL be written to the materialised `files` at:

- `scripts/<filename>` if the captured name does not contain a `/`, OR
- the captured path verbatim if it does contain a `/`.

If a target path is also explicitly present in `spec.files`, the explicit `spec.files` entry SHALL win. Fenced blocks without a `name=` attribute SHALL NOT be extracted — they remain part of the SKILL.md body and are returned verbatim by `load_skill`.

#### Scenario: Single-textarea authoring extracts inline fences

- **GIVEN** a `Skill` whose `spec.files` contains only a `SKILL.md` entry, and that `SKILL.md` contains a fenced block ` ```bash name=extract.sh\n#!/usr/bin/env bash\n…\n``` `
- **WHEN** the reconciler builds the bundle ConfigMap
- **THEN** the ConfigMap contains both `SKILL.md` (verbatim, fenced block intact) and `scripts/extract.sh` (the fenced block's contents)
- **AND** the discovery rule subsequently exposes the script as `<skill>_extract`

#### Scenario: Explicit files entry wins over inline fence

- **GIVEN** a `Skill` whose `spec.files` contains both `SKILL.md` (with a fenced block ` ```bash name=foo.sh\nINLINE\n``` `) and `scripts/foo.sh` (with content `EXPLICIT`)
- **WHEN** the reconciler builds the bundle ConfigMap
- **THEN** the ConfigMap's `scripts/foo.sh` entry contains `EXPLICIT`
- **AND** the inline fence in SKILL.md is preserved verbatim in the SKILL.md key (so `load_skill` returns it as documentation)

#### Scenario: Unmarked fence stays as documentation

- **GIVEN** a SKILL.md with a fenced block ` ```bash\necho example\n``` ` (no `name=` attribute)
- **WHEN** the reconciler builds the bundle ConfigMap
- **THEN** the ConfigMap contains `SKILL.md` with the fence preserved verbatim
- **AND** the ConfigMap contains no `scripts/example` (or any other script) derived from this fence

#### Scenario: Fence with explicit subdirectory in name=

- **GIVEN** a fenced block with info string `bash name=bin/foo.sh`
- **WHEN** the reconciler extracts it
- **THEN** the resulting path is `bin/foo.sh` (not `scripts/bin/foo.sh`)
- **AND** for that file to become a tool, the author must add `bin/foo.sh` to `spec.tools.include` (since the discovery rule's path prefix requires `scripts/`)

### Requirement: Scripts are auto-discovered from the file bundle

The runner image SHALL discover scripts at startup by walking `/skill/`. A file SHALL be exposed as a tool iff **all** of:

1. Its path under the bundle is exactly two segments and the first segment is `scripts/`.
2. Either the file's first line begins with `#!`, or its extension is in the runtime allow-list (`.sh`, `.py`, `.js`, `.ts`, `.rb`).
3. Its path is not present in `spec.tools.exclude`.

A file with a path in `spec.tools.include` SHALL be exposed as a tool regardless of the path-prefix rule, provided it satisfies the shebang-or-extension check.

A discovered script SHALL be exposed as an MCP tool named `<skill-name>_<basename-without-extension>`, where `_` (underscore) is the separator. Discovered scripts SHALL NOT be exposed with names containing `.` (period). Files not exposed as tools SHALL still be mounted at `/skill/<path>` so other scripts can read them.

#### Scenario: Standard discovery

- **GIVEN** a `Skill` whose `files` map contains `scripts/extract.sh` (with shebang) and `scripts/structure.py`
- **WHEN** the runner starts
- **THEN** it advertises two MCP tools: `<skill>_extract` and `<skill>_structure`
- **AND** their MCP `list_tools` response shows the two tool names with the `_` separator

#### Scenario: Reference file is mounted but not exposed

- **GIVEN** a `Skill` containing `files["templates/example.cbl"]`
- **WHEN** the runner starts
- **THEN** the file is mounted at `/skill/templates/example.cbl` for scripts to read
- **AND** it is not advertised as an MCP tool

#### Scenario: Helper under scripts/ excluded

- **GIVEN** a `Skill` containing `files["scripts/lib.sh"]` and `spec.tools.exclude: [scripts/lib.sh]`
- **WHEN** the runner starts
- **THEN** the file is mounted at `/skill/scripts/lib.sh` for other scripts to read
- **AND** it is not advertised as an MCP tool

#### Scenario: Non-`scripts/` file included via override

- **GIVEN** a `Skill` containing `files["bin/foo.sh"]` (with shebang) and `spec.tools.include: [bin/foo.sh]`
- **WHEN** the runner starts
- **THEN** it advertises `<skill>_foo` as an MCP tool

#### Scenario: File without shebang and without allowed extension is reference-only

- **GIVEN** a `Skill` containing `files["scripts/notes.txt"]`
- **WHEN** the runner starts
- **THEN** the file is mounted at `/skill/scripts/notes.txt`
- **AND** it is not advertised as an MCP tool

### Requirement: Skill controller reconciles to owned Kubernetes objects

The `Skill` controller SHALL, for each `Skill`, reconcile a set of owned objects such that the file bundle is mounted at `/skill`, the pod runs with the documented security defaults, and external traffic reaches the pod only via the scale-to-zero activator. Each owned object SHALL set an owner reference pointing at the `Skill`, so that deleting the `Skill` cascades to all owned objects.

#### Scenario: Content-hashed bundle ConfigMap

- **WHEN** a `Skill` is reconciled
- **THEN** a `ConfigMap` named `<skill>-<hash>` is created in the skill's namespace containing one key per file in `spec.files`
- **AND** the hash covers the full `spec.files` map deterministically
- **AND** two `Skill`s with byte-identical `files` collapse to the same `ConfigMap` name

#### Scenario: Security-hardened pod template

- **WHEN** a `Skill` is reconciled
- **THEN** the generated `Deployment` sets `automountServiceAccountToken: false`
- **AND** the pod security context is `runAsNonRoot: true`, `runAsUser: 65532`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`
- **AND** the default resource limits are `cpu: 500m`, `memory: 256Mi` unless `spec.resources` overrides them

#### Scenario: Default-deny egress

- **WHEN** a `Skill` is reconciled with no `spec.network.egress` entries
- **THEN** a `NetworkPolicy` is created that selects the skill pod and permits no egress

#### Scenario: Opt-in egress allow-list

- **WHEN** a `Skill` is reconciled with `spec.network.egress: [{host: api.example.com, port: 443}]`
- **THEN** the generated `NetworkPolicy` permits egress to `api.example.com:443` only

#### Scenario: Owner-reference cascade on delete

- **WHEN** a `Skill` is deleted
- **THEN** every controller-owned object (ConfigMap, ServiceAccount, NetworkPolicy, Deployment, Service, MCPServer, all per-script Tool objects) is deleted by the garbage collector

### Requirement: Scale-to-zero activator brings pods from 0 to 1 on demand

The `skillactivator` subsystem SHALL front each skill's `Service` as an HTTP proxy. When a request arrives for a skill whose `Deployment` has zero ready pods, the activator SHALL scale the `Deployment` to `replicas: 1`, wait for readiness, and forward the request. After a skill has been idle for `spec.idleTimeout` (default `60s`), the controller SHALL scale the `Deployment` back to `replicas: 0`. Skills with `spec.keepWarm: true` SHALL NOT be scaled down.

#### Scenario: Cold start on first request

- **GIVEN** a skill whose `Deployment` has `replicas: 0`
- **WHEN** an MCP request arrives at the skill's `Service`
- **THEN** the activator scales the `Deployment` to `1`
- **AND** the activator waits for a ready pod
- **AND** the request is forwarded and the response returned to the caller

#### Scenario: Scale back after idle

- **GIVEN** a skill that last served a request 61 s ago with `idleTimeout: 60s` and `keepWarm: false`
- **WHEN** the controller's idle sweeper runs
- **THEN** the `Deployment` is scaled to `replicas: 0`

#### Scenario: keepWarm skips scale-down

- **GIVEN** a skill with `keepWarm: true` that has been idle for > idleTimeout
- **WHEN** the controller's idle sweeper runs
- **THEN** the `Deployment` remains at `replicas: 1`

### Requirement: Agents attach skills via `spec.skills`

The `Agent` CRD SHALL expose an optional field `spec.skills`, a list of `{ name: string, namespace?: string }` entries. When present, each referenced `Skill` SHALL contribute to the agent's effective tool surface via the lazy-load protocol.

#### Scenario: Attaching a skill contributes tools

- **GIVEN** an `Agent` with `spec.skills: [{ name: cobol-migrator }]` and the referenced skill exposes scripts `extract.sh` and `structure.py`
- **WHEN** the agent reconciles
- **THEN** the agent's effective MCP tool list includes a built-in `load_skill` plus `cobol-migrator_extract` and `cobol-migrator_structure`
- **AND** the agent's existing `spec.tools` entries remain unaffected

#### Scenario: Skill scripts are callable without listing them in spec.tools

- **GIVEN** an `Agent` with `spec.skills: [{ name: cobol-migrator }]` and `spec.tools: []`
- **WHEN** the model calls `cobol-migrator_extract(file: "…")` during a turn
- **THEN** the tool call succeeds and returns the script's stdout
- **AND** the agent author was NOT required to add a `Tool` entry referencing `cobol-migrator_extract` to `spec.tools`

#### Scenario: Detaching a skill removes its tools cleanly

- **GIVEN** an agent that previously had `spec.skills: [{ name: cobol-migrator }]` and the skill exposed two scripts
- **WHEN** the agent is updated to `spec.skills: []`
- **THEN** on the next turn, neither `cobol-migrator_extract` nor `cobol-migrator_structure` appears in the agent's tool list
- **AND** no manual cleanup of `spec.tools` is needed

#### Scenario: Missing skill reference

- **GIVEN** an `Agent` with `spec.skills: [{ name: does-not-exist }]`
- **WHEN** the agent reconciles
- **THEN** the agent's `status.conditions` includes `Available=False` with reason `SkillNotFound`

### Requirement: Lazy-load protocol for skill context

The Ark execution engine SHALL, when building a system prompt for an agent with attached skills, inject a catalog block listing each skill's name and the `description` parsed from its `SKILL.md` frontmatter. The execution engine SHALL register a built-in tool `load_skill(name: string)` on the agent's tool list. Calling `load_skill` with a valid skill name SHALL return that skill's SKILL.md body (frontmatter stripped). Per-script tools (`<skill>_<script>`) SHALL be registered from the start but SHALL carry minimal per-tool descriptions — the authoritative "how to use" prose is delivered via `load_skill`.

When a skill has `spec.preload: true`, its full SKILL.md body SHALL be injected into the agent's system prompt every turn, and the catalog entry for that skill SHALL be omitted (no `load_skill` call is needed).

#### Scenario: Catalog injection

- **GIVEN** an agent with three attached skills `a`, `b`, `c`, none of which have `preload: true`
- **WHEN** the execution engine assembles the system prompt for a turn
- **THEN** the prompt contains a catalog block with three entries of the form `- <name>: <description>`
- **AND** no full SKILL.md bodies appear in the prompt

#### Scenario: load_skill returns the SKILL.md body

- **WHEN** the model calls `load_skill(name: "cobol-migrator")`
- **THEN** the tool returns the markdown body of the referenced skill's SKILL.md
- **AND** the YAML frontmatter is not included

#### Scenario: Preload bypasses lazy-load

- **GIVEN** an agent with one attached skill that has `spec.preload: true`
- **WHEN** the execution engine assembles the system prompt
- **THEN** that skill's full SKILL.md body is inlined into the system prompt
- **AND** the skill does not appear in the catalog block
- **AND** `load_skill` is still registered for any other (non-preloaded) skills the agent has

### Requirement: Runner image contract

Ark SHALL publish a single multi-language runner image `ark-skill-runner:v1` (Alpine-based) that bundles `bash`, `python@3.12`, and `node@20`. The image SHALL, when started, perform script discovery (per the rule above), expose an MCP HTTP server, and advertise one tool per discovered script via `list_tools`. Tool invocation SHALL execute the corresponding script inside the pod, dispatched per-script as follows:

1. If the script's first line is a shebang (`#!`), the runner SHALL `exec` the file directly and let the kernel honour the shebang.
2. Otherwise the runner SHALL dispatch by extension: `.sh` → `bash`, `.py` → `python3`, `.js` → `node`, `.ts` → `tsx`. Any other extension without a shebang SHALL produce a tool error.

The runner SHALL map the tool's JSON arguments to the script's argv, stream `stdout` back as the tool result (trimmed to 256 KiB), log `stderr`, and return a tool error if the exit code is non-zero (tool error message includes the last 4 KiB of `stderr`).

#### Scenario: Successful Python script invocation

- **GIVEN** a skill with `files["scripts/summarise.py"]` that reads `sys.argv[1]` and prints a summary
- **WHEN** the agent calls `<skill>_summarise(file: "/skill/templates/input.csv")`
- **THEN** the runner dispatches by extension and invokes `python3 /skill/scripts/summarise.py /skill/templates/input.csv`
- **AND** the tool response is the script's stdout

#### Scenario: Shebang dispatch overrides extension

- **GIVEN** a skill with `files["scripts/extract"]` whose first line is `#!/usr/bin/env bash`
- **WHEN** the agent calls `<skill>_extract`
- **THEN** the runner `exec`s the file directly (no extension-based dispatch is needed)
- **AND** the kernel honours the shebang and runs the script under bash

#### Scenario: Mixed-language skill in a single pod

- **GIVEN** a skill containing `scripts/extract.sh` and `scripts/summarise.py`, both running in the same per-skill `ark-skill-runner:v1` pod
- **WHEN** the agent invokes `<skill>_extract` and then `<skill>_summarise`
- **THEN** both invocations succeed without any per-skill runtime configuration
- **AND** no separate image, container, or pod is required per language

#### Scenario: Script fails with non-zero exit

- **GIVEN** a script that exits with status 1 and writes `"bad input"` to stderr
- **WHEN** the agent invokes that script
- **THEN** the tool call returns an error
- **AND** the error message includes `"bad input"`

#### Scenario: Oversize stdout is trimmed

- **GIVEN** a script that emits 5 MiB of stdout
- **WHEN** the agent invokes that script
- **THEN** the returned tool result is ≤ 256 KiB
- **AND** the result indicates that the output was truncated

### Requirement: `ark skill import` and `export` round-trip a Claude-skill folder

The `ark` CLI SHALL provide subcommands `ark skill import <dir>` and `ark skill export <name> [--to-dir <dir>]`. `import` SHALL read every regular file in `<dir>` recursively and emit a `Skill` CRD YAML on stdout containing the `files` map keyed by paths relative to `<dir>`. `export` SHALL fetch the named `Skill` from the cluster and write each `files` entry to a corresponding path under `<dir>`. The two commands SHALL be inverses for any text-only skill bundle.

#### Scenario: Import a Claude-skill folder

- **GIVEN** a directory `~/.claude/skills/cobol-migrator/` containing `SKILL.md`, `scripts/extract.sh`, `scripts/structure.py`, and `templates/example.cbl`
- **WHEN** the user runs `ark skill import ~/.claude/skills/cobol-migrator`
- **THEN** stdout is a YAML document with `kind: Skill`, `metadata.name: cobol-migrator` (derived from the directory name), and `spec.files` containing four entries with the corresponding paths and contents
- **AND** the document is accepted by `kubectl apply -f -`

#### Scenario: Export round-trips a skill

- **GIVEN** a `Skill` named `cobol-migrator` in the cluster
- **WHEN** the user runs `ark skill export cobol-migrator --to-dir ./out`
- **THEN** `./out/SKILL.md`, `./out/scripts/extract.sh`, `./out/scripts/structure.py`, and `./out/templates/example.cbl` exist with the original contents

### Requirement: v1 feature scope is explicitly bounded

The v1 `Skill` CRD SHALL NOT support OCI image-based skills, Git-based skill sources, per-skill custom runner images, languages outside the default `ark-skill-runner:v1` image (Go, Rust, Ruby, custom interpreter versions, etc.), cross-namespace skill references, or streaming tool responses. Authors requiring any of these SHALL continue to use `MCPServer`. These exclusions SHALL be documented in the Skill reference page.

#### Scenario: OCI image source rejected

- **WHEN** a `Skill` is applied with a `spec.source.image` field
- **THEN** the validating webhook rejects the admission with a message pointing the author at MCPServer
