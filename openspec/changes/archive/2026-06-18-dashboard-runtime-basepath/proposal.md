## Why

Clients with single-domain access (e.g. `mydomain.com/`) cannot today host multiple per-namespace Ark dashboards behind path-based routing such as `mydomain.com/namespace1/` and `mydomain.com/namespace2/`. The dashboard's URL prefix is baked at build time and its client-side API calls deliberately bypass that prefix, so a stock dashboard image only works at the domain root. This blocks multi-tenant deployments where each tenant namespace must be reachable as a distinct path on a shared domain, with its own API isolated from other tenants — and clients cannot be asked to rebuild a custom container image.

The dashboard does not proxy API traffic itself today — the cluster's ingress/gateway is what routes `/api/v1/*` from the browser to ark-api. (A renamed `proxy.ts` exists in the source tree but is no longer registered as middleware after commit b16307122 "Rename middleware -> proxy to avoid a warning".) The multi-tenant solution therefore configures the ingress to route per-tenant API traffic as well as per-tenant dashboard traffic, rather than trying to make each dashboard pod forward its own API requests.

## What Changes

- Make the dashboard's URL base path runtime-configurable via the existing `ARK_DASHBOARD_BASE_PATH` environment variable, so one published image can serve any prefix chosen at Helm install time.
- **BREAKING**: Stop bypassing the configured base path for browser-originated API calls. All `${origin}/api/v1/...` constructions become `${origin}${basePath}/api/v1/...`, so the dashboard remains self-contained when hosted under a subpath.
- Make all in-app `/api/...` call sites use a single, consistent URL-construction helper that honors the base path. Removes today's inconsistency between absolute (`API_CONFIG.baseURL`) and relative (`/api/v1/...`) call sites.
- Expose `ARK_DASHBOARD_BASE_PATH` as a first-class Helm value on the `ark-dashboard` chart (currently only reachable via the generic `app.env` extension point) so deploying multiple per-tenant releases is a values-only operation.
- Document the recommended per-tenant topology: one `ark-dashboard` release + one `ark-api` release per tenant namespace, fronted by a single Ingress doing path-based routing for both classes of traffic — `/<ns>/api/v1/*` rewritten to `/api/v1/*` and routed to the tenant's `ark-api`, and `/<ns>/*` routed to the tenant's `ark-dashboard`.
- Update the chart's Ingress and HTTPRoute templates with example multi-tenant routing including the prefix-strip rewrite needed for API traffic.
- Audit `ark-api` RBAC (existing `ClusterRole` in `services/ark-api/chart/templates/rbac.yaml`) to confirm it does not leak cross-namespace data when deployed per-tenant.
- Remove the orphaned `services/ark-dashboard/ark-dashboard/proxy.ts` file (dead code since it was renamed off `middleware.ts`) so future readers don't assume the dashboard proxies API traffic itself.
- Replace the 501-returning stub in `services/ark-dashboard/ark-dashboard/app/api/v1/[...proxy]/route.ts` with a real proxy that forwards to ark-api via `ARK_API_SERVICE_HOST/PORT/PROTOCOL`. Keeps the dashboard's local-dev path (`ark dashboard` port-forward) working without requiring operators to wire additional cluster Ingress rules.
- No source changes to `ark-api`. No changes to other services.

## Capabilities

### New Capabilities

- `dashboard-runtime-basepath`: The Ark dashboard can be deployed under any URL path prefix chosen at Helm install time, with all emitted asset URLs, client navigation, and API calls correctly prefixed. The same published container image supports any prefix without a rebuild, enabling multiple per-tenant dashboards to coexist behind a single domain via path-based routing.

### Modified Capabilities

_(None — no existing spec governs dashboard hosting today.)_

## Impact

**Affected code**

- `services/ark-dashboard/ark-dashboard/next.config.ts` — base path source switches from a build-time env read to a runtime-resolvable value.
- `services/ark-dashboard/ark-dashboard/lib/api/config.ts` — `API_CONFIG.baseURL` includes the configured base path.
- `services/ark-dashboard/ark-dashboard/lib/services/export.ts`, `lib/services/proxy.ts`, `app/(dashboard)/broker/page.tsx` — API call sites unified to use the base-path-aware helper.
- `services/ark-dashboard/ark-dashboard/proxy.ts` — removed as orphaned dead code.
- `services/ark-dashboard/Dockerfile` and new container entrypoint script — make the runtime base path effective in the standalone Next.js output.
- `services/ark-dashboard/chart/values.yaml`, `chart/templates/deployment.yaml` — first-class base path value and env wiring.

**Affected APIs**

- No HTTP API contract changes on `ark-api`.
- Browser → dashboard URL space changes when a base path is configured: every dashboard URL (page, asset, and `/api/*`) is now prefixed. Existing deployments that omit `ARK_DASHBOARD_BASE_PATH` continue to behave as today (empty prefix).

**Dependencies**

- No new runtime dependencies. The container entrypoint relies only on tools already present in the base image.

**Operations**

- Multi-tenant deployments require one `ark-dashboard` and one `ark-api` Helm release per tenant namespace, plus one Ingress fronting them with two prefix routes per tenant (`/<ns>/api/v1/*` → tenant ark-api with rewrite, `/<ns>/*` → tenant dashboard). The ingress controller must support prefix rewrite (NGINX ingress, Istio Gateway, Gateway API HTTPRoute all qualify).
- Existing single-tenant deployments are unaffected (default base path is empty).

**Out of scope**

- Authentication and per-tenant authorization across the shared domain. Tenant isolation is assumed to be enforced by the namespace-scoped `ark-api` releases and the cluster's existing RBAC.
- Active-active or shared single-instance dashboard serving multiple tenants from one pod — explicitly not supported; Next.js permits only one base path per running process.
