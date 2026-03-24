# controller-response-boundary

Remove the controller's dependency on `completions.Message` types in the response path. Replace `serializeMessages` with a provider-independent `buildFallbackRaw`.
