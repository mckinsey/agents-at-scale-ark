# Prompt Injection Approval Gate

Reproduces pentest scenario 1 — indirect prompt injection that runs a bash command —
and verifies the human-approval gate stops it.

## What it tests
- A command-execution tool (`run-command`) gated by `approval.required` halts the query
  at `input-required` when the model tries to call it, and the command never runs.
- The same tool without the gate executes and the query completes (negative control).
- The command backend is a mock; the security assertion checks it received zero requests
  while the query was held for approval.

The model step is scripted with mock-llm: it returns a tool call to `run-command`, standing
in for a real model that read a poisoned file and followed its injected instructions.

## Running
```bash
chainsaw test
```

Successful completion means the approval gate blocks injected command execution while leaving
ungated tool calls working.
