## 1. Operator — Skill CRD + schema

- [ ] 1.1 Add `Skill` type to `ark/api/v1alpha1/skill_types.go` with `spec: { files (map<string,string>), tools.{include,exclude}?, network?, secrets?, serviceAccount?, resources?, preload?, keepWarm?, idleTimeout? }` (no `runtime` field — the single multi-language runner image dispatches per-script via shebang/extension). Prove: `make -C ark manifests generate` produces deepcopy + CRD YAML.
- [ ] 1.2 Add `Skills []AgentSkillRef` to `AgentSpec` in `ark/api/v1alpha1/agent_types.go`. Prove: `make -C ark manifests generate && go build ./ark/...`.
- [ ] 1.3 Add a validating webhook for `Skill` that rejects: role refs outside the admin allow-list, total `files` payload > 900 KiB, missing `files["SKILL.md"]`, malformed SKILL.md frontmatter, missing `description` in frontmatter, OCI image / Git source fields. Prove: `make -C ark test` with new webhook unit tests covering each rejection case.
- [ ] 1.4 Sync generated CRDs into the Helm chart (`ark/dist/chart/templates/crd/`). Prove: `helm template ark/dist/chart` contains both new CRDs.

## 2. Operator — Skill controller

- [ ] 2.1 Scaffold `ark/internal/controller/skill_controller.go` with a Reconciler that watches `Skill` and owns: `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment`, `Service`, `MCPServer`, and one `Tool` per discovered script. Prove: `make -C ark test` with a minimal "creates all objects" test.
- [ ] 2.2 Compute content hash of `spec.files`; name the bundle ConfigMap `<skill>-<hash>`. Prove: unit test that two equivalent specs collapse to the same CM name.
- [ ] 2.3 Implement SKILL.md frontmatter parser as a small package (`ark/internal/skills/skillmd`); extracts `description` (required), `triggers?`, `version?`. Prove: unit tests for valid frontmatter, missing `---`, malformed YAML, missing `description`.
- [ ] 2.4 Implement the inline-fence extractor in `ark/internal/skills/skillmd`: walk `files["SKILL.md"]`, find every fenced block whose info string contains a `name=…` attribute, materialise each one to `scripts/<name>` (or the verbatim path when the name contains a slash). Conflict rule: explicit `spec.files["scripts/<name>"]` wins over an inline fence with the same name. Prove: unit tests covering `Single-textarea authoring extracts inline fences`, `Explicit files entry wins over inline fence`, `Unmarked fence stays as documentation`, and `Fence with explicit subdirectory in name=` from `spec.md`.
- [ ] 2.5 Implement script-discovery rule (path under `scripts/` AND (shebang OR allow-listed extension) AND not in `tools.exclude`; plus `tools.include` overrides). Runs *after* the inline-fence extraction so it sees the materialised file set. Prove: unit tests covering the discovery scenarios in `spec.md` (`Standard discovery`, `Reference file mounted`, `Helper excluded`, `Non-scripts/ included`, `notes.txt is reference-only`).
- [ ] 2.6 Generate PodSpec with the security defaults: `automountServiceAccountToken: false`, `runAsNonRoot`, read-only root, drop-all caps, `seccompProfile: RuntimeDefault`. Prove: unit test asserts the PodSpec fields exactly.
- [ ] 2.7 Generate `NetworkPolicy` from `spec.network.egress`; default is deny-all egress. Prove: unit test for "no egress spec → deny-all" and "two egress entries → two matching rules".
- [ ] 2.8 Generate one `Tool` CRD per discovered script, named `<skill>_<basename-without-extension>` (underscore separator), labelled `ark.mckinsey.com/source-skill=<skill>`. Prove: unit test on names + label.
- [ ] 2.9 On `Skill` delete, GC all owned objects (owner references). Prove: envtest deletes a Skill and confirms all owned objects disappear.
- [ ] 2.10 Reflect controller state to `Skill.status.conditions`: `Ready`, `Reconciled`, `Activatable`. Prove: unit test each transition.

