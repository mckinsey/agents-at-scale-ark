## 1. Prototype & validate substitution

- [ ] 1.1 Decide the sentinel value (default: `/__ark_base_path__`) and document in `design.md` Open Questions resolution
- [ ] 1.2 Build the dashboard locally with `basePath` set to the sentinel and inspect `.next/standalone`, `.next/static`, and `.next/required-server-files.json` to enumerate every file format the sentinel appears in
- [ ] 1.3 Write a throwaway `sed`-based script that substitutes the sentinel to `/namespace1` against a built image's filesystem; run the resulting server and confirm root HTML, asset requests, and `/namespace1/api/v1/...` proxy paths all resolve
- [ ] 1.4 Measure container cold-start overhead introduced by the substitution and record the result (gate: must remain inside default readiness probe budget)

## 2. Dashboard source changes

- [ ] 2.1 Change `services/ark-dashboard/ark-dashboard/next.config.ts` so `basePath` and `assetPrefix` evaluate to the sentinel at build time
- [ ] 2.2 Add a single API URL helper (e.g. `apiUrl(path)` in `services/ark-dashboard/ark-dashboard/lib/api/config.ts` or a sibling) that returns `${origin}${basePath}${path}` and reads basePath from `process.env.NEXT_PUBLIC_BASE_PATH`
- [ ] 2.3 Replace every `${API_CONFIG.baseURL}/api/...` construction with the new helper, including `lib/services/export.ts:124,148` and the call sites in `lib/api/client.ts`
- [ ] 2.4 Replace every bare relative `/api/...` string with the helper, including `lib/services/proxy.ts:27` and `app/(dashboard)/broker/page.tsx:464`
- [ ] 2.5 Remove the "Use absolute URLs to bypass Next.js basePath" comment block from `lib/api/config.ts` and update remaining comments to reflect the new invariant
- [ ] 2.6 Confirm `proxy.ts` middleware still matches `${basePath}/api/` after substitution (no source change expected; verify via unit/integration test)
- [ ] 2.7 Run `npm run lint`, `npm run test`, and `npm run build` from `services/ark-dashboard/ark-dashboard/` and resolve any failures

## 3. Container image

- [ ] 3.1 Add `services/ark-dashboard/entrypoint.sh` that reads `ARK_DASHBOARD_BASE_PATH` (default empty), substitutes the sentinel across `.next/standalone`, `.next/static`, `required-server-files.json`, and any other locations identified in 1.2, then `exec node server.js`
- [ ] 3.2 In the entrypoint, after substitution but before exec, assert the sentinel no longer appears in the served files; on assertion failure, log and exit non-zero
- [ ] 3.3 Update `services/ark-dashboard/Dockerfile` to `COPY` and `chmod +x` the entrypoint, and switch `CMD` to invoke it
- [ ] 3.4 Confirm file ownership in the standalone output supports in-place rewrite by the non-root `nextjs` user (existing `chown -R nextjs:nodejs ./` should suffice; verify)
- [ ] 3.5 Build the image locally and smoke-test with `ARK_DASHBOARD_BASE_PATH` unset (expect root hosting unchanged) and set to `/namespace1` (expect prefixed hosting)

## 4. Helm chart wiring

- [ ] 4.1 Add `app.config.basePath` to `services/ark-dashboard/chart/values.yaml` with empty default and an explanatory comment
- [ ] 4.2 Update `services/ark-dashboard/chart/templates/deployment.yaml` to set `ARK_DASHBOARD_BASE_PATH` and `NEXT_PUBLIC_BASE_PATH` from the new value when non-empty
- [ ] 4.3 Decide whether `NEXTAUTH_URL` / `AUTH_URL` / `BASE_URL` need basepath-aware values; wire them up if so (resolves Open Question in design)
- [ ] 4.4 Add a chart unit test (or values-template render check) that confirms a non-empty `app.config.basePath` produces the expected env vars on the Deployment
- [ ] 4.5 Update `services/ark-dashboard/chart/templates/ingress.yaml` and `httproute.yaml` examples in `values.yaml` to show prefix-based routing for multi-tenant hosting

## 5. ark-api RBAC audit

- [ ] 5.1 Read `services/ark-api/chart/templates/rbac.yaml` and enumerate every verb/resource granted by the `ClusterRole` at line 84
- [ ] 5.2 For each cluster-scoped permission, document whether it crosses tenant boundaries and the operational reason for it
- [ ] 5.3 If any permission would let one tenant observe or affect another tenant's resources, file a follow-up issue with a clear remediation (typically: convert to namespace-scoped Role/RoleBinding); do NOT modify scope in this change unless the leak directly breaks the multi-tenant story
- [ ] 5.4 Add a "Tenant isolation" section to the dashboard multi-tenant documentation that summarises the audit outcome (what tenants can and cannot see about each other)

## 6. Documentation

- [ ] 6.1 Update `services/ark-dashboard/README.md` to document `ARK_DASHBOARD_BASE_PATH` semantics (runtime, set via chart, default empty) and link to the multi-tenant guide
- [ ] 6.2 Add a multi-tenant hosting guide under `docs/` (Diataxis: this is a how-to) that walks through deploying two `ark-dashboard` + `ark-api` releases behind one Ingress on a shared domain
- [ ] 6.3 Note the breaking change in the next release notes / changelog: in-tree `/api/...` URL construction is now base-path-aware; any external code building dashboard URLs must use the helper

## 7. Verification

- [ ] 7.1 Add a chainsaw e2e test that installs two ark-dashboard releases with different base paths against mock ark-api and asserts:
  - HTML at `/ns1/` references only `/ns1/...` assets
  - `GET /ns1/api/v1/<endpoint>` reaches the ns1 ark-api pod
  - `GET /ns2/api/v1/<endpoint>` reaches the ns2 ark-api pod
  - `GET /api/v1/<endpoint>` (no prefix) does not reach either tenant's ark-api
- [ ] 7.2 Add a chainsaw e2e test for the default empty-base-path case to prevent regression of root hosting
- [ ] 7.3 Manually verify against the minikube test setup we used while drafting this change (two namespaces, single nginx Ingress) end-to-end before merging
- [ ] 7.4 Confirm OIDC sign-in flow under a non-empty base path completes successfully (depends on 4.3)

## 8. Close out

- [ ] 8.1 Run `make lint` and `make test` in every directory touched by the change
- [ ] 8.2 Update OpenSpec change with any decisions resolved during implementation
- [ ] 8.3 Open the PR with conventional commit title (e.g. `feat(ark-dashboard): runtime-configurable base path for multi-tenant hosting`) and a concise summary
