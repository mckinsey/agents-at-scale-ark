# PR2-v2 Protocol Loops Tasks

## 1. Interface conversion

- [ ] 1.1 Update `TeamMember` interface to use `ProtocolMessage` for input and history.
- [ ] 1.2 Update `ExecutionResult.Messages` to `[]ProtocolMessage`.

## 2. Agent execution loop

- [ ] 2.1 Convert agent local execution to protocol-native input/output with adapter at model boundary.
- [ ] 2.2 Convert agent-as-tool and team-as-tool executors to protocol message types.
- [ ] 2.3 Attach execution-trace extension metadata to agent output messages.

## 3. Team and selector loops

- [ ] 3.1 Convert team sequential, round-robin, and graph loops to protocol-native history.
- [ ] 3.2 Convert selector history building to read extension metadata for agent labels.
- [ ] 3.3 Update team max-turns messages to use protocol constructors.

## 4. Execution engine client

- [ ] 4.1 Remove `ExecutionEngineMessage` struct and `convertToExecutionEngineMessage`.
- [ ] 4.2 Pass `[]ProtocolMessage` directly as history in execution context.

## 5. Verification

- [ ] 5.1 Compile completions package and all tests.
- [ ] 5.2 Run focused selector, execution-engine, and team tests.
