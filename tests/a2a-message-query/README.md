# A2A Message Query Test

Tests querying the mock-llm echo A2A agent and verifying the message is echoed back.

## What it tests

- A2AServer resources are discovered and become Ready
- Query can target A2A agents
- Echo agent correctly echoes back the input message
- Query response contains the expected content

## Resources created

- `mock-llm-echo` A2AServer
- `echo-test-query` Query targeting the echo agent

## Expected behavior

The echo agent receives the message "Hello from A2A echo agent!" and returns it unchanged in the response.
