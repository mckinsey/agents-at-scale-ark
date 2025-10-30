# MCP Filesystem Server with Session Management

MCP-compliant filesystem server with persistent session tracking and annotation-driven workspace configuration.

## Quickstart

```bash
# Show all available recipes.
make help

# Install/uninstall - sets up your local machine or cluster.
make install
make uninstall

# Run in development mode. May require extra tools and setup, check the README.
make dev
```

## Features

- **MCP Protocol Compliant**: Full implementation of MCP session lifecycle
- **Persistent Session Tracking**: Session metadata survives server restarts via file-based storage
- **LRU Eviction**: Automatically evicts least recently used sessions when limit reached
- **Annotation-Driven Configuration**: Workspaces configured via ARK query annotations
- **Shared Base Directory**: All operations under `/data/` with user-specified workspaces
- **All Filesystem Operations**: Read, write, edit, move, search, list, tree

## Configuration

Environment variables (configured in `chart/values.yaml`):
- `PORT`: Server port (default: 8080)
- `BASE_DATA_DIR`: Base directory for all filesystem operations (default: /data)
- `SESSION_FILE`: Path to session metadata storage (default: /data/sessions/sessions.json)
- `MAX_SESSIONS`: Maximum concurrent sessions (default: 1000)

Helm chart options:
- `persistence.size`: Storage size for persistent volume (default: 10Gi)
- `persistence.storageClass`: Storage class for PVC
- `resources`: CPU and memory limits/requests

## Workspace Configuration

Workspaces are configured via ARK query annotations using the `set_base_directory` tool:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: my-query
  annotations:
    "ark.mckinsey.com/mcp-server-settings": |
      {"default/mcp-filesystem": {
        "toolCalls": [{
          "name": "set_base_directory",
          "arguments": {"path": "my-workspace"}
        }]
      }}
spec:
  input: "List all files"
  targets:
    - name: filesystem-agent
```

This creates and configures `/data/my-workspace/` as the working directory for all filesystem operations in that query.

## Using with ARK

The MCP server creates an `MCPServer` resource that auto-generates tools with the `mcp-filesystem-` prefix.

Example agent configuration:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: filesystem
spec:
  tools:
    - name: mcp-filesystem-read-file
      type: custom
    - name: mcp-filesystem-write-file
      type: custom
    - name: mcp-filesystem-edit-file
      type: custom
    - name: mcp-filesystem-create-directory
      type: custom
    - name: mcp-filesystem-list-directory
      type: custom
```

See `samples/agents/filesystem.yaml` for complete configuration.

Example query:

```bash
ark query agent/filesystem "Create a file hello.txt with content 'Hello World', then list all files"
```

For detailed usage examples and session management, see `docs/content/user-guide/samples/mcp-servers.mdx`.

## Architecture

**Clean separation of concerns:**

### Session Wrapper (`src/index.ts`)
- MCP protocol session lifecycle (ID generation, tracking)
- Session metadata persistence (sessions.json)
- LRU eviction and cleanup
- Transport management
- **Generic and reusable** - can be copied to other MCP servers

### Filesystem Adapter (`src/adapters/filesystem/`)
- MCP tool definitions and implementations
- File operations (read, write, edit, search, list, tree)
- Path validation and security
- Workspace management via `set_base_directory`

### Key Design Principles
- **MCP sessions ≠ application state**: Sessions track connections, not configuration
- **Annotations as source of truth**: Workspace configuration comes from ARK annotations
- **Single base directory**: All sessions share `/data/` with user-specified subdirectories
- **No per-session directories**: Workspaces are explicitly named and persistent