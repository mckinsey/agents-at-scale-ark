#!/bin/bash
set -e

# Ensure ARK SDK wheel exists before DevSpace sync
# This file is run from services/ark-api
cd ../..

# Check we're at repo root and it's the agents-at-scale-ark repo (allow forks)
if [ "$(git rev-parse --show-toplevel)" != "$(pwd)" ] || ! git remote get-url origin | grep -q "agents-at-scale-ark"; then
    echo "Error: Must run from ARK repository root"
    exit 1
fi

echo "Building ARK SDK wheel..."

make ark-sdk-build
rm -rf services/ark-api/out
rm -rf services/ark-api/ark-api/out
mkdir -p services/ark-api/out services/ark-api/ark-api/out
cp out/ark-sdk/py-sdk/dist/ark_sdk-*.whl services/ark-api/out/
cp out/ark-sdk/py-sdk/dist/ark_sdk-*.whl services/ark-api/ark-api/out/
echo "ARK SDK wheel ready"