## 3. Operator — scale-to-zero activator

- [ ] 3.1 New subsystem `ark/internal/skillactivator/` with an HTTP handler that fronts `<skill>.skills.svc`, queues the inbound request, scales the Deployment to 1 via the controller-runtime client, polls readiness, proxies the request. Prove: unit test with a faked K8s client and a staged readiness response.
- [ ] 3.2 Implement idle-timer: track last-request time per skill; reconciler scales Deployment back to 0 after `idleTimeout` (default `60s`). Prove: unit test with a simulated clock.
- [ ] 3.3 Respect `spec.keepWarm: true` — skip the scale-to-zero idle path for that skill. Prove: unit test.
- [ ] 3.4 Emit activation / deactivation Events on the Skill. Prove: envtest observes the Events.
- [ ] 3.5 Ship the activator as a Deployment in the Ark operator namespace with `replicas: 2` and a `PodDisruptionBudget`. Prove: `helm template` shows the expected manifests.

## 4. Skill runner image

- [ ] 4.1 Build `ark/images/skill-runner/` — single Alpine-based image (~150 MB) bundling `bash`, `python@3.12`, and `node@20`. Contains the MCP server that walks `/skill/`, discovers scripts per the rule (path-and-shebang/extension; the controller has already materialised inline fences into real files, so the runner does no markdown parsing), advertises tools via `list_tools`, and executes scripts on tool invocation. Prove: `make -C ark/images/skill-runner test` (container smoke-test plus tests covering the discovery rule with a mixed-language fixture skill).
- [ ] 4.2 Implement per-script dispatch inside the runner: shebang detection (first line `#!`) execs the file directly; otherwise dispatch by extension (`.sh` → `bash`, `.py` → `python3`, `.js` → `node`, `.ts` → `tsx`); any other extension without a shebang returns a tool error pointing at MCPServer. Prove: integration tests covering each dispatch path plus the unsupported-extension error case.
- [ ] 4.3 Publish to `ghcr.io/mckinsey/ark-skill-runner:v1` on release. Prove: the release workflow builds and pushes the image.
- [ ] 4.4 Image enforces the I/O contract: argv mapping from tool arguments (string-only by default; typed if a sidecar `<script>.json-schema` is present alongside the script), `stdin` unused in v1, stdout → tool result (trimmed to 256 KiB), stderr logged and 4 KiB tail returned on non-zero exit. Prove: image integration tests for each case.

## 5. Execution engine — lazy-load + catalog

- [ ] 5.1 Ark completions engine reads `Agent.spec.skills`, resolves each to its `Skill` CRD, parses each SKILL.md frontmatter, renders a catalog block into the system prompt. Prove: `make -C ark test` with a unit test that builds a system prompt for an agent with 0, 1, and 3 skills.
- [ ] 5.2 Register a built-in `load_skill(name)` tool on every agent that has at least one non-preload skill. The tool returns the resolved skill's SKILL.md body (frontmatter stripped). Prove: unit test a fake completion request that calls `load_skill`.
- [ ] 5.3 Skills with `spec.preload: true` SHALL have their full SKILL.md body inlined into the system prompt and SHALL NOT appear in the catalog. Prove: unit test mixing preload and non-preload attached skills.
- [ ] 5.4 Register `<skill>_<script>` MCP tools (underscore separator) into the agent's tool list via the synthetic MCPServer that the controller owns; these are always visible. Prove: an end-to-end chainsaw test where the agent invokes a script.
- [ ] 5.5 Include a short snippet of the skill's `description` in each per-script tool description, so non-Anthropic models that skip `load_skill` still have minimal context. Prove: unit test verifies the script tool's description includes the skill description.

## 6. ark-sdk — external executor parity

