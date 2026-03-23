# Drop Query Input Types Tasks

## Phase 1: Deprecation

- [ ] 1.1 Add mutating webhook to convert `type: messages` to `type: user` with migration warning annotation
- [ ] 1.2 Add validating webhook warning for `type: messages` using existing `collectMigrationWarnings` pattern
- [ ] 1.3 Update `GetQueryInputMessages` in completions to handle the simplified input
- [ ] 1.4 Update API gateway to stop accepting `type: messages` in new requests (return deprecation notice)

## Phase 2: Removal

- [ ] 2.1 Remove `GetInputMessages()` and `SetInputMessages()` from `QuerySpec`
- [ ] 2.2 Remove `openai-go` import from `api/v1alpha1/query_types.go`
- [ ] 2.3 Remove `QueryTypeMessages` constant
- [ ] 2.4 Remove messages-type branch from `GetQueryInputMessages`

## Phase 3: SDK and clients

- [ ] 3.1 Update `ark-sdk-python` to use text input only
- [ ] 3.2 Update `ark-cli` to use text input only
- [ ] 3.3 Update dashboard chat to use text input only

## Phase 4: Documentation

- [ ] 4.1 Update query documentation to reflect text-only input
- [ ] 4.2 Add migration guide for `type: messages` users
- [ ] 4.3 Update samples to remove `type: messages` examples
