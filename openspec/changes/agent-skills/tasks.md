## 1. Operator — Skill CRD + schema

- [ ] 1.1 Add `Skill` type to `ark/api/v1alpha1/skill_types.go` with `spec: { description, instructions, runtime, scripts, network?, secrets?, serviceAccount?, resources?, keepWarm? }`. Prove: `make -C ark manifests generate` produces deepcopy + CRD YAML.
- [ ] 1.2 Add `Skills []AgentSkillRef` to `AgentSpec` in `ark/api/v1alpha1/agent_types.go`. Prove: `make -C ark manifests generate && go build ./ark/...`.
- [ ] 1.3 Add a validating webhook for `Skill` that rejects: unknown runtime images, role refs outside the admin allow-list, CM payload > 900 KiB (10% below etcd cap). Prove: `make -C ark test` with new webhook unit tests.
- [ ] 1.4 Sync generated CRDs into the Helm chart (`ark/dist/chart/templates/crd/`). Prove: `helm template ark/dist/chart` contains both new CRDs.

## 2. Operator — Skill controller

- [ ] 2.1 Scaffold `ark/internal/controller/skill_controller.go` with a Reconciler that watches `Skill` and owns: `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment`, `Service`, `MCPServer`, `Tool`. Prove: `make -C ark test` with a minimal "creates all objects" test.
- [ ] 2.2 Compute content hash of `spec.instructions + spec.scripts`; name the scripts ConfigMap `<skill>-<hash>`. Prove: unit test that two equivalent specs collapse to the same CM name.
- [ ] 2.3 Generate PodSpec with the security defaults listed in `design.md`: `runAsNonRoot`, read-only root, drop-all caps, `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`. Prove: unit test asserts the PodSpec fields exactly.
- [ ] 2.4 Generate `NetworkPolicy` from `spec.network.egress`; default is deny-all egress. Prove: unit test for "no egress spec → deny-all" and "two egress entries → two matching rules".
- [ ] 2.5 Generate one `Tool` CRD per script, named `<skill>.<script-basename>`, labelled `ark.mckinsey.com/source-skill=<skill>`. Prove: unit test counts and naming.
- [ ] 2.6 On Skill delete, GC all owned objects (owner references). Prove: envtest deletes a Skill and confirms all owned objects disappear.
- [ ] 2.7 Reflect controller state to `Skill.status.conditions`: `Ready`, `Reconciled`, `Activatable`. Prove: unit test each transition.

## 3. Operator — scale-to-zero activator

- [ ] 3.1 New subsystem `ark/internal/skillactivator/` with an HTTP handler that fronts `<skill>.skills.svc`, queues the inbound request, scales the Deployment to 1 via the controller-runtime client, polls readiness, proxies the request. Prove: unit test with a faked K8s client and a staged readiness response.
- [ ] 3.2 Implement idle-timer: track last-request time per skill; reconciler scales Deployment back to 0 after 60 s (configurable via `spec.idleTimeout`). Prove: unit test with simulated clock.
- [ ] 3.3 Respect `spec.keepWarm: true` — skip the scale-to-zero idle path for that skill. Prove: unit test a `keepWarm` skill never has its replicas decremented.
- [ ] 3.4 Emit activation / deactivation Events on the Skill. Prove: envtest observes the Events.
- [ ] 3.5 Ship the activator as a Deployment in the Ark operator namespace with `replicas: 2` and a `PodDisruptionBudget`. Prove: `helm template` shows the expected manifests.

## 4. Skill runner images

