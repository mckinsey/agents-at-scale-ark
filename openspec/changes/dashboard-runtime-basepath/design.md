## Context

The Ark dashboard is a Next.js application built with `output: 'standalone'`. Its `basePath` is configured in `next.config.ts:8` as `process.env.ARK_DASHBOARD_BASE_PATH || ''` — read at build time by `next build`. Next.js bakes the resolved base path into the static HTML, every JavaScript chunk, the manifest, and `.next/required-server-files.json`. Setting the environment variable on a running pod has no effect because the bundles have already been emitted.

Compounding this, `lib/api/config.ts:2-5` deliberately bypasses `basePath` for browser-originated API calls by setting `API_CONFIG.baseURL = window.location.origin`. A comment in the file documents this is intentional. A few other call sites (`lib/services/proxy.ts:27`, `app/(dashboard)/broker/page.tsx:464`) use bare relative paths instead, so even today there is an inconsistency between absolute and relative API URL construction.

The dashboard chart deploys per-release and exposes `ARK_API_SERVICE_HOST/PORT/PROTOCOL` env vars (`services/ark-dashboard/chart/templates/deployment.yaml:51-56`). A prototype confirmed that despite a `proxy.ts` file at the dashboard root that looks like Next.js middleware, the file was deliberately renamed off `middleware.ts` in commit b16307122 and is no longer wired up — the compiled `middleware-manifest.json` is empty. In the cluster today, API traffic from the browser goes straight to ark-api through the cluster's ingress/gateway, not through the dashboard. The `ARK_API_SERVICE_*` env vars on the dashboard Deployment are therefore vestigial in the current behaviour. The `ark-api` chart itself is namespace-scoped (every template uses `{{ .Release.Namespace }}`), so deploying one release per tenant namespace is supported as-is.

The driving constraint: clients consume the dashboard through a single external domain and cannot rebuild the container image. The image we publish must serve any URL prefix the operator chooses at install time, and multiple per-tenant installs must coexist behind one Ingress.

## Goals / Non-Goals

**Goals:**

- One published `ark-dashboard` image that serves any URL base path chosen at deploy time.
- All emitted asset URLs, in-app navigation, and browser-originated API calls correctly prefixed when a base path is configured.
- First-class Helm value for base path; `helm install` is the only operator action required to host a new tenant.
- Per-tenant isolation by deploying one `ark-dashboard` + one `ark-api` release per tenant namespace, fronted by a single Ingress.
- Default behavior preserved: when no base path is configured, the dashboard behaves identically to today.

**Non-Goals:**

- A single dashboard pod serving multiple tenants. Next.js binds one base path per running server; multi-pod is the supported shape.
- Authentication / authorization across the shared domain. Tenant boundaries are enforced by the per-namespace `ark-api` release and existing Kubernetes RBAC.
- Changes to `ark-api` source code or HTTP contract.
- Path-based routing inside `ark-api` itself — the dashboard's middleware proxy already strips the prefix before forwarding to ark-api, so the backend sees unprefixed paths.
- A migration tool for existing absolute URLs in user-supplied custom code outside this repo.

## Decisions

### Decision 1: Runtime base path via placeholder substitution at container startup

**Choice:** Build the dashboard image with a sentinel placeholder (e.g. `__ARK_BASE_PATH__`) as the `basePath` and `assetPrefix`. At container startup, an entrypoint script reads `ARK_DASHBOARD_BASE_PATH` and rewrites the sentinel to the operator-supplied value across the standalone output (`.next/standalone`, `.next/static`, and `required-server-files.json`) before `exec node server.js`.

**Why:** Next.js does not support a runtime `basePath` — `next.config.ts` is evaluated by `next build` and the resolved value is embedded in the standalone server's manifest and inlined into JavaScript chunks. Among the practical workarounds, sentinel substitution is the lightest-weight option that keeps one image working for any prefix.

**Alternatives considered:**

- **Init container performs `next build`** — works, but each pod adds 1–2 min cold start and substantial CPU/RAM. Rejected for operational cost.
- **Ship multiple pre-built images, one per common prefix** — does not scale; each tenant gets a path of their choosing.
- **`sub_filter` at an upstream proxy to rewrite emitted paths** — brittle; misses URLs constructed dynamically in JavaScript; requires `ngx_substitutions_filter_module` for compressed responses; fights the framework.
- **Custom Next.js server** — large maintenance surface, ties us to Next.js internals.

