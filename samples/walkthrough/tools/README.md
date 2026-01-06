# Web Search Tool

This tool provides web search capabilities using the DuckDuckGo API for agents to research information on any topic.

## Features

- **DuckDuckGo Integration**: Uses DuckDuckGo's search API for unbiased results
- **Configurable Results**: Control number of results returned (1-10, default: 5)
- **Structured Output**: Returns titles, snippets, and URLs in structured format
- **Timeout Protection**: 30-second timeout to prevent hanging requests

## Usage

Agents can use this tool by including it in their tool configuration:

```yaml
tools:
  - type: http
    name: web-search
```

### Parameters

- `query` (required): Search query to execute
- `num_results` (optional): Number of results to return (default: 5, max: 10)

### Example Usage

```json
{
  "query": "Kubernetes container orchestration",
  "num_results": 3
}
```

## Testing

Run the tool-specific tests:

```bash
chainsaw test samples/walkthrough/tools/tests/
```

## Dependencies

- DuckDuckGo API (no authentication required)
- Internet connectivity from the cluster