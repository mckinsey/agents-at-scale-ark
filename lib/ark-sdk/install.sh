#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="../../out/ark-sdk"
PY_SDK_DIR="$OUT_DIR/py-sdk"
OPENAPI_FILE="$OUT_DIR/openapi.yaml"

OVERLAY_DIR="./gen_sdk/overlay/python"

CRD_GLOBS=(
  "../../ark/config/crd/bases/*.yaml"
  "../../ark/config/crd/bases/*.yml"
  "../../ark/crds/*.yaml"
  "../../ark/crds/*.yml"
  "../../services/**/crd/*.yaml"
  "../../services/**/crd/*.yml"
)

if [ -e $OUT_DIR/py-sdk/dist/ark_sdk-$(cat ../../version.txt)-py3-none-any.whl ]; then
  echo ">> ARK SDK Already built - skipping"
  exit 0
fi

mkdir -p "$PY_SDK_DIR"
mkdir -p "$(dirname "$OPENAPI_FILE")"

CRD_FILES=()
for g in "${CRD_GLOBS[@]}"; do
  for f in $g; do
    if [[ -f "$f" ]]; then
      CRD_FILES+=("$f")
    fi
  done
done

if [[ ${#CRD_FILES[@]} -eq 0 ]]; then
  echo "No CRD files found"
  exit 1
fi

uv run python crd_to_openapi.py "${CRD_FILES[@]}" > "$OPENAPI_FILE"

npx --yes @openapitools/openapi-generator-cli generate \
  -i "$OPENAPI_FILE" \
  -g python \
  -o "$PY_SDK_DIR" \
  --package-name ark_sdk

if [[ -d "$OVERLAY_DIR" ]]; then
  tar -C "$OVERLAY_DIR" -cf - . | tar -C "$PY_SDK_DIR" -xf -
else
  echo "Overlay directory not found: $OVERLAY_DIR - skipping"
fi

uv run python generate_ark_clients.py -v "$OPENAPI_FILE" \
  > "$PY_SDK_DIR/ark_sdk/versions.py"

mkdir -p "$PY_SDK_DIR/test"
uv run python generate_ark_clients.py -t "$OPENAPI_FILE" \
  > "$PY_SDK_DIR/test/test_ark_client.py"

uv sync

pushd "$PY_SDK_DIR" >/dev/null

rm -f setup.py setup.cfg

uv run python -m build .
popd >/dev/null