Sentinel substitution is the documented pattern used by other Next.js apps that need runtime configurability (e.g. Mattermost, Strapi).

### Decision 2: Empty base path stays empty by default

**Choice:** The Dockerfile sets a build-time default such that when `ARK_DASHBOARD_BASE_PATH` is unset at install time, the sentinel is replaced with the empty string and the dashboard behaves as today.

**Why:** Backward compatibility for every existing single-tenant deployment. Operators who don't care about subpath hosting should see no behavioral change.

### Decision 3: Single URL-construction helper for API calls

**Choice:** Introduce a single helper (e.g. `apiUrl(path)` in `lib/api/config.ts` or a sibling) that returns `${origin}${basePath}${path}`. Replace every call site that today uses `API_CONFIG.baseURL` or bare `/api/...` strings with this helper. Remove the "bypass basePath" comment from `lib/api/config.ts`.

**Why:** Today the inconsistency between absolute (`${API_CONFIG.baseURL}/api/v1/...`) and relative (`/api/v1/...`) call sites produces different behavior under a base path: absolute URLs go to the domain root; relative URLs are resolved against the current page. A single helper removes the surface area for this class of bug and makes the spec testable (one place to check).

**Alternatives considered:**

- **Keep the bypass and rely on the ingress to also route `/api/*` at the root** — does not satisfy the "tenant API stays under prefix" requirement and creates ambiguity when two tenants both call `mydomain.com/api/v1/...`.
- **Always use relative URLs and rely on `<base href>`** — fragile with Next.js's router; `<base>` interacts poorly with `next/link`.

### Decision 4: Expose base path as `NEXT_PUBLIC_BASE_PATH` for client code

**Choice:** Set `NEXT_PUBLIC_BASE_PATH` to the same sentinel at build time; the entrypoint substitutes it alongside `next.config.ts`'s `basePath`. Client code reads `process.env.NEXT_PUBLIC_BASE_PATH` for URL construction.

**Why:** Next.js does expose `basePath` to the client via the router, but reading it from `process.env.NEXT_PUBLIC_*` is simpler in non-component code (services, helpers) and is the same substitution mechanism we already need for the framework's own bundles. One mechanism, one source of truth, no two ways to do it.

### Decision 5: Per-tenant deployment topology, with the Ingress routing both UI and API traffic

**Choice:** For multi-tenant hosting, deploy one `ark-dashboard` release and one `ark-api` release per tenant namespace. A single Ingress on the shared domain routes two prefix classes per tenant:

- `/<ns>/api/v1/*` → tenant `ark-api`, with `/<ns>` stripped from the request before it reaches ark-api (NGINX `rewrite-target`, Istio `URLRewrite`, or Gateway API `URLRewrite` filter)
- `/<ns>/*` → tenant `ark-dashboard`

The dashboard does NOT proxy API requests itself; it only serves UI. The browser issues `/<basePath>/api/v1/...` URLs and the Ingress is what sees and routes them.

