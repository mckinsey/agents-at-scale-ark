# dashboard-runtime-basepath Specification

## Purpose
TBD - created by syncing change dashboard-runtime-basepath. Update Purpose after archive.
## Requirements
### Requirement: Runtime-configurable base path

The ark-dashboard SHALL accept a URL base path that is resolved at container startup from environment configuration, without requiring the container image to be rebuilt. The base path SHALL be a single path prefix (e.g. `/namespace1`) that applies to every URL the dashboard serves to or generates for a browser.

#### Scenario: Operator sets base path via Helm values

- **WHEN** an operator installs the ark-dashboard chart with the base path value set to `/namespace1`
- **THEN** the dashboard pod starts serving content under `/namespace1/` using the published image without any image rebuild

#### Scenario: Operator omits base path

- **WHEN** an operator installs the ark-dashboard chart without setting the base path value
- **THEN** the dashboard behaves identically to today's root-hosted deployment with an empty prefix

#### Scenario: Operator changes base path between deployments

- **WHEN** two ark-dashboard releases are installed from the same image with base paths `/namespace1` and `/namespace2` respectively
- **THEN** each release serves all content correctly under its own prefix with no interference between them

### Requirement: Prefixed static assets

All static assets (HTML, JavaScript bundles, CSS, fonts, images) served by the dashboard SHALL reference URLs that include the configured base path. The browser SHALL be able to load every referenced asset without any external URL rewriting.

#### Scenario: HTML asset references include the prefix

- **WHEN** a browser requests the dashboard root with base path `/namespace1` set
- **THEN** every `<script>`, `<link>`, and `<img>` URL emitted in the response begins with `/namespace1/`

#### Scenario: Asset request resolves under the prefix

- **WHEN** the browser follows an asset URL emitted by the dashboard while base path `/namespace1` is set
- **THEN** the dashboard pod returns the asset with a successful response

### Requirement: Prefixed browser-originated API calls

All `/api/v1/*` calls initiated by dashboard browser code SHALL be issued to URLs that include the configured base path, so each per-tenant deployment's API traffic remains within its own URL subtree.

#### Scenario: Standard API call honors the prefix

- **WHEN** the dashboard, hosted at base path `/namespace1`, calls the context endpoint from the browser
- **THEN** the issued request URL is `${origin}/namespace1/api/v1/context?...` and not `${origin}/api/v1/context?...`

#### Scenario: Empty base path leaves API calls unprefixed

- **WHEN** the dashboard is hosted with no base path configured
- **THEN** browser-originated API calls go to `${origin}/api/v1/...` with no prefix

#### Scenario: API call construction is consistent across call sites

- **WHEN** any dashboard code constructs an API URL (whether previously via `API_CONFIG.baseURL` or as a relative `/api/...` string)
- **THEN** the URL is produced through a single helper that applies the configured base path

### Requirement: Prefixed in-app navigation

Internal page navigation triggered by the dashboard (links, programmatic routing, redirects) SHALL preserve the configured base path so users remain within their tenant's URL subtree.

#### Scenario: Link click stays under the prefix

- **WHEN** a user clicks an in-app link in a dashboard hosted at base path `/namespace1`
- **THEN** the resulting URL starts with `/namespace1/`

#### Scenario: Programmatic redirect honors the prefix

- **WHEN** the dashboard issues an authentication or post-login redirect while base path `/namespace1` is set
- **THEN** the redirect target URL includes the `/namespace1` prefix

### Requirement: Dashboard catch-all proxies `/api/v1/*` to its configured ark-api

The dashboard's `/api/v1/*` catch-all route handler SHALL forward every request to the ark-api backend identified by `ARK_API_SERVICE_HOST`, `ARK_API_SERVICE_PORT`, and `ARK_API_SERVICE_PROTOCOL` (with path `/v1/<rest>`), preserving HTTP method, query string, body, and the request/response semantics that ark-api expects. The in-dashboard YAML mock for `GET /api/v1/{resource}/{name}/export` SHALL be preserved.

#### Scenario: Browser API call reaches ark-api through the dashboard pod

- **WHEN** the browser sends `GET /api/v1/agents?namespace=default` to a dashboard pod configured with `ARK_API_SERVICE_HOST=ark-api`
- **THEN** the dashboard forwards `GET /v1/agents?namespace=default` to `http://ark-api:80/v1/agents?namespace=default` and returns its response unchanged

#### Scenario: POST with body is forwarded intact

- **WHEN** the browser sends `POST /api/v1/queries?namespace=default` with a JSON body
- **THEN** the dashboard forwards `POST /v1/queries?namespace=default` to ark-api with the same body and `Content-Type`, and returns ark-api's status, headers, and body

#### Scenario: Export YAML mock is served by the dashboard, not proxied

- **WHEN** the browser sends `GET /api/v1/agents/my-agent/export`
- **THEN** the dashboard returns the in-dashboard YAML template with `Content-Type: text/yaml`; no request reaches ark-api for this path

### Requirement: Per-tenant API traffic stays inside the tenant's URL prefix

In a multi-tenant deployment under a non-empty base path, every browser-originated API call SHALL be issued under the tenant's `${origin}/<basePath>/api/v1/...` prefix, so the request can be routed to the correct tenant by ingress prefix matching, by the dashboard pod's own routing, or by both — with no cross-tenant collisions at the domain root.

#### Scenario: Tenant API traffic is prefixed

- **WHEN** the dashboard hosted at base path `/namespace1` issues browser-originated API calls
- **THEN** every issued API URL begins with `/namespace1/api/v1/` and is handled by the dashboard's own catch-all (which proxies to its configured ark-api) or by an upstream ingress rule that captures `/namespace1/api/v1/*`

### Requirement: First-class Helm value for base path

The ark-dashboard Helm chart SHALL expose the base path as a first-class value (not only via the generic `app.env` extension point) and SHALL set the corresponding environment variable on the dashboard Deployment so that no container or image changes are required to configure a deployment's base path.

#### Scenario: Setting the Helm value configures the running pod

- **WHEN** an operator runs `helm install` (or `helm upgrade`) with the chart's base path value set to `/namespace1`
- **THEN** the resulting Deployment's pod template contains `ARK_DASHBOARD_BASE_PATH=/namespace1` and the running dashboard serves content under `/namespace1/`

#### Scenario: Default chart values produce root hosting

- **WHEN** an operator installs the chart with default values
- **THEN** the Deployment is created without a base path configured and the dashboard serves at the root path

### Requirement: Multiple per-tenant dashboards coexist on one domain

Multiple ark-dashboard releases installed from the same image with different base paths SHALL be hostable behind a single Ingress on a shared domain such that each release handles only requests under its own prefix and does not respond to or interfere with requests under any other prefix.

#### Scenario: Two tenants share a domain

- **WHEN** two ark-dashboard releases are installed with base paths `/namespace1` and `/namespace2`, fronted by a single Ingress that routes each prefix to the corresponding service
- **THEN** browser requests to `mydomain.com/namespace1/` are served by the first release and requests to `mydomain.com/namespace2/` are served by the second release, with no cross-tenant URL collisions and no shared client-visible state between the two

#### Scenario: Tenant API traffic stays within its prefix

- **WHEN** the dashboard hosted at `/namespace1` issues browser-originated API calls
- **THEN** every issued API URL begins with `/namespace1/api/` and no API URL is shared with or routed into another tenant's dashboard or ark-api
