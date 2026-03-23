## Why

The Query CRD supports two input types: `user` (a text string) and `messages` (an array of `openai.ChatCompletionMessageParamUnion`). The `messages` type exists to embed full conversation history in the query input — but the broker now manages conversation history via sessions. This makes `type: messages` redundant and carries costs:

- The CRD's `GetInputMessages()` / `SetInputMessages()` methods import `openai-go` types, coupling the API schema to a specific provider SDK
- Every component that reads query input must handle both formats
- The `messages` format leaks implementation detail (OpenAI message structure) into the user-facing API

## What Changes

- Deprecate `type: messages` in the Query CRD with a migration warning
- Add mutating webhook to convert `messages` input to `user` input (extract first user text) for backwards compatibility during migration
- Remove `GetInputMessages()` / `SetInputMessages()` from QuerySpec
- Remove OpenAI import from `api/v1alpha1/query_types.go`
- Update controller, completions engine, API gateway, and dashboard to remove messages-type handling
- Update SDK and CLI to stop sending `type: messages`

## Non-goals

- Changing how the broker manages conversation history
- Removing the ability to pass context — users send input text, the broker attaches session history
- Changing the wire format of A2A messages between controller and executor

## Compatibility Contract

- Existing `type: messages` queries continue to work during the deprecation period via the mutating webhook
- Migration warning annotation tells users to switch to `type: user` with broker sessions
- After deprecation period, `type: messages` returns a validation error

## Impact

- `ark/api/v1alpha1/query_types.go` — remove OpenAI import, remove messages helpers
- `ark/internal/webhook/v1/query_webhook.go` — add migration webhook
- `ark/internal/controller/query_controller.go` — simplify input handling
- `ark/executors/completions/query_parameters.go` — remove messages branch in `GetQueryInputMessages`
- `services/ark-sdk-python/` — update SDK to use text input only
- `tools/ark-cli/` — update CLI input handling
- `docs/` — update query documentation
