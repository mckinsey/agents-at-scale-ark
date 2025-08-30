#!/bin/bash
set -e

echo "🔨 Building evaluator-llm using centralized build system..."
echo ""
echo "This replaces the old build.sh with the proper Makefile-based approach"
echo "that dynamically handles ark-sdk dependencies."
echo ""

cd "$(dirname "$0")/../../"

# Use the centralized build system
make evaluator-llm-build

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "Next steps:"
echo "  Deploy with: make evaluator-llm-install"
echo "  Run tests with: make evaluator-llm-test" 
echo "  Run locally with: make evaluator-llm-dev"
echo ""