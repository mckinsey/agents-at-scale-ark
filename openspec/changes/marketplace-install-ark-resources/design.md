## Context

Issue #2347 was closed in June 2026 as *"won't do cause the dashboard would need high privilege"*. It was reopened in July with seven caveats:

1. ark-api holds the namespace privilege and does the deploy, not the dashboard.
2. Only Ark resources can be installed, not full services like Langfuse.
3. A validation enforces that only Ark resources are installed.
4. Non-Ark items stay in the marketplace and are installed some other way.
5. The dashboard shows an install button on every item.
6. Ark-only items get the modal with the commands plus an "install to namespace" button.
7. Other items get the commands plus a note that the user or platform team installs them.

## Three gates, kept separate

| Gate | Question | Changes with | Applies |
|---|---|---|---|
| Content validation | What would this item create? | the item only | always |
| User access review | May this person create it here? | user and namespace | wherever an identity exists |
| ark-api access review | Can ark-api write here at all? | the namespace binding | always |

Content is a property of the item, the user review a property of the session, the ark-api review a property of the deployment. The last is a self-review on ark-api's own Service Account issued **without** impersonation — a different call from the user review even where both are self-reviews.

Hence two endpoints: `GET install-preview` for the UI hint, `POST install` for the real thing. `POST install` re-runs every gate, so calling it without a preview gives the same result.

## Decision: validate the rendered manifest, not the metadata

The item `type` does not describe what a chart creates. Measured with `helm template` against the published charts:

```
noah         (type: agent)   ->  Agent, MCPServer, Deployment, Service,
                                 ServiceAccount, Role, RoleBinding
ark-sandbox  (type: service) ->  Deployment, Service, ServiceAccount,
                                 ClusterRole, ClusterRoleBinding
```

`noah` is the only `type: agent` item, and six of its seven objects are not the agent.

A declared field such as `ark.arkOnly: true` would be no better: whoever controls the marketplace source writes it, and third-party sources are supported. `helm template` never contacts the cluster, so content can be inspected before any privilege is used.

## Decision: filter install arguments by enumeration

`installArgs` change what a chart renders, so they are an input to validation. "Only value-setting flags" fails both ways: all 18 items carry `--create-namespace`, which is not value-setting, so that rule rejects the whole catalogue — while `--set-file` *is* value-setting and reads a file from the **ark-api pod** into a chart value, and `--values` at a URL fetches content at render time, defeating digest pinning.

A category is not executable. The rule is an enumeration:

| Group | Arguments | Reason |
|---|---|---|
| Accepted | `--set`, `--set-string` | inline literal values |
| Ignored | `--create-namespace` | ark-api installs into an existing namespace and must not create one, so the flag is dropped rather than refused |
| Refused | everything else | including `--set-file`, `--values`/`-f`, `--post-renderer`, and any flag naming a path or URL |

## Decision: pin the chart by digest

Preview and install are separate requests and the chart can change between them. The preview resolves the reference to a digest; the install re-validates and installs from that same digest. Same reason lockfiles exist.

`helm pull` and `helm template` both accept `oci://…/chart@sha256:…`, and `helm pull` prints the digest it resolved a tag to, which is how the preview obtains it. Verified on helm 3.19 against the marketplace registry.

## Decision: refuse charts that read cluster state

Validating the rendered manifest only says what will be created if the render is deterministic. Helm's `lookup` breaks that: under `helm template` there is no cluster and it returns empty, while `helm install` connects and it returns real objects, read with ark-api's Service Account credentials. Digest pinning does not help — the bytes are identical, only the render context differs.

The reach is concrete. ark-api's Role holds `get` and `list` on `secrets` in the namespaces it serves (`rbac.yaml:28-30`, needed for MCP OAuth tokens). A chart rendering a single `Agent` — allowlisted content, clean arguments, every gate passed — could put an existing `Secret` into that agent's prompt, visible to anyone who can read the namespace.

Helm has no flag to disable `lookup`, and installing the pre-rendered manifest instead would mean applying through the Kubernetes API, giving up release tracking, uninstall and rollback. So the rule is static: a chart whose templates invoke `lookup` is not installable.

## Decision: allowlist of namespaced Ark configuration kinds

Allowed: `Agent`, `Team`, `Model`, `Tool`, `MCPServer`, `A2AServer`, `Memory`, `ExecutionEngine`.

Excluded:

- **`ArkConfig`** — cluster-scoped, and ark-api holds write on it in its **ClusterRole**, so a rule like "the group must be `ark.mckinsey.com`" would let one click change cluster-wide Ark defaults. Hence an explicit kind list, plus a scope check through API discovery so a future cluster-scoped Ark CRD is blocked the day it appears.
- **`Query` and `A2ATask`** — these run things. Creating a `Query` dispatches an LLM call, so an item carrying sample queries would spend the customer's model budget at install time.
- **`RoleBinding`, `Role` and `ServiceAccount`** — what blocks most Ark bundles, and it stays blocked: a `RoleBinding` from the UI could bind any subject to any Role ark-api holds.
- **`ConfigMap` and `Secret`** — excluded in v1 at no cost, since every item rendering either kind also renders a `Deployment` and is refused anyway. Allowing them would let a chart overwrite a `Secret` another workload uses, and let the UI create credentials. Revisit when a real item is blocked by this alone; if added, `create` only, failing on collision.
- **Everything else** — any object outside the list makes the item not installable.

Rejection is all-or-nothing: a partial install leaves a namespace half-configured and the user cannot tell which half arrived. The same applies to the install itself, so ark-api uses `--atomic` and a bounded timeout.

## Decision: authorize per tier

Helm does the install, so the write always carries ark-api's Service Account identity — `pyhelm3` authenticates from kubeconfig and ignores `Impersonate-User` headers, which would need `--kube-as-user`. Authorization is therefore a check ark-api makes first, and which check is available depends on the deployment:

| Deployment | `user_identity` | Impersonation | Check |
|---|---|---|---|
| Local dev / open mode | absent | off | none — unrestricted |
| SSO or JWT | present | on | `SelfSubjectAccessReview` through the impersonating client |
| SSO or JWT | present | off (default) | `SubjectAccessReview` carrying that identity |

**Impersonation on:** a self-review is correct and needs no new RBAC — `get_impersonating_api_client` sets `Impersonate-User`, so the API server evaluates the user. `core/permissions.py:66-72` already works this way.

**Impersonation off:** a self-review would be a placebo, because `auth/dependencies.py:11-12` returns no impersonation config when `IMPERSONATION_ENABLED=false` and the client falls back to ark-api's own credentials. `SubjectAccessReview` takes `user` and `groups` as parameters, and the identity is available: `auth/middleware.py:48-67` reads it from the JWT claim regardless of that flag, which governs whether *writes* travel as the user, not whether ark-api knows who they are. This tier is the only reason `create subjectaccessreviews` is added.

One review per distinct `(group, resource)` in the manifest, verb `create`, in the target namespace, all of which must pass — checking one kind would let a user with partial permissions install the rest on the Service Account's privilege.

**Open mode installs** rather than failing closed. `core/permissions.py:49-54` already treats no authentication as unrestricted, and the "New Agent" form already creates Ark resources there with no user check, so a stricter bar on the same write through the same RBAC adds no security. The posture: ark-api authorizes the user wherever an identity exists; where none exists, nothing in the service is authorized, install included.

## Decision: the per-namespace gate is RBAC, not a feature flag

ark-api's namespaced Role exists only in its own release namespace. Writing into a tenant namespace needs a binding there, which `charts/ark-tenant` exposes as `rbac.additionalSubjects`. So a platform team decides per namespace whether UI installs are possible using plain RBAC; a customer who forbids them configures nothing and the feature is inert there; and a Helm value of ours would only duplicate this as a weaker gate the cluster cannot enforce.

The dashboard must treat "ark-api cannot write in this namespace" as a normal outcome, not an error — which is what the third gate is for.

## Decision: refuse when the item is already installed

The release name comes from catalogue metadata, so two users installing the same item into the same namespace collide by design, and `helm install` fails on a taken name. That is an expected condition, not a fault, so the install refuses with a verdict the dialog can show. Upgrade and replace are out of scope for v1 alongside uninstall — all three need a story for resources the user has edited since.

## Trade-offs accepted

- **Catalogue coverage starts thin.** Measured 2026-07-29 against the 20-item catalogue: 1 (`argo-make-author`, rendering only an `Agent`) passes; 12 are refused, all rendering a `Deployment`, several also `Role`/`RoleBinding`; 7 cannot be fetched (a separate marketplace CI gap, out of scope here). Widening the allowlist to admit the 12 would mean allowing `RoleBinding` (escalation) or installing part of a chart (half-configured namespace) — not a smaller version of this change. The fix belongs in the marketplace — items meant for UI install publish an Ark-only chart, which needs no change here.
- **Coverage is point-in-time and the catalogue moves.** Rendered content depends on chart values and published version; measured a month apart, the same items rendered different kinds. Hence validation renders per request rather than being precomputed.
- **Authorization is our code.** The review is a separate call from the write, so a future path that skips it would install on the Service Account's privilege. Mitigation is structural: one install function owns render → validate → review → install, and nothing else reaches `helm install`.