**Why:** This matches the existing production behaviour (the cluster's ingress is already the thing that gets `/api/v1/*` traffic to ark-api today; we just add per-tenant prefixes). Adding a real Next.js middleware would re-introduce a code path that was deliberately removed (commit b16307122), and would add complexity that operators already solve at the ingress layer. The trade-off: each tenant needs two ingress rules instead of one. That cost is small versus the alternative of resurrecting and maintaining an in-app proxy.

**Alternatives considered:**

- **Dashboard internally proxies `/<basePath>/api/*` to ark-api** (Option A in the apply-time pivot) — requires renaming `proxy.ts` → `middleware.ts`, making it base-path-aware, and owning a token-forwarding/middleware code path. Rejected: matches an architecture the project explicitly moved away from.
- **One dashboard pod, namespace inferred from URL** — large source change to make the dashboard "namespace-aware" per request and a redesign of how ark-api host/port are resolved. Larger blast radius, more risk.
- **Subdomains per tenant (`namespace1.mydomain.com`)** — explicitly ruled out by the client's single-domain constraint.

### Decision 6: Audit `ark-api` ClusterRole for tenant isolation

**Choice:** Review `services/ark-api/chart/templates/rbac.yaml` (the existing `ClusterRole` and `ClusterRoleBinding`) and document which list/watch permissions cross namespace boundaries. If any cross-namespace read is granted, document the trust model so operators understand what tenants can see about other tenants. If isolation gaps exist, scope the cluster role down to the release namespace and capture follow-up work.

**Why:** Tenant isolation is the operational story this change enables. We owe operators a clear statement of what the per-tenant deployment guarantees and what it does not. The audit is a read-only design step here; any code changes it produces are tracked in tasks.md.

### Decision 7: Remove the orphaned `proxy.ts` file

**Choice:** Delete `services/ark-dashboard/ark-dashboard/proxy.ts`. The file looks like Next.js middleware but is not registered as one (its filename no longer matches the Next.js convention) and the compiled `middleware-manifest.json` confirms it is absent from the build.

**Why:** Removing it eliminates a class of future bug where someone reads `proxy.ts`, assumes the dashboard proxies its own API traffic, and writes downstream code that depends on that assumption. There is nothing in the dashboard that imports `proxy.ts`; only `coverage/` mentions it.

**Caveat:** the `app/api/v1/[...proxy]/route.ts` catch-all is a different file and remains: it's the dashboard's mock export YAML generator and is reached by `lib/services/export.ts`. The mock route is left untouched by this change (see Decision 8).

### Decision 8: Turn the `[...proxy]` catch-all into a real proxy to ark-api

**Choice:** Replace the 501-returning stub in `services/ark-dashboard/ark-dashboard/app/api/v1/[...proxy]/route.ts` with a real proxy that forwards every method to `${ARK_API_SERVICE_PROTOCOL}://${ARK_API_SERVICE_HOST}:${ARK_API_SERVICE_PORT}/v1/<path>`. Preserve the in-dashboard YAML mock for the `/{resource}/{name}/export` GET special case (still used by the dashboard's export flow).

**Why:** The catch-all is the only place `/api/v1/*` requests land when the dashboard is reached directly (e.g. `kubectl port-forward` via the `ark dashboard` CLI), which bypasses any cluster Ingress. Without proxy logic in the catch-all, every fresh deployment returns 501 for every API call unless the operator also wires up additional cluster routing. The original `proxy.ts` middleware was the place for this — but it was removed and never replaced. Putting the proxy in the catch-all makes the dashboard self-sufficient for the local-dev/port-forward case AND continues to work when an Ingress is in front (the Ingress can still pre-empt at `/<basePath>/api/v1/*` if a multi-tenant operator wants to).

This was originally written up as Decision 8 ("Leave the catch-all alone") for the ingress-routed-API model, but the user reported that the dashboard's data fetches returned 501 over `ark dashboard` port-forward in a fresh `devspace deploy` — confirming that without this proxy, the dashboard has no working local-dev path. The decision was flipped to keep the dashboard self-contained.

**Alternatives considered:**

- **Rename `proxy.ts` → `middleware.ts` again** — works, but reintroduces a deliberately-removed edge middleware. The route-handler approach is closer to current Next.js conventions and stays out of the framework's middleware machinery.
- **Operator-side Ingress routing only** (the original Decision 8) — would force every operator to add an Ingress/HTTPRoute rule that splits `/api/v1/*` from `/`, and would leave the local-dev port-forward path broken. Rejected because the dashboard should work out of the box from `ark dashboard`.

**What the proxy does:**

- Forwards `GET`, `POST`, `PUT`, `PATCH`, `DELETE` to ark-api at `/v1/<rest-of-path>`.
- Streams request body via `duplex: 'half'` for `POST`/`PUT`/`PATCH`.
- Sets `X-Forwarded-Prefix: /api`, `X-Forwarded-Host`, `X-Forwarded-Proto`; drops the browser `host` so ark-api sees its cluster-Service authority.
- Strips `content-length`/`transfer-encoding`/`connection` from the upstream response (Node recomputes them).
- Preserves the YAML mock for `/{resource}/{name}/export` GET requests; everything else is proxied.

**Auth caveat:** the proxy forwards headers as-is. For `AUTH_MODE=sso` deployments where ark-api expects a bearer token derived from the dashboard's NextAuth session, the proxy should call `getToken({ req })` and set `Authorization: Bearer <access_token>` before forwarding (this is what the old `proxy.ts` did). Tracked as a follow-up; not required for the open-mode and local-dev flows this change targets.

### Decision 9: Entrypoint runs as the non-root `nextjs` user

**Choice:** The substitution entrypoint runs as the existing `nextjs` user (`Dockerfile:26-29`). The Dockerfile must ensure the files to be rewritten are owned by `nextjs` and writable by it; this matches the existing `chown -R nextjs:nodejs ./` in `Dockerfile:35`.

**Why:** Container runs as non-root today; no escalation. Rewriting in place at startup is safe because each pod owns its filesystem layer.

## Risks / Trade-offs

- **Risk: Sentinel collision with real content** → Use a sufficiently unique sentinel (e.g. `__ARK_BASE_PATH__` or `/__ark_base_path_placeholder__`) and verify post-build that the sentinel appears only at the locations the framework emits.
- **Risk: Substitution misses a file format** → Restrict substitution to known file extensions (`.js`, `.html`, `.css`, `.json`, `.txt`) and add a startup self-check that fetches the root HTML through the local server and asserts no sentinel remains. Failed assertion crashes the pod fast (CrashLoopBackOff is easier to debug than a silently broken UI).
- **Risk: Container cold start regression** → Substitution touches at most a few hundred MB of standalone output once per pod start. Expected overhead is hundreds of milliseconds; this is well inside readiness probe defaults but should be measured during prototyping.
- **Risk: NextAuth callback URLs misalign with base path** → NextAuth respects `NEXTAUTH_URL` (or `AUTH_URL`). The chart must propagate base path into that value so OIDC callbacks resolve under the prefix. Document this in chart values; verify in chainsaw test.
- **Risk: Hard-coded absolute URLs in user-supplied content (e.g. agent UI hints)** → Out of scope for this change; document the rule that any URL the dashboard renders should go through the helper.
- **Risk: Future Next.js upgrade changes the standalone layout** → Pin the substitution to specific file globs; CI smoke test verifies the dashboard responds correctly under a non-empty base path on every dashboard change.
- **Trade-off: One pod per tenant** → Higher baseline cost (one pod per namespace) and slower per-tenant rollouts. Accepted in exchange for tenant isolation and Next.js framework alignment.
- **Trade-off: Breaking change for in-tree absolute URL constructions** → All in-tree call sites are updated in this change. External consumers (rare) need a one-line migration to the helper.

## Migration Plan

1. Ship the runtime-substitution image alongside the helper refactor in a single release. Default behavior (no base path) is unchanged, so single-tenant deployments upgrade transparently.
2. Document the multi-tenant install procedure in `services/ark-dashboard/README.md` and a top-level guide: one Helm release per tenant namespace for both `ark-dashboard` and `ark-api`, plus a single Ingress with two prefix rules per tenant (`/<ns>/api/v1/*` with rewrite to ark-api, `/<ns>/*` to ark-dashboard).
3. Add a chainsaw test (or extend an existing one) that installs two ark-dashboard releases under different prefixes alongside two ark-api releases and an Ingress, then asserts:
   - HTML response under `/ns1/` references only `/ns1/...` assets.
   - `GET /ns1/api/v1/<endpoint>` reaches the ns1 ark-api pod (post-rewrite path is `/v1/<endpoint>`).
   - `GET /ns2/api/v1/<endpoint>` reaches the ns2 ark-api pod.
   - `GET /api/v1/<endpoint>` (no prefix) is not routed to either tenant's ark-api by the ingress.
4. Rollback: revert to the previous image. Helm releases with `ARK_DASHBOARD_BASE_PATH` unset continue to work on either image; releases with a non-empty value lose subpath hosting on the older image (expected).

## Open Questions

- **Sentinel value**: ~~`__ARK_BASE_PATH__` versus a path-shaped sentinel like `/__ark_base_path_placeholder__`. Path-shaped is friendlier to URL parsers during the build; finalize during prototyping.~~ **Resolved**: `/__ark_base_path__`. Path-shaped so Next.js's own URL parsing accepts it as a valid `basePath` during `next build`. Underscored to be highly unlikely to collide with real content; lower-case to read naturally in error messages.
- **NextAuth integration**: confirm exactly which env vars (`NEXTAUTH_URL`, `AUTH_URL`, `BASE_URL`) need to include the base path, and whether substitution is needed there or whether passing them in directly from Helm values is enough.
- **`ark-api` ClusterRole audit outcome**: if the audit reveals cross-namespace reads, do we scope the role down in this change or track it as a follow-up? Default: track as follow-up unless the leak is material to the multi-tenant story.
- **Asset prefix vs base path divergence**: today both default to empty. Do we want a separate sentinel for `assetPrefix` (to support CDN hosting where assets live elsewhere from API)? Default: use the same sentinel until a concrete CDN use case appears.
