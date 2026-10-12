# Research Analysis Team

This directory contains the sequential team configuration that orchestrates the three research agents in a coordinated workflow.

## Team Configuration

**Name**: `research-analysis-team`
**Strategy**: Sequential execution
**Max Turns**: 3 (one turn per agent)

## Team Members

The team executes agents in this specific order:

1. **researcher** → Conducts web search and gathers information
2. **analyst** → Validates data and generates insights  
3. **creator** → Creates professional documents and saves to filesystem

## Sequential Strategy Benefits

- **Ordered Execution**: Each agent builds on the previous agent's output
- **Data Flow**: Information flows naturally from research → analysis → creation
- **Quality Control**: Each stage validates and enhances the previous work
- **Predictable Results**: Consistent workflow produces reliable outcomes

## Execution Flow

```
Query Input → Researcher Agent → Analyst Agent → Creator Agent → Final Output
```

1. **Input Phase**: Query provides research topic or question
2. **Research Phase**: Researcher gathers web information and structures findings
3. **Analysis Phase**: Analyst validates data, identifies insights, generates recommendations
4. **Creation Phase**: Creator consolidates everything into professional documents
5. **Output Phase**: Documents saved to filesystem, query marked complete

## Testing

Test the team configuration:

```bash
chainsaw test samples/walkthrough/teams/tests/
```

## Dependencies

- **Agents**: All three agents (researcher, analyst, creator) must exist
- **Tools**: Web search tool and MCP filesystem tools must be available
- **Model**: Default model must be configured and ready
- **MCP Server**: MCP filesystem server must be deployed for document storage

## Usage

Reference this team in queries:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
spec:
  input: "Research topic or question"
  target:
    type: team
    name: research-analysis-team
```