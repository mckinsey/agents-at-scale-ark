# Claude Code Configuration

This directory contains Claude Code settings for auto-installing the ark plugin.

## Auto-Installation

The `settings.json` file configures:
- `enabledPlugins`: Automatically enables the `ark@agents-at-scale-ark` plugin
- `extraKnownMarketplaces`: Makes the local marketplace known to Claude Code

**Note**: The marketplace must be added manually the first time:
```bash
claude plugin marketplace add ./
```

After that, the plugin should auto-install when you run `claude` in this directory.
