# A2A Blocking Task Completed Test

Tests querying the mock-llm countdown A2A agent with a blocking Task that completes successfully, verifying the final result artifact is returned as the reply.

## What it tests

- A2AServer resources are discovered and become Ready
- Query can target A2A agents that return Tasks
- Countdown agent completes successfully with a short countdown
- Query response contains the final result artifact; intermediate task status updates are excluded from reply content

## Resources created

- `mock-llm-countdown` A2AServer
- `countdown-test-query` Query targeting the countdown agent

## Expected behavior

The countdown agent receives "countdown from 2" and returns a completed Task. Intermediate progress is emitted as task status updates:
- Starting countdown from 2 seconds...
- 1 seconds remaining...
- 0 seconds remaining...

The blocking query response carries only the final result:
- Countdown complete!
