## 1. Operator — Tool CRD extension

- [ ] 1.1 Extend `Tool.spec.type` enum in `ark/api/v1alpha1/tool_types.go` to include `inline` (full enum: `http;mcp;agent;team;builtin;inline`). Add `Inline *InlineSpec` to `ToolSpec`. Declare `InlineSpec` with `Source string` (required, min length 1) and `Language string` (optional, enum `bash;python;node;ts`). Prove: `make -C ark manifests generate` produces deepcopy + CRD YAML with the new enum value and field.
- [ ] 1.2 Extend the `Tool` validating webhook to enforce: `type == inline` requires `spec.inline.source != ""`; `spec.inline` is rejected when `type != inline`; `spec.inline.language`, when set, is one of the four allowed values. Prove: `make -C ark test` with new webhook unit tests for each rejection case and the happy path.
- [ ] 1.3 Sync the regenerated CRD into the Helm chart at `ark/dist/chart/templates/crd/`. Prove: `helm template ark/dist/chart` contains the extended `Tool` CRD with `inline` in the type enum.

## 2. Operator — Inline tool reconciler

- [ ] 2.1 Add an `inline`-branch to `ark/internal/controller/tool_controller.go`: when `tool.spec.type == "inline"`, reconcile owned `ConfigMap`, `ServiceAccount`, `NetworkPolicy`, `Deployment`, `Service`, and a synthetic `MCPServer` (or equivalent internal endpoint record). All owned objects carry an owner reference to the `Tool`. Prove: `make -C ark test` with a "creates all owned objects" envtest case.
- [ ] 2.2 Compute a content hash of `spec.inline.source` and use it as the `ConfigMap` name suffix (`<tool>-<hash>`). Prove: unit test that two tools with byte-identical sources collapse to the same `ConfigMap` name.
- [ ] 2.3 Build the PodSpec with the documented security defaults: `automountServiceAccountToken: false`, `runAsNonRoot: true`, `runAsUser: 65532`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`. Default resources: `cpu: 500m`, `memory: 256Mi`. Prove: unit test asserts each field on the generated PodSpec exactly.
- [ ] 2.4 Generate a deny-all-egress `NetworkPolicy` for every inline tool. v1 exposes no relaxation knobs. Prove: unit test asserts the generated `NetworkPolicy` denies all egress.
- [ ] 2.5 Resolve the dispatch path at reconcile time: if `source` starts with `#!`, set the runner's container `command` to `["/usr/local/bin/exec-source"]` (the runner's exec-the-file-directly handler); otherwise pass `language` as an env var the runner uses for dispatch. Prove: unit tests for shebang case and each `language` value.
- [ ] 2.6 On `Tool` delete, GC all owned objects (owner references). Prove: envtest deletes a `Tool` and confirms `ConfigMap`, `Deployment`, `Service`, `NetworkPolicy`, `ServiceAccount`, and synthetic MCPServer disappear.
- [ ] 2.7 Reflect controller state on `Tool.status.conditions`: `Ready`, `Reconciled`, `Activatable`. Prove: unit test each transition.

## 3. Operator — Scale-to-zero activator

- [ ] 3.1 Scaffold `ark/internal/inlinetoolactivator/` as an HTTP front-end addressable as a single `Service` in the operator namespace. Routes by hostname or path to the correct backing inline-tool `Service`. Prove: `go test ./ark/internal/inlinetoolactivator/...` for routing logic.
- [ ] 3.2 On a request for an inline tool whose `Deployment` has zero ready pods, the activator scales the `Deployment` to `1`, waits for readiness (with a configurable timeout), and forwards the request. Prove: envtest for the cold-start happy path.
- [ ] 3.3 Idle sweeper: a controller-side goroutine scales inline-tool `Deployment`s back to `0` after `idleTimeout` (60 s default; no `spec.inline.keepWarm` in v1 unless reopened from design). Prove: envtest fast-forwards time and asserts scale-down.
- [ ] 3.4 Cold-start timeout returns a tool error to the caller indicating the activation deadline was exceeded. Prove: envtest with a pod whose readiness probe never passes.

## 4. Runner image — `ark-inline-runner:v1`

