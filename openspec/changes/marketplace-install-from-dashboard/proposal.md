## Why

The marketplace is the primary surface for extending Ark, but the dashboard cannot install items. Clicking **Get** only returns a `helm` command to copy into a terminal — users without a configured shell are blocked at their first install. Meanwhile uninstall already spawns `helm uninstall` directly on the dashboard pod with no opt-out. That asymmetry (install never executes, uninstall always does) is ungovernable for platform teams under change-control constraints, who need all helm changes to flow through a controlled path (CLI / CI / GitOps).

This change makes install execute from the dashboard and puts both install and uninstall behind a single platform-team toggle that ships **disabled by default**, preserving the current governance posture.

## What Changes

- **Install executes from the dashboard.** Clicking Get performs the install end-to-end (`helm upgrade --install`) without leaving the UI. The server-side direct-execution path already exists in the install route behind `mode !== 'command'` but is dead from the UI's perspective — this wires it up.
- **Progress and result surface in the UI.** The dashboard shows install progress and the resulting helm release status, so the user knows when it finished and whether it succeeded.
- **Uninstall comes under the same UX.** Uninstall surfaces progress/result like install, instead of silently spawning `helm uninstall`.
- **New cluster-scoped governance toggle** (Helm value + env var on the dashboard pod) gates **both** in-dashboard install and uninstall.
- **Toggle ships disabled by default.** Turning on direct install/uninstall is an explicit platform-team decision; existing governance posture is preserved on upgrade.
- **Graceful fallback when the toggle is off.** Both install and uninstall offer the copy/paste helm command, and the UI clearly signals that direct install/uninstall is disabled by policy.
- **Install resolves only from governed sources.** With the toggle on, the item is resolved solely from the per-namespace `marketplace-sources` ConfigMap (server-side, governed by real cluster RBAC via change `marketplace-sources-configmap`) — never from client-supplied source input.
- **BREAKING (behavioral):** uninstall is no longer unconditional — when the toggle is off it returns a command instead of executing. This is intentional; it brings uninstall in line with install and with the default governance posture.
- **Docs:** document the toggle and remove the "No in-dashboard install" limitation bullet captured in PR #2336.

## Capabilities

### New Capabilities
- `marketplace-install`: execute install and uninstall of marketplace items from the dashboard, gated by a cluster-scoped platform-team toggle that is disabled by default, with a copy/paste command fallback when disabled.

### Modified Capabilities
<!-- None. This change adds install/uninstall behavior; it does not change the requirements of the marketplace-sources catalogue (proposed in change marketplace-sources-configmap). -->

## Impact

- **ark-dashboard API route** — `app/api/marketplace/[id]/install/route.ts`: gate the `POST` direct-execution path on the toggle (off → command only, never spawn helm); gate `DELETE` (uninstall) on the same toggle with a command fallback.
- **ark-dashboard UI** — `components/cards/marketplace-item-card.tsx` (the command dialog lives inside it as `InstallCommandDialog`; the card installs only — uninstall UX is **added** here) and `app/(dashboard)/marketplace/[id]/page.tsx` (item detail page, where uninstall is wired today): execute flow, progress/status display, and a "disabled by policy" state for both directions.
- **Toggle exposure to the client** — the dashboard must know the toggle state to choose execute vs. command, via a dedicated read-only endpoint (see design; not `NEXT_PUBLIC_*`, which inlines at build time).
- **ark-dashboard Helm chart** — new value + pod env var (disabled by default); relies on the `helm` binary being available in the dashboard pod (already assumed by the existing direct-exec path).
- **Docs** — operator documentation for the toggle; removal of the limitation bullet from PR #2336.
- Builds on the `marketplace-sources` ConfigMap (change `marketplace-sources-configmap`) and the namespace-aware detail/install resolution: item resolution for install already goes through the per-namespace aggregator. That change also **removes the client-controlled `X-Marketplace-Sources` header and `localStorage`** source list — so install resolution no longer trusts any client-supplied source, which this change relies on as a security precondition.
