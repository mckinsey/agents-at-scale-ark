## 1. Fix chat history replacement

- [x] 1.1 Add `const turnStartIndex = chatMessages.length + 1` at the beginning of `handleStreamChatResponse`, before `currentMessageIndex`
- [x] 1.2 Replace the `completedQueryMessages` handling block (lines ~348-394) — change `prev.filter(m => m.role === 'user')` to `prev.slice(0, turnStartIndex)` so only the current turn is replaced
- [x] 1.3 Update the comment from "Keep only user messages" to "Preserve previous turns, replace current turn"

## 2. Verification

- [x] 2.1 Run `npm run build` in the dashboard directory to verify TypeScript compiles (pre-existing dagre dep failure, tsc --noEmit passes clean)
- [x] 2.2 Run dashboard tests if available (no tests for use-chat-session hook)
