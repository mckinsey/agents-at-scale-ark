#!/usr/bin/env bash
# Regenerate the Python ateapi gRPC stubs from the pinned Substrate protobuf.
#
# The proto ships inside the agent-substrate/substrate Go module; we read it from the Go
# module cache so the version matches what the cluster runs. Bump SUBSTRATE_VERSION to the
# tag Ark builds against, then re-run. Requires: grpcio-tools, a populated Go module cache.
set -euo pipefail

SUBSTRATE_VERSION="${SUBSTRATE_VERSION:-v0.4.1-0.20261009152331-f6a1dc72a35d}"
GOMODCACHE="$(go env GOMODCACHE 2>/dev/null || echo "$HOME/go/pkg/mod")"
PROTO_DIR="$GOMODCACHE/github.com/agent-substrate/substrate@${SUBSTRATE_VERSION}/pkg/proto/ateapipb"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$HERE/src/ark_substrate_executor/ateapi_gen"

if [[ ! -f "$PROTO_DIR/ateapi.proto" ]]; then
  echo "ateapi.proto not found at $PROTO_DIR" >&2
  echo "Run 'go mod download github.com/agent-substrate/substrate@${SUBSTRATE_VERSION}' first." >&2
  exit 1
fi

mkdir -p "$OUT"
python3 -m grpc_tools.protoc -I "$PROTO_DIR" \
  --python_out="$OUT" --grpc_python_out="$OUT" ateapi.proto

# The grpc stub emits a flat `import ateapi_pb2`; make it package-relative.
sed -i '' 's/^import ateapi_pb2 as ateapi__pb2/from . import ateapi_pb2 as ateapi__pb2/' \
  "$OUT/ateapi_pb2_grpc.py" 2>/dev/null || \
  sed -i 's/^import ateapi_pb2 as ateapi__pb2/from . import ateapi_pb2 as ateapi__pb2/' \
  "$OUT/ateapi_pb2_grpc.py"

printf '"""Generated gRPC stubs for Substrate ateapi (do not edit; see scripts/gen_ateapi.sh)."""\n' \
  > "$OUT/__init__.py"
echo "Generated stubs in $OUT"
