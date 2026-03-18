# query-input-api-normalization

Step 4 in the staged protocol-native migration: add protocol-typed input accessors to `QuerySpec` alongside `GetInputMessages` and `SetInputMessages`, enabling engines to receive input as `protocol.Message` without CRD schema changes.
