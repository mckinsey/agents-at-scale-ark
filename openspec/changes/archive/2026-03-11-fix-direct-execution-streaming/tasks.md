## 1. Add streaming to executeDirectly

- [x] 1.1 Create event stream in `executeDirectly` using `genai.NewEventStreamForQuery(ctx, impersonatedClient, query.Namespace, sessionID, query.Name)` after sessionID is computed
- [x] 1.2 Pass event stream to `agent.Execute` instead of `nil`
- [x] 1.3 After execution, send final chunk with completed query status via `genai.WrapChunkWithMetadata`, then call `NotifyCompletion` and `Close`
- [x] 1.4 Handle stream creation failure gracefully — log error, continue with nil eventStream

## 2. Verification

- [x] 2.1 Run `make lint-fix` — confirm 0 issues
- [x] 2.2 Run `make build` — confirm compilation
- [x] 2.3 Run `make test` — confirm unit tests pass
