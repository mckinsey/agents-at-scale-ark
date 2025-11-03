# Filesystem MCP - Annotation-Based Workspace Isolation Test

Tests annotation-driven workspace configuration with the stateful filesystem MCP server.

## What it tests

- **MCP Server Deployment**: Helm chart deployment and tool discovery
- **Annotation-Based Workspace Configuration**: Using `ark.mckinsey.com/mcp-server-settings` to configure workspaces
- **Workspace Isolation**: Two agents operate in separate workspaces under `/data/`
- **Write Operations**: Files written to annotation-configured workspace directories
- **Read Operations**: Agents can only access files in their configured workspaces
- **Cross-Contamination Prevention**: Agents cannot see files from other workspaces
- **Path Abstraction**: Agent prompts don't mention paths - configuration via annotations only

## Test Architecture

```
/data/                                  # Shared base directory (BASE_DATA_DIR)
├── workspace-a/                            # Agent A's workspace (annotation-configured)
│   └── agent-a-data.txt                    # Agent A's file
└── workspace-b/                            # Agent B's workspace (annotation-configured)
    └── agent-b-data.txt                    # Agent B's file
```

**Key Principles:**
- Workspaces defined via `set_base_directory` tool in annotations
- Agent prompts are generic ("save a file", "read a file")
- Actual paths determined by annotation configuration
- Complete isolation between workspaces

## How it works

### Workspace Configuration

Each Query includes an annotation that calls `set_base_directory` during MCP initialization:

```yaml
annotations:
  "ark.mckinsey.com/mcp-server-settings": |
    {"namespace/mcp-server-name": {
      "toolCalls": [{
        "name": "set_base_directory",
        "arguments": {"path": "workspace-a"}
      }]
    }}
```

This creates `/data/workspace-a/` and configures it as the working directory **before** the agent executes.

### Agent Prompts (Path-Agnostic)

Agent prompts don't mention specific paths:

```yaml
spec:
  input: |
    Create a file called "agent-a-data.txt" with the content:
    "This is Agent A's confidential data."

    Then confirm the file was created by listing all files.
```

The annotation determines WHERE the file gets created (`/data/workspace-a/`).

### Test Flow

1. **Deploy MCP Server** via Helm chart
2. **Create Two Agents** (agent-a, agent-b) with filesystem tools
3. **Query Write A**: Creates file in workspace-a (via annotation)
4. **Query Write B**: Creates file in workspace-b (via annotation)
5. **Query Read A**: Reads from workspace-a, verifies Agent A's file exists
6. **Query Read B**: Reads from workspace-b, verifies Agent B's file exists
7. **Verify Isolation**: Check that workspaces don't contain each other's files

## Running

```bash
chainsaw test tests/filesystem-mcp/
```

Successful completion validates:
- Annotation-based workspace configuration works
- Files written to correct workspace directories
- No cross-contamination between workspaces
- Agent prompts are path-agnostic
