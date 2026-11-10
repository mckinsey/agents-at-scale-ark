# Agent Structured Output (Anthropic)

Checks that an Agent's `outputSchema` reaches an `anthropic` Model as `output_config.format`.

## What it tests
- A schema-bearing Agent sends `output_config.format` with `type: json_schema` and the schema unchanged
- An Agent without a schema on the same Model sends no `output_config`

## Running
```bash
chainsaw test
```

Successful completion shows the completions executor passes `outputSchema` to Anthropic-format providers.
