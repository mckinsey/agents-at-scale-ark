## 1. Controller - Write Side

- [ ] 1.1 Change `AttrSessionID` constant in `ark/internal/telemetry/recorders.go` from `"session.id"` to `"ark.session.id"`
- [ ] 1.2 Change baggage key in `ark/internal/controller/query_controller.go` from `"session.id"` to `"ark.session.id"`
- [ ] 1.3 Update controller dispatch tests in `ark/internal/controller/query_controller_dispatch_test.go` to expect `"ark.session.id"` for both span attribute and baggage member

## 2. Broker - Read Side

- [ ] 2.1 Change `spanMatchesSessionId()` in `services/ark-broker/ark-broker/src/routes/traces.ts` to match on `"ark.session.id"` instead of `"session.id"`
- [ ] 2.2 Remove the `resource.session_id` fallback from `spanMatchesSessionId()`
- [ ] 2.3 Update broker session filter tests in `services/ark-broker/ark-broker/test/session-filter.test.ts` to use `"ark.session.id"` and remove `resource.session_id` test cases

## 3. Dashboard - Read Side

- [ ] 3.1 Change `extractQueryIdAndSessionId()` in `services/ark-dashboard/ark-dashboard/lib/broker/session-utils.ts` to look for `"ark.session.id"` instead of `"session.id"` in span attributes
- [ ] 3.2 Update inline session grouping in `services/ark-dashboard/ark-dashboard/components/chat/embedded-chat-panel.tsx` to match on `"ark.session.id"`
- [ ] 3.3 Update dashboard session utils tests in `services/ark-dashboard/ark-dashboard/__tests__/unit/app/(dashboard)/broker/sessions-tab.test.ts` to use `"ark.session.id"`

## 4. Documentation

- [ ] 4.1 Update `docs/content/developer-guide/observability/index.mdx` line 44 to mention `ark.session.id` as the baggage key
- [ ] 4.2 Update `docs/content/reference/api-specifications/traces.mdx` to document the `session_id` query parameter and its use of `ark.session.id` for filtering

## 5. Verification

- [ ] 5.1 Run controller tests (`cd ark && make test`)
- [ ] 5.2 Run broker tests (`cd services/ark-broker && make test`)
- [ ] 5.3 Run dashboard build (`cd services/ark-dashboard && npm run build`)
