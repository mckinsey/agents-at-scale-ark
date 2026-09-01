## Why

The dashboard marketplace cannot install anything. Clicking **Get** shows a `helm` command to copy into a terminal, whether the item is a single `Agent` or a full Langfuse deployment.

Issue #2347 first asked the dashboard to run the install and was closed as *"won't do cause the dashboard would need high privilege"*. That was right: an arbitrary Helm chart needs permission to create almost anything, and the dashboard is a multi-user web pod.

The re-discovery splits the problem. An `Agent` is **configuration** — a record with a name, a prompt and a model reference; nothing is scheduled and no image is pulled, and the dashboard already creates these through the "New Agent" form. Langfuse is **infrastructure**. Only the first group becomes installable from the UI, and **ark-api** performs the install, not the dashboard. ark-api already holds namespaced write on `ark.mckinsey.com` resources and nothing else (`services/ark-api/chart/templates/rbac.yaml`), so no new resource permission is needed.

One thing does change, where impersonation is enabled: the form writes as the user, while Helm writes as ark-api's Service Account. The install therefore adds a write path that does not carry the user's identity, which is why an access review runs first.

Everything else keeps today's behaviour: the command, plus a note that non-Ark items are installed by the user or platform team.

## What Changes

**Two ark-api endpoints** under `/v1/namespaces/{namespace}/marketplace-items/{id}`: `GET install-preview` (can this be installed, and may this user install it?) and `POST install`.

**Installability comes from rendering the chart, not from metadata.** `noah` is the catalogue's only `type: agent` item and its chart renders `Agent`, `MCPServer`, `Deployment`, `Service`, `ServiceAccount`, `Role` and `RoleBinding` — six of seven objects are not the agent. ark-api runs `helm template`, which never contacts the cluster, and inspects every object.

**Three gates**, all that apply must pass:

| Gate | Answers | Changes with |
|---|---|---|
| Content validation | What would this create? | the item |
| User access review | May this person create it here? | the user and namespace |
| ark-api access review | Can ark-api write here at all? | the namespace binding |

The user review runs wherever an identity exists. Without the third, a namespace with no binding would only be discovered by a failed install.

**Authorization uses the strongest check the deployment allows**, following `core/permissions.py`:

| Deployment | Check |
|---|---|
| Impersonation on | `SelfSubjectAccessReview` through the impersonating client — evaluates the user |
| Impersonation off, JWT identity present | `SubjectAccessReview` carrying that identity |
| No authentication (local dev) | none — unrestricted |

A self-review in the second row would evaluate ark-api's own Service Account and always pass. Open mode installs rather than failing closed: `core/permissions.py:49-54` already treats no authentication as unrestricted, and the "New Agent" form already writes Ark resources there with no user check.

**Content is constrained beyond the kind allowlist.** The chart is pinned by digest between preview and install. Charts whose templates invoke Helm's `lookup` are refused, because that function reads cluster state during install but returns empty during validation. Catalogue `installArgs` are filtered by enumeration — accepted (`--set`, `--set-string`), ignored (`--create-namespace`), refused (everything else). Installs are atomic, so a failure rolls back.

**The per-namespace gate is RBAC, not a flag of ours.** Writing into a tenant namespace needs a binding there, which `charts/ark-tenant` exposes as `rbac.additionalSubjects`. A customer who does not want UI installs grants nothing and the feature is inert in that namespace, enforced by the cluster.

**The dashboard gets an Install button on every item.** The dialog always shows the commands, and adds **Install to namespace `<ns>`** only when the item is installable and the user authorized. Otherwise it says why not.

**One new permission:** `create subjectaccessreviews` on the ark-api ClusterRole.

## Capabilities

### New Capabilities
- `marketplace-ark-resource-install`: install marketplace items containing only namespaced Ark resources into a namespace from the dashboard. Gated by content validation at render time, a per-user access review, and ark-api's own write access. Performed by ark-api.

### Modified Capabilities

None. The marketplace catalogue capabilities (`marketplace-sources-configmap`, `marketplace-source-auth`) are unchanged.

## Impact

- **ark-api** — new module for chart render and validation; endpoints in `api/v1/marketplace_items.py` or a sibling `marketplace_install.py`. Install through `pyhelm3`, already a dependency (`utils/ark_services.py:77`); `helm` is already in the image (`services/ark-api/Dockerfile:11`).
- **Verified against `pyhelm3` 0.5.4 (installed version):** `install_or_upgrade` passes `chart_ref` and `timeout` straight through, so the digest-pinned ref and the bounded timeout both work as assumed. `atomic=True` does not send `--atomic` — its default `atomic_arg` is `--rollback-on-failure`, which is not a real Helm flag (`helm upgrade --help` on 3.19 lists no such flag). The call site must pass `atomic_arg="--atomic"` explicitly, or the atomicity guarantee this proposal relies on silently does not apply.
- **ark-api RBAC** — add `create` on `subjectaccessreviews` next to the existing `selfsubjectaccessreviews` entry. Nothing else is widened.
- **ark-dashboard** — `install/route.ts` proxies the two endpoints; `marketplace-item-card.tsx` and the dialog render the outcomes. The unused `executeHelmCommand` helper is deleted.
- **Installed badge** — unchanged; it reads the Helm release annotation `ark.mckinsey.com/marketplace-item-name` (`marketplace-transform.ts:257`).
- **Uninstall and upgrade** — out of scope for v1. `DELETE` keeps returning the command.
- **Catalogue coverage starts thin.** Of the 20 items in the catalogue as of 2026-07-29, 1 (`argo-make-author`, which renders only an `Agent`) passes the allowlist, 12 are refused for rendering a `Deployment` or RBAC objects, and 7 cannot be fetched at all (a separate marketplace CI gap). The mechanism ships ahead of most of the content — a deliberate trade, explained in the design.
- **Docs** — `docs/content/developer-guide/marketplace.mdx`: replace the "No in-dashboard install" limitation.
- **Supersedes** the parked change `marketplace-install-from-dashboard`, which described the rejected design where the dashboard ran helm.
