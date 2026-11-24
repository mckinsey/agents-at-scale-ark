#!/usr/bin/env bash
# Stamp a release version across every version-carrying file, replicating what
# release-please would write. Used by the custom release flow:
#   - prepare-release.yaml: stamp main (RC -> stable) for the "release:" PR
#   - deploy.yml: stamp an RC checkout so artifacts build as the stable version
#
# Usage: scripts/stamp-version.sh <target-version>   e.g. 0.1.67
#
# It replaces the CURRENT version (read from version.txt, which holds the RC
# version during a cycle, e.g. 0.1.67.2) with <target-version> across all
# tracked files that contain it, then handles the two files that do not:
#   - docs/content/operations-guide/build-pipelines.mdx  (stable-only extra-file;
#     holds the PREVIOUS stable version, stamped via its "current:" marker line)
#   - .github/release-please-manifest.json               (authoritative source)
# ark/version.txt is intentionally left untouched to match release-please, which
# does not stamp it. Uses perl for portable, injection-safe in-place edits.
set -euo pipefail

TARGET="${1:?usage: stamp-version.sh <target-version>}"
MDX="docs/content/operations-guide/build-pipelines.mdx"
MANIFEST=".github/release-please-manifest.json"

CURRENT="$(tr -d '[:space:]' < version.txt)"

if [ "$CURRENT" != "$TARGET" ]; then
  # Fixed-string find, then a \Q..\E (quoted) replace across every tracked file
  # holding the current version (except the mdx, handled separately below, and
  # the changelog, whose historical version headers are owned by release-please).
  git grep -lF "$CURRENT" -- . ":(exclude)${MDX}" ":(exclude).github/CHANGELOG.md" | while IFS= read -r f; do
    CUR="$CURRENT" TGT="$TARGET" perl -i -pe 's/\Q$ENV{CUR}\E/$ENV{TGT}/g' "$f"
  done
fi

# Stable-config-only doc: stamp the version on its x-release-please-version marker,
# regardless of which previous version it currently holds.
if [ -f "$MDX" ]; then
  TGT="$TARGET" perl -i -pe 's/(current: )\d+\.\d+\.\d+(-rc\.\d+)?/$1$ENV{TGT}/' "$MDX"
fi

# Authoritative manifest.
python3 - "$TARGET" "$MANIFEST" <<'PY'
import json, sys
target, path = sys.argv[1], sys.argv[2]
d = json.load(open(path))
d["."] = target
json.dump(d, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

echo "Stamped version -> ${TARGET} (from ${CURRENT})"
