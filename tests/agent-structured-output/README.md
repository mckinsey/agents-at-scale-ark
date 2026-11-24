# Agent Structured Output

Validates that an agent `outputSchema` reaches the model provider as a strict `json_schema` response format.

## What it tests
- `outputSchema` on an Agent is sent to the provider as `response_format.type: json_schema` with `strict: true` and the schema body intact
- The generated `json_schema.name` identifies the namespace and agent
- The query response is valid JSON carrying every field the schema requires
- An agent with no `outputSchema` sends no `response_format`, proving the match is specific to structured output

Mock-llm rejects any completions request that carries no `response_format.json_schema` with a 500, so a regression that drops the schema errors the query instead of passing silently.

## Running
```bash
chainsaw test
```

Successful completion validates that structured output is plumbed from the Agent CRD through to the provider request.
