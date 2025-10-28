# A2A Blocking Task Failed Test

Tests querying the mock-llm countdown A2A agent with a blocking Task that fails, verifying the error message is propagated to the Query status.

## What it tests

- A2AServer resources are discovered and become Ready
- Query can target A2A agents that return failed Tasks
- Countdown agent rejects negative countdown values
- Query status transitions to error with the failure message

## Resources created

- `mock-llm-countdown` A2AServer
- `countdown-fail-query` Query targeting the countdown agent with invalid input

## Expected behavior

The countdown agent receives "countdown from -5" and returns a failed Task with error message "Cannot countdown from negative number -5". The Query should transition to error phase with this message.
