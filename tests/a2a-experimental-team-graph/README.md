# A2A Native Team Graph Test

Tests graph team execution with A2A native mode enabled.

## What it tests

- Graph team execution uses A2A execution path (`executeGraphA2A`)
- Query executes through A2A mode by default
- Graph edges define execution flow: researcher -> analyzer -> reviewer -> writer
- All four agents execute in defined graph order

## A2A Features Validated

- Default A2A execution on Query resource
- A2A-enabled graph team execution flow
- Graph edge traversal in A2A mode
- Message passing through graph nodes in A2A format

## Graph Structure

```
researcher -> analyzer -> reviewer -> writer
```

The graph defines a linear workflow where:
1. Researcher gathers information
2. Analyzer identifies patterns
3. Reviewer validates accuracy
4. Writer produces final report

## Mock-LLM Configuration

Uses mock-llm with `ark.a2a.enabled: true` to:
- Create A2A server resources automatically
- Provide deterministic responses for each graph node
- Simulate complete graph traversal
- Enable reliable CI/CD testing

## Running

```bash
chainsaw test
```

## Expected Assertions

1. Model becomes available
2. All agents (researcher, analyzer, reviewer, writer) become available
3. Team with graph strategy becomes available
4. Query completes successfully
5. Response target is graph-team
6. Response content length > 200 (comprehensive output from full graph traversal)
