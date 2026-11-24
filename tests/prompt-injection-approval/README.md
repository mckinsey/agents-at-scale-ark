# Prompt Injection Approval Gate

Reproduces pentest scenario 1 — indirect prompt injection that runs a bash command —
and verifies the human-approval gate stops it.

## What it tests
- A command-execution tool (`run-command`) gated by `approval.required` halts the query
  at `input-required` when the model tries to call it. Reaching `input-required` means the
  tool call was intercepted and held before execution — the command never ran.

The model step is scripted with mock-llm: it returns a tool call to `run-command`, standing
in for a real model that read a poisoned file and followed its injected instructions.

The ungated negative control (the same call executes when the tool is *not* gated) is covered
deterministically by the Go unit test `TestScenario1_UngatedExecToolRunsBothCommands` in
`ark/executors/completions/injection_scenario_test.go`. It is intentionally not duplicated
here: exercising real tool execution end-to-end needs a cross-namespace HTTP call from the
executor, which adds flakiness without adding coverage the unit test lacks.

## Running
```bash
chainsaw test
```

Successful completion means the approval gate holds an injected command call for human
approval instead of executing it.