- [ ] 6.1 Regenerate Python SDK types from updated CRDs. Prove: `make -C lib/ark-sdk generate && make -C lib/ark-sdk lint`.
- [ ] 6.2 `ExecutorApp` receives skill metadata via A2A extension (ark-scoped); does the same catalog-plus-`load_skill` injection (and preload handling) in its own prompt-assembly path. Prove: unit test in `lib/ark-sdk`.
- [ ] 6.3 Document in `lib/ark-sdk/README.md` the new A2A extension fields (`skills_catalog`, `skills_server_endpoint`, `preloaded_skills`).

## 7. CLI — import / export

- [ ] 7.1 Add `tools/ark-cli/src/commands/skill/import.ts` (or Go equivalent) that walks a directory, reads each text file, emits a `Skill` CRD YAML on stdout with `metadata.name` taken from the directory name, `spec.runtime` taken from optional CLI flag or `SKILL.md` frontmatter, and `spec.files` containing the bundle. Prove: unit test against a fixture directory.
- [ ] 7.2 Add `tools/ark-cli/src/commands/skill/export.ts` that fetches a named `Skill` from the cluster and writes each `files` entry under `--to-dir`. Prove: unit test that round-trips a fixture skill through import → apply → export → diff.
- [ ] 7.3 Document both subcommands in `tools/ark-cli/README.md` and in the new docs page.

## 8. Samples + docs

- [ ] 8.1 `samples/skills/csv-summary/` — tiny Python skill folder (SKILL.md + scripts/summarise.py).
- [ ] 8.2 `samples/skills/cobol-migrator/` — the COBOL example from the design doc as a real skill folder.
- [ ] 8.3 `samples/skills/<each>/skill.yaml` — generated via `ark skill import` so users can `kubectl apply` directly without the CLI.
- [ ] 8.4 `docs/content/developer-guide/skills.mdx` — user guide: authoring model, on-disk layout, the discovery rule, security model, scale-to-zero mental model, `preload` escape hatch, when to reach for MCPServer instead. Prove: `make docs` builds without warnings.
- [ ] 8.5 `docs/content/developer-guide/import-claude-skill.mdx` — the import how-to: "you have a Claude-Code skill; here's how to bring it into Ark in two minutes".
- [ ] 8.6 `docs/content/reference/resources/skill.mdx` — reference page for the `Skill` CRD.
- [ ] 8.7 `samples/skills/README.md` linking the examples and pointing to the user guide.

## 9. End-to-end

- [ ] 9.1 Chainsaw test `tests/chainsaw/skills/lifecycle/` — apply a Skill, observe status Ready, observe all child objects, delete the Skill, observe GC.
- [ ] 9.2 Chainsaw test `tests/chainsaw/skills/activation/` — send an MCP request to a cold skill, observe scale 0→1, response received, scale 1→0 after idle.
- [ ] 9.3 Chainsaw test `tests/chainsaw/skills/agent-invocation/` — agent with one attached skill, model calls `load_skill` then `<skill>_<script>`, result returned. Uses `mock-llm` to make the model choice deterministic.
- [ ] 9.4 Chainsaw test `tests/chainsaw/skills/security/` — skill with deny-all egress cannot reach external networks; skill with explicit `spec.network.egress` can.
- [ ] 9.5 Chainsaw test `tests/chainsaw/skills/import-roundtrip/` — `ark skill import` against a fixture folder, `kubectl apply`, observe ready, `ark skill export` to a temp dir, `diff -r` the two dirs.

## 10. Migration / rollout

- [ ] 10.1 Release-note entry: no existing agents are affected (`Agent.spec.skills` is additive, defaulting to empty).
- [ ] 10.2 Feature flag `ARK_SKILLS_ENABLED` (default true) on the controller — lets operators disable the skill controller without downgrading Ark if something regresses. Prove: unit test the reconciler is a no-op when disabled.
- [ ] 10.3 Document in docs how operators configure the admin-approved SA role list and how to override the default `ark-skill-runner:v1` image (single global override; per-skill overrides are out of v1 scope).
