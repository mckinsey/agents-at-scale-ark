## Why

Execution engines are a core Ark concept but have zero dashboard visibility. Users must use kubectl to list, inspect, or debug them. When configuring an agent's execution engine in Agent Studio, users type a free-text name with no validation that the engine exists or is healthy. This leads to silent misconfiguration and makes engine errors hard to discover.

## What Changes

- Replace the free-text execution engine input in Agent Studio with a dropdown selector that lists available engines from the current namespace, showing phase status (ready/error/running) inline
- Add a read-only Execution Engines list page showing all engines in the current namespace with name, phase, resolved address, description, and status message
- Add delete capability on the list page (no create/edit — kubectl for now)
- Add an "Execution Engines" entry to the "More" sidebar popover
- Rewrite the mock engines service to call the real generic resource API
- All new UI remains gated behind the existing experimental execution engine feature flag
- Add execution engine dependency checking to the agent controller, matching the existing pattern for models and tools — agent availability reflects engine existence and readiness

## Capabilities

### New Capabilities
- `execution-engine-list-page`: Dashboard page listing execution engines with status, address, description, and delete action
- `execution-engine-dropdown`: Agent Studio dropdown selector for execution engines with phase status indicators, replacing the current free-text input
- `agent-engine-dependency`: Agent controller validates execution engine existence and readiness as a dependency, matching the pattern used for models and tools

## Impact

- **Dashboard** — new and modified UI components in ark-dashboard
- **Ark controller** — agent reconciler gains execution engine dependency checking and watches
- Files affected: `engines.ts` (rewrite), `model-config-section.tsx` (edit), `app-sidebar.tsx` (edit), `dashboard-icons.ts` (edit), plus new files for hooks, page, section, and card components
- Uses the generic resource API (`/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine`) — manual TypeScript types needed since no dedicated API endpoints exist. Should be promoted to dedicated endpoints when execution engines graduate from experimental.