- [ ] 4.1 Author `ark/images/inline-runner/Dockerfile` on an Alpine base, installing `bash`, `python@3.12`, `node@20`, and `tsx`. Target image size ≤ ~150 MB compressed. Prove: `docker build` succeeds; size check in the image-build script.
- [ ] 4.2 Implement the runner program (Go, in `ark/images/inline-runner/main.go`) that exposes an MCP-shaped HTTP endpoint: `POST /invoke` with the JSON tool arguments, `GET /healthz` for readiness. Prove: unit tests for both endpoints.
- [ ] 4.3 Dispatch: if `/tool/source` begins with `#!`, exec the file directly; otherwise dispatch by the `LANGUAGE` env var (`bash` / `python` / `node` / `ts`); otherwise default to `bash`. Pass the request's JSON arguments as a single argv element (`argv[1]`). Prove: unit tests for shebang, each language env, and the bash default.
- [ ] 4.4 Capture `stdout` (trimmed to 256 KiB) as the tool result; capture `stderr` (last 4 KiB) for the error path. Non-zero exit returns an MCP-shaped error including the stderr tail. Prove: unit tests for happy path, error path, and stdout truncation.
- [ ] 4.5 Publish the image as `ghcr.io/mckinsey/ark-inline-runner:v1` via the existing image-publish workflow. Prove: image pull succeeds in a `kind` cluster running the chart.

## 5. SDK + API

- [ ] 5.1 Regenerate `lib/ark-sdk` types for the extended `Tool` shape. Prove: `make -C lib/ark-sdk generate && make -C lib/ark-sdk test`.
- [ ] 5.2 `services/ark-api` accepts the new `inline` type and `spec.inline.{source,language}` fields. Most of this comes via OpenAPI regeneration — verify the create/get/list paths round-trip an inline `Tool` end-to-end. Prove: `make -C services/ark-api test` with a new integration test that creates, reads, and deletes an inline tool.

## 6. Dashboard

- [ ] 6.1 Extend `services/ark-dashboard/.../components/editors/tool-editor.tsx` with an `Inline` option in the Type dropdown, plus two conditional fields when selected: `Language` (Auto / Bash / Python / Node / TS — "Auto" means omit the field and let the controller infer) and `Source` (a multiline textarea, expandable like the existing Input Schema field). Prove: `npm run build` in `services/ark-dashboard/ark-dashboard` is green; the existing tools-section render path renders the new badge.
- [ ] 6.2 Update `services/ark-dashboard/.../lib/services/tools.ts` `Tool.create` to pass the new fields when `type === 'inline'`. Prove: build is green; manual smoke test creates an inline tool via the dialog and it appears in the list with the language badge.
- [ ] 6.3 Update `components/rows/tool-row.tsx` to show a small `(inline · <language>)` badge for inline tools. Prove: build is green; renders in the seeded mock if the mock service is in use.

## 7. CLI (nice-to-have)

- [ ] 7.1 `ark tool create --inline --source-file ./foo.py --name csv-summarise --description "…" --input-schema ./schema.json` convenience: read the source file from disk, infer language from extension, POST a Tool. Prove: `make -C tools/ark-cli test` with a new CLI integration test.

## 8. Docs

- [ ] 8.1 Author a "Inline tools — write a function, skip the MCP server" user-guide page under `docs/`. Cover: when to use vs MCPServer, the YAML shape, the `argv[1]` JSON contract for each language, the security defaults, debugging (`kubectl logs`), and the v1 limitations. Prove: `make docs` renders the page without warnings; links validate.
- [ ] 8.2 Add a samples directory `samples/inline-tools/` with at least three illustrative tools (CSV summary in Python, runbook triage in bash, payload validator in Node). Each sample is a single applicable YAML file plus a short README. Prove: `kubectl apply -f samples/inline-tools/csv-summary.yaml` succeeds against a dev cluster and the tool is callable from a sample agent.

## 9. Cleanup — `agent-skills` change

- [ ] 9.1 Mark the `agent-skills` change as superseded in its `proposal.md` (header note pointing at `inline-tools`). Decide PR #1990 disposition (rebase onto this scope or close in favour of a fresh PR). Prove: `openspec list` shows both changes; the supersession note is unambiguous.
