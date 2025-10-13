# Query Input Type Chainsaw Test

This directory contains Chainsaw tests for validating the Query CRD's support for different input types in the ARK system.

The tests here ensure that queries can be submitted with various input formats (string, message array) and that the controller logic process them correctly end-to-end.

## What it tests
- Default Query Input
- Explicit User Input Type
- Explicit Messages Input Type
- Invalid Default Input: Asserts that the query fails and phase is set to `error`
- Invalid User Input: Asserts that the query fails and phase is set to `error`
- Invalid Messages Input: Asserts that the query fails and phase is set to `error`

## Running
1. Ensure you have a running Kubernetes cluster and Chainsaw installed.
2. Set required environment variables (e.g., `E2E_TEST_AZURE_OPENAI_KEY`, `E2E_TEST_AZURE_OPENAI_BASE_URL`).
3. Run the test:
```bash
   chainsaw test tests/query-input-type/chainsaw-test.yaml
```
