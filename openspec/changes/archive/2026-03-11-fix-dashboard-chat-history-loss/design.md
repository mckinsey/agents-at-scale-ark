## Context

In `use-chat-session.ts`, `handleStreamChatResponse` manages the chat message state during streaming. When the `chatcmpl-final` chunk arrives, it parses `completedQueryMessages` from `response.raw` — these contain the full message chain for the current execution (assistant messages with tool_calls, tool result messages, final assistant response).

The current code at line 348-394 replaces the entire chat state:
```typescript
const userMessages = prev.filter(m => m.role === 'user');
const updated = [...userMessages, ...converted];
```

This keeps only user messages and replaces everything else, destroying previous turns' assistant responses.

The `completedQueryMessages` replacement exists because streaming chunks don't include tool result messages (`role: "tool"`) — only assistant deltas with `tool_calls` and `content`. The replacement ensures the dashboard shows complete tool call history. Removing it would lose tool results.

## Goals / Non-Goals

**Goals:**
- Previous conversation turns preserved when new responses arrive
- Tool call history still rendered correctly from `completedQueryMessages`

**Non-Goals:**
- Changing the backend's `response.raw` format
- Adding tool result messages to the streaming protocol

## Decisions

### 1. Capture turn start index

Add `turnStartIndex` at the beginning of `handleStreamChatResponse`:
```typescript
const turnStartIndex = chatMessages.length + 1;
```

This is the index where the first assistant placeholder for this turn was inserted (after the user message at `chatMessages.length`). `currentMessageIndex` starts at this value but gets incremented during team execution when agents change.

### 2. Replace only current turn's messages

Change the `completedQueryMessages` handling to preserve everything before the current turn:
```typescript
const beforeThisTurn = prev.slice(0, turnStartIndex);
const updated = [...beforeThisTurn, ...converted];
```

This preserves all previous turns (user messages, assistant responses, tool results from earlier) and only replaces the current turn's streamed placeholders with the complete message chain.

## Risks / Trade-offs

- **turnStartIndex correctness** — relies on `chatMessages.length + 1` being computed before any state updates. This is already how `currentMessageIndex` is computed, so the pattern is established.
