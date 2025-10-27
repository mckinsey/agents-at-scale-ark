# A2A Blocking Task Completed Test

Tests querying the mock-llm countdown A2A agent with a blocking Task that completes successfully, verifying all agent messages from the task history are returned.

## What it tests

- A2AServer resources are discovered and become Ready
- Query can target A2A agents that return Tasks
- Countdown agent completes successfully with a short countdown
- Query response contains all agent messages from task history (not just final message)

## Resources created

- `mock-llm-countdown` A2AServer
- `countdown-test-query` Query targeting the countdown agent

## Expected behavior

The countdown agent receives "countdown from 2" and returns a completed Task with full history:
- Starting countdown from 2 seconds...
- 1 seconds remaining...
- 0 seconds remaining...
- Countdown complete!
