# Fark

CLI tool and HTTP API for querying ARK agents, teams, and models.

## Installation

### From Source
```bash
# Clone and build locally
git clone https://github.com/mckinsey/agents-at-scale-ark.git
cd agents-at-scale-ark
make fark-install  # Builds and installs to ~/.local/bin
```

### Development
```bash
make help          # Show available commands
make fark-dev      # Run in development mode
```

## CLI Usage
```bash
# Query an agent (verbose by default - shows events)
./fark agent my-weather "what's the weather in Seattle?"

# Quiet mode - shows spinner but suppresses event logs
./fark agent my-weather "what's the weather?" --quiet

# JSON output format
./fark agent my-weather "what's the weather?" --output json

# Combine quiet mode with JSON for clean output
./fark agent my-weather "what's the weather?" --quiet --output json
```

## Output Options
- `--output text|json` - Control output format (default: text)
- `--verbose` - Show detailed events and logs (default: true)
- `--quiet` - Suppress event logs, show spinner and results only

## Notes
- Install requires repository root context
- Supports both CLI queries and HTTP server mode
- Events shown by default with colorized timestamps
- Spinner indicates progress in both verbose and quiet modes