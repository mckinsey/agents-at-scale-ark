#!/usr/bin/env bash

## This script copies the build ARK SDK file into the current service directory
## so it can be used a dependency

set -euo pipefail

# Get PEP 440 normalized version for wheel filename (e.g., 0.1.58-rc -> 0.1.58rc0)
PEP440_VERSION=$(python3 -c "from packaging.version import Version; print(Version('$(cat ../../version.txt)'))")
WHEEL_NAME="ark_sdk-${PEP440_VERSION}-py3-none-any.whl"

rm -rf ark-mcp/out
mkdir -p ark-mcp/out
cp ../../out/ark-sdk/py-sdk/dist/ark_sdk-*.whl ark-mcp/out/

cd ark-mcp
sed -i.bak "s|path = \"../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl\"|path = \"./out/${WHEEL_NAME}\"|" pyproject.toml && \
uv remove ark_sdk || true && \
uv add "./out/${WHEEL_NAME}" && \
rm -f uv.lock && uv sync
cd ../