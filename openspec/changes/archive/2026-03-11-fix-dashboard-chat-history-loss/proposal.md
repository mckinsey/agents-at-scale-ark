## Why

In the dashboard chat, when a user sends a second message to an agent or team, the previous assistant responses disappear. The `chatcmpl-final` chunk carries `completedQueryMessages` from `response.raw` containing only the current turn's messages. The dashboard replaces ALL non-user messages with these, wiping previous turns' assistant responses and tool results. This is a pre-existing bug present on both main and the query engine branch.

## What Changes

- Capture the turn start index before streaming begins
- When processing `completedQueryMessages`, replace only the current turn's messages (from the start index onward) instead of all non-user messages
- Preserves full conversation history across multiple turns

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `services/ark-dashboard/ark-dashboard/lib/hooks/use-chat-session.ts` — `handleStreamChatResponse` function
