#!/bin/bash
#
# smoke-inline-runners.sh
# Runs a real script through each inline runner image under the pod security
# and resource settings the controller uses: non-root, read-only root
# filesystem, dropped capabilities, no network, 500m CPU and 256Mi.
#
# Usage: scripts/smoke-inline-runners.sh [language ...]   (default: all)
#

set -euo pipefail

CONTAINER_TOOL=${CONTAINER_TOOL:-docker}
IMAGE_PREFIX=${INLINE_RUNNER_IMAGE:-ark-inline-runner}
IMAGE_TAG=${INLINE_RUNNER_IMAGE_TAG:-latest}
# Matches the runner's mount path and the controller's naming.
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/inline-runner-smoke.XXXXXX")
trap 'rm -rf "$WORKDIR"' EXIT

LANGUAGES=("$@")
if [ ${#LANGUAGES[@]} -eq 0 ]; then
  LANGUAGES=(bash python node ts)
fi

# image_for maps a language to its image target: ts runs on the node image,
# because Node strips the types itself.
image_for() {
  case "$1" in
    ts) echo node ;;
    *) echo "$1" ;;
  esac
}

filename_for() {
  case "$1" in
    bash) echo source.sh ;;
    python) echo source.py ;;
    node) echo source.js ;;
    ts) echo source.ts ;;
  esac
}

# Each sample echoes its language plus the argument value, so the check proves
# both that the right interpreter ran and that the JSON argument arrived intact.
write_source() {
  local language=$1 path=$2
  case "$language" in
    bash)
      cat >"$path" <<'EOF'
set -euo pipefail
printf 'bash %s' "$(printf '%s' "$1" | jq -r '.value')"
EOF
      ;;
    python)
      cat >"$path" <<'EOF'
import json
import sys

print("python", json.loads(sys.argv[1])["value"], end="")
EOF
      ;;
    node)
      cat >"$path" <<'EOF'
process.stdout.write(`node ${JSON.parse(process.argv[2]).value}`);
EOF
      ;;
    ts)
      # Deliberately typed: erasable TypeScript syntax has to survive.
      cat >"$path" <<'EOF'
interface Args {
  value: string;
}
const args = JSON.parse(process.argv[2]) as Args;
const label = (v: string): string => `ts ${v}`;
process.stdout.write(label(args.value));
EOF
      ;;
  esac
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

failures=0
for language in "${LANGUAGES[@]}"; do
  target=$(image_for "$language")
  image="${IMAGE_PREFIX}-${target}:${IMAGE_TAG}"
  echo "==> $language (image $image)"

  "$CONTAINER_TOOL" build --target "$target" -t "$image" -f Dockerfile.inlinerunner . >/dev/null

  tooldir="$WORKDIR/$language"
  mkdir -p "$tooldir"
  source_path="$tooldir/$(filename_for "$language")"
  write_source "$language" "$source_path"
  hash=$(sha256 "$source_path")

  container="inline-runner-smoke-$language-$$"
  # The security and resource settings here mirror the controller's pod
  # template. A sample that only passes with them relaxed is a failure.
  "$CONTAINER_TOOL" run -d --name "$container" \
    --user 65532:65532 \
    --read-only \
    --tmpfs /tmp:size=16m \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --network none \
    --cpus 0.5 \
    --memory 256m \
    -v "$tooldir:/tool:ro" \
    -e ARK_INLINE_TOOL_NAME=smoke \
    -e "ARK_INLINE_LANGUAGE=$language" \
    -e "ARK_INLINE_SOURCE_HASH=$hash" \
    "$image" >/dev/null

  # No network: exec curl inside is not available either, so the call is made
  # from a throwaway container sharing this one's network namespace.
  request='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"smoke","arguments":{"value":"héllo 🙂"}}}'
  output=""
  for _ in $(seq 1 30); do
    if output=$("$CONTAINER_TOOL" run --rm --network "container:$container" curlimages/curl:latest \
      -sS -X POST "http://127.0.0.1:8080/mcp" \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -d "$request" 2>/dev/null); then
      [ -n "$output" ] && break
    fi
    sleep 1
  done

  if echo "$output" | grep -q "$language héllo 🙂"; then
    echo "    ok: $language returned the expected text"
  else
    echo "    FAIL: $language returned: ${output:-<no response>}"
    "$CONTAINER_TOOL" logs "$container" 2>&1 | tail -20
    failures=$((failures + 1))
  fi

  "$CONTAINER_TOOL" rm -f "$container" >/dev/null 2>&1 || true
done

if [ "$failures" -ne 0 ]; then
  echo "$failures runner image(s) failed"
  exit 1
fi
echo "all runner images passed"
