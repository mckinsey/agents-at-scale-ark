## 1. Service Layer

- [ ] 1.1 Define manual TypeScript types for execution engine K8s resource and normalized dashboard shape in `engines.ts`
- [ ] 1.2 Rewrite `engines.ts` to call generic resource API (`/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine`), with list, get-by-name, and delete operations. Add TODO comment about promoting to dedicated API endpoints.
- [ ] 1.3 Create `engines-hooks.ts` with `useGetAllExecutionEngines()` and `useDeleteExecutionEngine()` react-query hooks

## 2. Agent Studio Dropdown

- [ ] 2.1 Update `model-config-section.tsx` to replace the `<Input>` with a `<Select>` dropdown for execution engine, using `useGetAllExecutionEngines()` to populate options
- [ ] 2.2 Add phase status indicators (colored dot) to each engine option in the dropdown
- [ ] 2.3 Verify form load/save still works: pre-selects existing engine on edit, saves `ExecutionEngineRef` on create/update, clears when "None (Unset)" selected

## 3. Execution Engines List Page

- [ ] 3.1 Create `execution-engine-card.tsx` component showing name, phase badge, resolved address, description, and status message (for errors)
- [ ] 3.2 Create `execution-engines-section.tsx` section component that fetches and renders engine cards with empty state
- [ ] 3.3 Create page at `app/(dashboard)/execution-engines/page.tsx` using the section component
- [ ] 3.4 Add delete action to engine cards, wired to `useDeleteExecutionEngine()` hook

## 4. Navigation & Feature Gating

- [ ] 4.1 Add `execution-engines` entry to `DASHBOARD_SECTIONS` in `dashboard-icons.ts` with `enablerFeature` set to the execution engine experimental flag key
- [ ] 4.2 Add "Execution Engines" button to the More popover in `app-sidebar.tsx`, conditionally rendered when experimental flag is enabled
