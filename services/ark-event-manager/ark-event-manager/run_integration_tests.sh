#!/bin/bash
# Run integration tests for ark-event-manager
# This script generates proto code and runs integration tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generating proto code..."
uv run python -c "from tests.generate_proto import generate_proto; generate_proto()"

echo "Running integration tests..."
uv run pytest tests/ -v -m integration -s

