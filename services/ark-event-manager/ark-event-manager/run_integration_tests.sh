#!/bin/bash
# Run integration tests for ark-event-manager

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Running integration tests..."
uv run pytest tests/ -v -m integration -s

