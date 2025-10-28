# Research Agents

This directory contains three specialized agents that work together to create a comprehensive research workflow.

## Agents Overview

### Researcher Agent (`researcher-agent.yaml`)
**Role**: Information gathering and initial research

**Capabilities**:
- Web search using the DuckDuckGo tool
- Structured data collection and organization
- Source validation and citation
- Comprehensive topic coverage

**Output Format**: Structured research findings with sources, key points, and detailed information

### Analyst Agent (`analyst-agent.yaml`)
**Role**: Data validation and insight generation

**Capabilities**:
- Research data validation and consistency checking
- Pattern and trend identification
- Cross-reference verification
- Strategic insight generation
- Recommendation synthesis

**Output Format**: Analysis report with validated insights, recommendations, and executive summary

### Creator Agent (`creator-agent.yaml`)
**Role**: Document creation and file management

**Capabilities**:
- Professional document creation
- Markdown formatting and structure
- File system integration via MCP
- Content consolidation and organization

**Tools Used**:
- `mcp-filesystem-write-file`: Save documents to filesystem
- `mcp-filesystem-create-directory`: Create directory structure
- `mcp-filesystem-list-directory`: Browse existing files
- `mcp-filesystem-get-file-info`: Get file metadata

**Output Format**: Professional documents saved to filesystem with confirmation

## Sequential Workflow

1. **Researcher** → Searches web, gathers information, provides structured findings
2. **Analyst** → Validates data, generates insights, creates recommendations
3. **Creator** → Consolidates analysis into professional documents, saves to filesystem

## Testing

### Test All Agents Together
```bash
chainsaw test samples/walkthrough/agents/tests/
```

### Test Individual Agents

Each agent has its own comprehensive test that includes query execution:

```bash
# Test researcher agent with web search
chainsaw test --test-file chainsaw-researcher-test.yaml samples/walkthrough/agents/tests/

# Test analyst agent with data analysis
chainsaw test --test-file chainsaw-analyst-test.yaml samples/walkthrough/agents/tests/

# Test creator agent with document generation (requires MCP filesystem)
chainsaw test --test-file chainsaw-creator-test.yaml samples/walkthrough/agents/tests/
```

### Individual Test Features

- **Researcher Test**: Validates web search capabilities and structured research output
- **Analyst Test**: Tests data validation, insight generation, and recommendation synthesis
- **Creator Test**: Verifies document creation and filesystem integration (deploys MCP server automatically)

## Dependencies

- **Model**: All agents reference the `default` model
- **Tools**: 
  - Researcher requires `web-search` tool
  - Creator requires MCP filesystem tools
- **MCP Server**: Creator agent requires `mcp-filesystem` server for file operations