#!/bin/bash
set -e

# Define paths
REPO_ROOT="$(git rev-parse --show-toplevel)"
API_OPENAPI="${REPO_ROOT}/services/ark-api/openapi.json"
DASHBOARD_OUT_DIR="${REPO_ROOT}/services/ark-dashboard/out"
DASHBOARD_OPENAPI="${DASHBOARD_OUT_DIR}/openapi.json"
DASHBOARD_DIR="${REPO_ROOT}/services/ark-dashboard/ark-dashboard"

# Ensure output directory exists
mkdir -p "$DASHBOARD_OUT_DIR"

# Copy OpenAPI spec
# echo "Copying OpenAPI spec..."
cp "$API_OPENAPI" "$DASHBOARD_OPENAPI"

# Generate types
# echo "Generating types..."
cd "$DASHBOARD_DIR"
npm run generate:api > /dev/null

# echo "Dashboard types updated."
