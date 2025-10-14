#!/usr/bin/env bash
set -euo pipefail

cp ../../out/ark-sdk/py-sdk/dist/ark_sdk-*.whl .

sed -i.bak 's|path = "../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl"|path = "./ark_sdk-$(cat ../../version.txt)-py3-none-any.whl"|' pyproject.toml && \
uv remove ark_sdk || true && \
uv add ./ark_sdk-$(cat ../../version.txt)-py3-none-any.whl && \
rm -f uv.lock && uv sync
