## Why

The broker page has tabs for traces, messages, chunks, and events — but no tab for sessions. The `/sessions` endpoint is now live (merged via #1457) and provides a materialized view of all sessions and queries. Adding a Sessions tab to the broker page lets developers inspect session state in real-time alongside the other streams.

## What Changes

- Add a "Sessions" tab to the broker page that connects via SSE to `/sessions?watch=true`
- Match the visual style of existing stream tabs (Card, bg-muted scrollable area, chevron expand, timestamp + ID per row)
- Only connect SSE for the active tab to prevent browser connection exhaustion

## Capabilities

### New Capabilities
- `broker-sessions-tab`: Sessions tab on the broker page with live SSE updates, expand/collapse JSON, purge, auto-scroll

### Modified Capabilities

## Impact

- `services/ark-dashboard/ark-dashboard/app/(dashboard)/broker/page.tsx` — add SessionsLiveView component and Sessions tab
