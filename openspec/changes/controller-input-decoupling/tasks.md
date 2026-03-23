# Controller Input Decoupling Tasks

## 1. Shared resolver

- [ ] 1.1 Create `ark/internal/resolution/query_input.go` with `ResolveQueryInputText` handling `user` and `messages` query types
- [ ] 1.2 Implement `ExtractFirstUserText` parsing `json.RawMessage` for first user message text without OpenAI types
- [ ] 1.3 Implement `ResolveQueryInput` with template parameter resolution
- [ ] 1.4 Create shared `ResolveFromConfigMap` and `ResolveFromSecret` helpers

## 2. Controller migration

- [ ] 2.1 Update `extractUserInput` in `query_controller.go` to call `resolution.ResolveQueryInputText`
- [ ] 2.2 Remove `completions` import from controller input path

## 3. Completions deduplication

- [ ] 3.1 Refactor `completions/query_parameters.go` `resolveValueFrom` to delegate ConfigMap/Secret resolution to shared helpers
- [ ] 3.2 Verify `GetQueryInputMessages` still works unchanged for engine-internal use

## 4. Testing

- [ ] 4.1 Unit tests for `ResolveQueryInputText` covering user-text, messages-array, and parameter-ref input types
- [ ] 4.2 Unit tests for `ExtractFirstUserText` covering string content, array-of-parts content, and missing user messages
- [ ] 4.3 Unit tests for `ResolveFromConfigMap` and `ResolveFromSecret`
- [ ] 4.4 Run existing controller and completions tests to verify no regressions
