#!/bin/bash
set -e

# Ensure ARK SDK wheel exists before DevSpace sync

if [ "$(git rev-parse --show-toplevel)" != "$(pwd)" ] || ! git remote get-url origin | grep -q "mckinsey/agents-at-scale-ark"; then
    echo "Error: Must run from ARK repository root"
    exit 1
fi

if [ ! -f services/ark-api/out/ark_sdk-*.whl ]; then
    echo "Building ARK SDK wheel..."
    make ark-sdk-build
    mkdir -p services/ark-api/out
    cp out/ark-sdk/py-sdk/dist/ark_sdk-*.whl services/ark-api/out/
    echo "ARK SDK wheel ready"
else
    echo "ARK SDK wheel exists"
fi