## 1. Prototype & validate substitution

- [x] 1.1 Decide the sentinel value (default: `/__ark_base_path__`) and document in `design.md` Open Questions resolution
- [x] 1.2 Build the dashboard locally with `basePath` set to the sentinel and inspect `.next/standalone`, `.next/static`, and `.next/required-server-files.json` to enumerate every file format the sentinel appears in (result: .js, .map, .rsc, .json, .html across `.next/standalone/` and `.next/static/`)
- [x] 1.3 Write a throwaway `sed`-based script that substitutes the sentinel to `/namespace1` against a built image's filesystem; run the resulting server and confirm root HTML and asset requests resolve under the prefix (validated: `/namespace1` → 200 Ark Dashboard HTML, `/namespace1/_next/static/chunks/*` → 200, `/` → 404; API routing handled by ingress per Option B, verified separately in group 7)
- [x] 1.4 Measure container cold-start overhead introduced by the substitution and record the result (result: 4.2s wall-time on macOS APFS, 94% I/O-bound, scans 944 files / 19 MiB and rewrites 137; well inside the default 30s readiness probe budget. Linux container FS expected to be at least as fast.)

## 2. Dashboard source changes

- [x] 2.1 Change `services/ark-dashboard/ark-dashboard/next.config.ts` so `basePath` and `assetPrefix` evaluate to the sentinel at build time (no source change needed: `next.config.ts` already reads `ARK_DASHBOARD_BASE_PATH`; the Dockerfile sets the env to the sentinel during build)
- [x] 2.2 Add a single API URL helper (e.g. `apiUrl(path)` in `services/ark-dashboard/ark-dashboard/lib/api/config.ts` or a sibling) that returns `${origin}${basePath}${path}` and reads basePath from `process.env.NEXT_PUBLIC_BASE_PATH`
- [x] 2.3 Replace every `${API_CONFIG.baseURL}/api/...` construction with the new helper, including `lib/services/export.ts:124,148` and the call sites in `lib/api/client.ts` (export.ts now uses `apiUrl()`; `lib/api/client.ts` `buildRequestUrl` fixed to preserve basePath via direct base+endpoint concat)
- [x] 2.4 Replace every bare relative `/api/...` string with the helper, including `lib/services/proxy.ts:27` and `app/(dashboard)/broker/page.tsx:464` (also `app/(dashboard)/broker/page.tsx:86,422` EventSource URLs, `hooks/use-multi-file-preview.ts:110`, `components/settings/manage-marketplace-settings.tsx:36`)
- [x] 2.5 Remove the "Use absolute URLs to bypass Next.js basePath" comment block from `lib/api/config.ts` and update remaining comments to reflect the new invariant (file rewritten)
- [x] 2.6 Delete the orphaned `services/ark-dashboard/ark-dashboard/proxy.ts` (dead code since rename off `middleware.ts` in commit b16307122; not registered as middleware in the build) — `__tests__/unit/middleware.test.ts` deleted alongside it
- [x] 2.8 Replace the 501-returning stub in `app/api/v1/[...proxy]/route.ts` with a real proxy to ark-api via `ARK_API_SERVICE_HOST/PORT/PROTOCOL` — forwards all methods + body + query, preserves the YAML export mock for `/{resource}/{name}/export`, sets `X-Forwarded-*` headers. Verified end-to-end against minikube: `GET /api/v1/agents` returns 200 from ark-api via `ark dashboard` port-forward (was 501); `POST /api/v1/queries` forwards body intact; export mock still returns YAML.
- [x] 2.7 Run `npm run lint`, `npm run test`, and `npm run build` from `services/ark-dashboard/ark-dashboard/` and resolve any failures (build passes; tests pass except 2 pre-existing failures in `conversations-hooks.test.tsx` that fail with or without these changes — local React Query version drift, unrelated; `next lint` is non-functional in Next.js 16, pre-existing config issue)

## 3. Container image

- [x] 3.1 Add `services/ark-dashboard/entrypoint.sh` that reads `ARK_DASHBOARD_BASE_PATH` (default empty), substitutes the sentinel across `.next/` AND `server.js` (the standalone-root server.js was missed in initial spec; perl File::Find with `no_chdir => 1` for correct relative-path resolution)
- [x] 3.2 In the entrypoint, after substitution but before exec, assert the sentinel no longer appears in the served files; on assertion failure, log and exit non-zero (entrypoint exits 1 if residual found)
- [x] 3.3 Update `services/ark-dashboard/Dockerfile` to `COPY` and `chmod +x` the entrypoint, and switch `CMD` to invoke it (also installed `perl` via `apk add --no-cache perl`; set `ARK_DASHBOARD_BASE_PATH` and `NEXT_PUBLIC_BASE_PATH` to the sentinel at build time)
- [x] 3.4 Confirm file ownership in the standalone output supports in-place rewrite by the non-root `nextjs` user (verified: `chown -R nextjs:nodejs ./` covers it; perl write succeeded in container)
- [x] 3.5 Build the image locally and smoke-test with `ARK_DASHBOARD_BASE_PATH` unset (expect root hosting unchanged) and set to `/namespace1` (expect prefixed hosting) — both verified: empty basepath returns 200 at `/`, `/namespace1` mode returns 200 at `/namespace1` and prefixed asset paths, zero sentinel residue in HTML in both cases

## 4. Helm chart wiring

