#!/usr/bin/env bash

## This script copies the build ARK SDK file into the current service directory
## so it can be used a dependency

set -euo pipefail

rm -rf out
mkdir -p out
cp ../../out/ark-sdk/py-sdk/dist/ark_sdk-*.whl out/

sed -i.bak 's|path = "../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl"|path = "./out/ark_sdk-$(cat ../../version.txt)-py3-none-any.whl"|' pyproject.toml && \
uv remove ark_sdk || true && \
uv add ./out/ark_sdk-$(cat ../../version.txt)-py3-none-any.whl && \
rm -f uv.lock && uv sync
