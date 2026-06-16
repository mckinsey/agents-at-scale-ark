## 1. Agent Controller — Engine Dependency

- [x] 1.1 Add `checkExecutionEngineDependency()` to agent reconciler: fetch ExecutionEngine by name/namespace, check existence and phase "ready", return "ExecutionEngineNotFound" or "ExecutionEngineNotReady" reasons
- [x] 1.2 Wire `checkExecutionEngineDependency()` into `checkDependencies()`, after the model check and before the tool check, gated on `agent.Spec.ExecutionEngine != nil`
- [x] 1.3 Add RBAC marker for `executionengines` (get, list, watch) on the AgentReconciler
- [x] 1.4 Add `Watches(&arkv1prealpha1.ExecutionEngine{}, ...)` to `SetupWithManager()` with `findAgentsForExecutionEngine()` mapper
- [x] 1.5 Add `findAgentsForExecutionEngine()` and `agentDependsOnExecutionEngine()` helper functions using the existing `findAgentsForDependency()` pattern
- [x] 1.6 Add unit tests for engine dependency checking: engine exists and ready, engine not found, engine not ready, agent with no engine reference

## 2. Dashboard Service Layer

- [x] 2.1 Define manual TypeScript types for execution engine K8s resource and normalized dashboard shape in `engines.ts`
- [x] 2.2 Rewrite `engines.ts` to call generic resource API (`/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine`), with list, get-by-name, and delete operations. Add TODO comment about promoting to dedicated API endpoints.
- [x] 2.3 Create `engines-hooks.ts` with `useGetAllExecutionEngines()` and `useDeleteExecutionEngine()` react-query hooks

## 3. Agent Studio Dropdown

- [x] 3.1 Update `model-config-section.tsx` to replace the `<Input>` with a `<Select>` dropdown for execution engine, using `useGetAllExecutionEngines()` to populate options
- [x] 3.2 Add phase status indicators (colored dot) to each engine option in the dropdown
- [x] 3.3 Verify form load/save still works: pre-selects existing engine on edit, saves `ExecutionEngineRef` on create/update, clears when "None (Unset)" selected

## 4. Execution Engines List Page

- [x] 4.1 Create `execution-engine-card.tsx` component showing name, phase badge, resolved address, description, and status message (for errors)
- [x] 4.2 Create `execution-engines-section.tsx` section component that fetches and renders engine cards with empty state
- [x] 4.3 Create page at `app/(dashboard)/execution-engines/page.tsx` using the section component
- [x] 4.4 Add delete action to engine cards, wired to `useDeleteExecutionEngine()` hook

## 5. Navigation & Feature Gating

- [x] 5.1 Add `execution-engines` entry to `DASHBOARD_SECTIONS` in `dashboard-icons.ts` with `enablerFeature` set to the execution engine experimental flag key
- [x] 5.2 Add "Execution Engines" button to the More popover in `app-sidebar.tsx`, conditionally rendered when experimental flag is enabled