- [ ] 4.1 Build `ark/images/skill-runner-python/` — slim base (`python:3.12-slim`), runs a minimal MCP server that: reads `/skill/instructions`, lists one tool per file in `/skill/scripts/`, runs the requested script with argv from tool args, returns stdout on success / stderr-tail on non-zero exit. Prove: `make -C ark/images/skill-runner-python test` (container smoke-test + a small pytest).
- [ ] 4.2 Same for `skill-runner-node` (`node:20-alpine`). Prove: `make -C ark/images/skill-runner-node test`.
- [ ] 4.3 Same for `skill-runner-bash` (`alpine:3.19` + `bash`). Prove: `make -C ark/images/skill-runner-bash test`.
- [ ] 4.4 Publish to `ghcr.io/mckinsey/ark-skill-runner-{python,node,bash}` on release. Prove: the release workflow builds and pushes all three.
- [ ] 4.5 Images enforce the I/O contract: argv mapping from tool arguments (string-only by default; typed if `spec.scripts.<name>.schema` is provided), `stdin` unused in v1, stdout → tool result (trimmed to 256 KiB), stderr logged and 4 KiB tail returned on non-zero exit. Prove: image integration tests for each of the four cases.

## 5. Execution engine — lazy-load + catalog

- [ ] 5.1 Ark completions engine reads `Agent.spec.skills`, resolves each to its `Skill` CRD, renders a catalog block into the system prompt. Prove: `make -C ark test` with a unit test that builds a system prompt for an agent with 0, 1, and 3 skills.
- [ ] 5.2 Register a built-in `load_skill(name)` tool on every agent that has `spec.skills`. The tool returns the resolved `Skill.spec.instructions`. Prove: unit test a fake completion request that calls `load_skill`.
- [ ] 5.3 Register `<skill>.<script>` MCP tools into the agent's tool list via the synthetic MCPServer that the controller owns; these are always visible. Prove: an end-to-end chainsaw test where the agent invokes a script.

## 6. ark-sdk — external executor parity

- [ ] 6.1 Regenerate Python SDK types from updated CRDs. Prove: `make -C lib/ark-sdk generate && make -C lib/ark-sdk lint`.
- [ ] 6.2 `ExecutorApp` receives skill metadata via A2A extension (ark-scoped); does the same catalog-plus-`load_skill` injection in its own prompt-assembly path. Prove: unit test in `lib/ark-sdk`.
- [ ] 6.3 Document in `lib/ark-sdk/README.md` the two new A2A extension fields (`skills_catalog`, `skills_server_endpoint`).

## 7. Samples + docs

- [ ] 7.1 `samples/skills/csv-summary/` — tiny Python skill that summarises a CSV. One file.
- [ ] 7.2 `samples/skills/cobol-migrator/` — the COBOL example from the design doc. One file.
- [ ] 7.3 `docs/content/developer-guide/skills.mdx` — user guide: authoring model, security model, scale-to-zero mental model, escape hatches, when to reach for MCPServer instead. Prove: `make docs` builds without warnings.
- [ ] 7.4 `docs/content/reference/resources/skill.mdx` — reference page for the `Skill` CRD. Prove: `make docs`.
- [ ] 7.5 `samples/skills/README.md` linking the two examples and pointing to the user guide.

## 8. End-to-end

- [ ] 8.1 Chainsaw test `tests/chainsaw/skills/lifecycle/` — apply a Skill, observe status Ready, observe all child objects, delete the Skill, observe GC.
- [ ] 8.2 Chainsaw test `tests/chainsaw/skills/activation/` — send an MCP request to a cold skill, observe scale 0→1, response received, scale 1→0 after idle.
- [ ] 8.3 Chainsaw test `tests/chainsaw/skills/agent-invocation/` — agent with one attached skill, model calls `load_skill` then `<skill>.<script>`, result returned. Uses `mock-llm` to make the model choice deterministic.
- [ ] 8.4 Chainsaw test `tests/chainsaw/skills/security/` — skill with deny-all egress cannot reach external networks; skill with explicit `spec.network.egress` can. Prove: the allowed case succeeds; the denied case fails with the expected error.

## 9. Migration / rollout

- [ ] 9.1 Release-note entry: no existing agents are affected (`Agent.spec.skills` is additive, defaulting to empty).
- [ ] 9.2 Feature flag `ARK_SKILLS_ENABLED` (default true) on the controller — lets operators disable the skill controller without downgrading Ark if something regresses. Prove: unit test the reconciler is a no-op when disabled.
- [ ] 9.3 Document in docs how operators configure the runtime-image allow-list and the admin-approved SA role list.
