# Engine Conformance Tests

Validates that an execution engine implements the Ark execution contract.

## Running

```bash
ENGINE_URL=http://localhost:9090 go test -v ./...
```

Successful completion validates the engine serves a valid Agent Card with execution profile, handles blocking and streaming execution, supports tool callbacks, returns structured errors, and manages task lifecycle.
