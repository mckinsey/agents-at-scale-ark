## Context

The install route (`app/api/marketplace/[id]/install/route.ts`) already contains a synchronous helm execution path: `POST` runs `helm upgrade --install` via `spawn` (300s timeout) when `mode !== 'command'`, but the UI only ever sends `mode: 'command'`, so that path is dead. `DELETE` always runs `helm uninstall` directly, with no gate. Item resolution is already namespace-aware (resolves via the per-namespace aggregator, change `marketplace-sources-configmap`).

Constraints:
- The dashboard pod is the security boundary — it holds the helm binary and cluster credentials. Any gate MUST be enforced server-side; a client-only check is cosmetic.
- helm runs synchronously in the request (up to 300s); there is no log-streaming channel today.
- Platform teams under change control need helm changes to flow through controlled paths and must be able to keep the dashboard out of that loop.

## Goals / Non-Goals

**Goals:**
- Make Install execute end-to-end from the dashboard when allowed.
- Bring Uninstall under the same gated, visible flow.
- A single cluster-scoped toggle, disabled by default, governing both directions.
- A clear command fallback and "disabled by policy" signal when off.

**Non-Goals:**
- Streaming helm logs / live progress beyond pending→result.
- Authenticated/private chart sources (tracked in #2346).
- Per-item or per-namespace install policy granularity (single cluster-scoped toggle for now).
- Async/background install jobs.
- **Per-user authorization of install/uninstall.** Helm executes with the dashboard Service Account, not the calling user. Who may reach the dashboard is governed by `AUTH_MODE`/OIDC; whether the dashboard may install at all is governed by the toggle (off by default). A `SelfSubjectAccessReview` check on the calling user is meaningful only in authenticated mode and is tracked as a follow-up, not implemented here.

## Decisions

### Decision: Single server-side env var is the source of truth and the hard gate
A pod environment variable on the dashboard (e.g. `MARKETPLACE_DIRECT_INSTALL_ENABLED`, default `false`), set from a Helm value (e.g. `marketplaceInstall.enabled: false`), governs execution. The install route reads it and refuses to spawn helm when disabled — for both `POST` and `DELETE`.

- **Why:** the route is where helm runs, so the gate must live there. Enforcing server-side makes the client flag purely cosmetic (defense in depth).
- **Alternative considered:** gate only in the UI — rejected, it is not a real control (anyone can call the route directly).
- **Read timing:** the env var is fixed for the pod's lifetime (set at container start). Changing the Helm value takes effect on the next pod rollout; reading it per request or once at module load is equivalent, since it cannot change without a restart.

### Decision: Toggle decides execution; the `mode` body param is retired
When the toggle is on, `POST` executes and `DELETE` executes. When off, both return the copy/paste command payload and never spawn helm. The client no longer drives execution via `mode`.

- **Why:** removes the client's ability to force execution and collapses two concepts (client intent vs. policy) into one (policy).
- **Alternative considered:** keep `mode` and also check the toggle — redundant and lets the client express an intent the server must override anyway.

### Decision: Expose the toggle to the client via a read-only policy endpoint
A small endpoint (e.g. `GET /api/marketplace/install-policy → { directInstallEnabled }`) lets the UI choose execute vs. command and render the "disabled by policy" state. The UI reads it with React Query.

- **Why:** runtime-accurate and avoids `NEXT_PUBLIC_*` build-time inlining (the value is a deploy-time Helm decision, not a build constant).
- **Alternative considered:** `NEXT_PUBLIC_*` env var — Next inlines these at build time, so a chart-set value would not reliably take effect at runtime.
- **Alternative considered:** infer purely from the install response (`status: 'command'`) — works for install but gives no upfront signal and no symmetric path for uninstall.

### Decision: Progress is pending→result, not streamed
The UI shows an in-progress state while the synchronous request runs and surfaces the final helm status on completion (toast + card state transition Get↔Installed). Helm stdout/stderr is returned in the response for display, not streamed.

- **Why:** matches the existing synchronous route; streaming is a larger change with its own channel and is a non-goal.

### Decision: Preserve existing helm-failure fallback, extend it to uninstall
When enabled but helm is unavailable or exits non-zero, the route surfaces a usable error and falls back to offering the command (install already does this; uninstall gains the same handling).

### Decision: Install resolves only from the per-namespace ConfigMap, never client input
When the toggle is on, the item and its installation configuration (chart path, install args, target namespace) are resolved server-side from the `marketplace-sources` ConfigMap via the aggregator (change `marketplace-sources-configmap`). The route MUST NOT honor any client-supplied source (request header or body field) when choosing what to install.

- **Why:** with execution enabled, trusting a client-supplied source list would let any dashboard user point the pod at an arbitrary chart. The pre-`marketplace-sources-configmap` `X-Marketplace-Sources` header + `localStorage` model is exactly that vector; that change removes it. This change codifies the precondition so it cannot regress.
- **Alternative considered:** honor a client source list for flexibility — rejected; it reopens the arbitrary-install vector.

### Decision: Per-user authorization is a Non-Goal; the toggle + AUTH_MODE are the controls
Helm runs as the dashboard Service Account. This change adds no per-user permission check before execution. In `AUTH_MODE=open` (default) there is no user identity to authorize against, so a check would be inert; in authenticated mode it would add value and is tracked as a follow-up.

- **Why:** the platform-team toggle (off by default) plus `AUTH_MODE`/OIDC (who reaches the dashboard) form a coherent control surface. A `SelfSubjectAccessReview` that no-ops in the default mode would imply protection that isn't there.
- **Follow-up:** SSAR check on the calling user in authenticated mode (consistent with the permission probe in change `marketplace-sources-configmap`).

## Risks / Trade-offs

- **Arbitrary chart execution when enabled** → the dashboard can `helm install` any chart path present in the namespace's `marketplace-sources` ConfigMap. Mitigation: off by default; the catalogue is server-side and governed by **real cluster RBAC** (the `marketplace-source-editor` ClusterRole from change `marketplace-sources-configmap`), not client `localStorage`; resolution ignores client-supplied sources; enabling is an explicit platform-team decision. Authenticated/private sources remain out of scope (#2346).
- **Helm executes as the dashboard SA, not the calling user** → with the toggle on and `AUTH_MODE=open`, any user who reaches the dashboard can trigger install/uninstall in any namespace the SA can reach. Mitigation: toggle off by default; restrict dashboard access via `AUTH_MODE`/OIDC; per-user SSAR tracked as a follow-up (see Non-Goals).
- **Behavioral change to uninstall** → teams relying on the dashboard's always-on uninstall will get a command when the toggle is off. Mitigation: documented as breaking; enabling the toggle restores execution.
- **Long synchronous request (up to 300s)** → the route blocks until helm finishes. Mitigation: existing timeout; UI shows pending and disables re-trigger; async is a non-goal.
- **Client/server toggle skew** → the cosmetic flag could be stale relative to the pod env. Mitigation: the server is the hard gate, so the worst case is a confusing UI, never an unauthorized execution.
- **helm binary must exist in the dashboard image** → already assumed by the current direct-exec path; no new requirement.

## Migration Plan

- Ship `marketplaceInstall.enabled: false` (default). On upgrade, install behavior is unchanged (still command); uninstall changes from always-execute to command-when-off — call this out in release notes.
- Platform teams opt in by setting the Helm value; rollback is setting it back to `false` (no data migration).
- Update operator docs (the marketplace operations guide) with the toggle; remove the "No in-dashboard install" limitation bullet from PR #2336.

## Open Questions

Resolved during review:
- **Names** → `marketplaceInstall.enabled` (Helm value) + `MARKETPLACE_DIRECT_INSTALL_ENABLED` (pod env). Follows the per-feature namespace convention.
- **Policy endpoint** → dedicated (`GET /api/marketplace/install-policy`), not folded into a shared system-info endpoint — keeps coupling and blast radius small; the only consumer is the marketplace UI.
- **One toggle vs. two** → one toggle governs both directions. Uninstall-only is achievable with the same flag plus the command fallback; two flags multiply UI states with no real gain.