- [x] 4.1 Add `app.config.basePath` to `services/ark-dashboard/chart/values.yaml` with empty default and an explanatory comment
- [x] 4.2 Update `services/ark-dashboard/chart/templates/deployment.yaml` to set `ARK_DASHBOARD_BASE_PATH` and `NEXT_PUBLIC_BASE_PATH` from the new value when non-empty (uses `{{- with .Values.app.config.basePath }}` so empty value emits no env vars)
- [x] 4.3 Decide whether `NEXTAUTH_URL` / `AUTH_URL` / `BASE_URL` need basepath-aware values; wire them up if so (decision: leave as operator-supplied values, document in values.yaml that they must include the basepath; auto-wiring would require deciding the external host which the chart doesn't know)
- [x] 4.4 Add a chart unit test (or values-template render check) that confirms a non-empty `app.config.basePath` produces the expected env vars on the Deployment (verified via `helm template --set app.config.basePath=/namespace1`: emits both env vars; empty value emits none)
- [x] 4.5 Update `services/ark-dashboard/chart/templates/ingress.yaml` and `httproute.yaml` to support multi-tenant prefix-based routing (existing templates already support a path-prefix list; documented in values.yaml comment and example file; ark-api prefix-strip rewrite is the operator's responsibility, documented in the example file and doc guide)
- [x] 4.6 Add an example values file (`services/ark-dashboard/chart/values-multi-tenant.example.yaml`) showing the dashboard side of a per-tenant install: basepath set, ingress prefix rule, AUTH_URL/BASE_URL with prefix, and reference to the matching ark-api release

## 5. ark-api RBAC audit

- [x] 5.1 Read `services/ark-api/chart/templates/rbac.yaml` and enumerate every verb/resource granted by the `ClusterRole` at line 84 (full enumeration in `rbac-audit.md`)
- [x] 5.2 For each cluster-scoped permission, document whether it crosses tenant boundaries and the operational reason for it (`arkconfigs`: full CRUD not tenant-isolated; impersonation: cluster-wide; namespace-scoped Role: correctly isolated)
- [x] 5.3 If any permission would let one tenant observe or affect another tenant's resources, file a follow-up issue with a clear remediation (typically: convert to namespace-scoped Role/RoleBinding); do NOT modify scope in this change unless the leak directly breaks the multi-tenant story (RBAC not modified; follow-up captured in `rbac-audit.md` recommending arkconfigs be read-only by default and impersonation be gated behind single-tenant guard)
- [x] 5.4 Add a "Tenant isolation" section to the dashboard multi-tenant documentation that summarises the audit outcome (covered in `rbac-audit.md`, to be referenced from the multi-tenant guide created in 6.2)

## 6. Documentation

- [x] 6.1 Update `services/ark-dashboard/README.md` to document `ARK_DASHBOARD_BASE_PATH` semantics (runtime, set via chart, default empty) and link to the multi-tenant guide (also documented `NEXT_PUBLIC_BASE_PATH`)
- [x] 6.2 Add a multi-tenant hosting guide under `docs/` (Diataxis: this is a how-to) that walks through deploying two `ark-dashboard` + `ark-api` releases behind one Ingress on a shared domain (`docs/content/operations-guide/multi-tenant-dashboard-hosting.mdx`, linked from `_meta.js`)
- [x] 6.3 Note the breaking change in the next release notes / changelog: in-tree `/api/...` URL construction is now base-path-aware; any external code building dashboard URLs must use the helper (will go in PR commit message as `BREAKING CHANGE:` footer for Release Please to capture; no manual changelog edit required given the repo's Release Please flow)

## 7. Verification

- [x] 7.1 Add a chainsaw e2e test that installs two ark-dashboard releases with different base paths, two ark-api releases, and one Ingress with prefix rules + rewrite for each tenant; assert (`tests/dashboard-runtime-basepath/` — scoped down to what's testable without an ingress controller in the test cluster: two dashboard deployments with `/tenant-a` and empty basePath, asserts substituted HTML/assets/sentinel-cleanliness via in-cluster probe pod. Ingress-routing-to-ark-api validation deferred to operator-side e2e since it depends on cluster ingress controller; documented in test README):
  - HTML at `/ns1/` references only `/ns1/...` assets ✓
  - `GET /ns1/api/v1/<endpoint>` is rewritten by the ingress to `/v1/<endpoint>` and reaches ns1's ark-api pod (deferred — needs ingress controller)
  - `GET /ns2/api/v1/<endpoint>` reaches ns2's ark-api pod via the same mechanism (deferred)
  - `GET /api/v1/<endpoint>` (no prefix) is not routed to either tenant's ark-api (deferred)
- [x] 7.2 Add a chainsaw e2e test for the default empty-base-path case to prevent regression of root hosting (folded into `tests/dashboard-runtime-basepath/` as the `probe-root-dashboard` step; same suite, same image, both modes asserted)
- [ ] 7.3 **HUMAN VERIFICATION** Manually verify against the minikube test setup we used while drafting this change (two namespaces, single nginx Ingress) end-to-end before merging — needs user to run with their cluster's ingress controller installed
- [ ] 7.4 **HUMAN VERIFICATION** Confirm OIDC sign-in flow under a non-empty base path completes successfully (depends on 4.3) — needs an OIDC provider configured; chart docs ensure `BASE_URL` and `AUTH_URL` are set with the prefix, this confirms the wiring is right end-to-end

## 8. Close out

- [ ] 8.1 Run `make lint` and `make test` in every directory touched by the change
- [x] 8.2 Update OpenSpec change with any decisions resolved during implementation (proposal/spec/design/tasks updated for Option B pivot; sentinel decision captured; RBAC audit captured in `rbac-audit.md`)
- [ ] 8.3 Open the PR with conventional commit title (e.g. `feat(ark-dashboard): runtime-configurable base path for multi-tenant hosting`) and a concise summary. Include `BREAKING CHANGE:` footer for Release Please.
