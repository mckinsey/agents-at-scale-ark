#!/usr/bin/env bash
# Publish one copy of the fixture chart per variant to an OCI registry, as
# oci://<registry>/charts/fixture-<variant>:0.1.0, and print each digest.
#
# Usage: package.sh <registry host:port> [variant ...]
# With no variants, publishes all of them. Pushes with --plain-http, for a
# local registry:2.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
registry=${1:?usage: package.sh <registry host:port> [variant ...]}
shift
variants=("$@")
if [ ${#variants[@]} -eq 0 ]; then
  variants=(ok slow fail hook conflict cluster crd skiplabel rbac rbac-installer-sa nosc reserved-secret personal-ref ark)
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
for v in "${variants[@]}"; do
  chart="$work/fixture-$v"
  cp -R "$here/mkt-fixture" "$chart"
  sed -e "s/^name: mkt-fixture/name: fixture-$v/" \
      -e "s/marketplace-item-name: mkt-fixture/marketplace-item-name: fixture-$v/" \
      "$here/mkt-fixture/Chart.yaml" > "$chart/Chart.yaml"
  sed -e "s/^variant: ok$/variant: $v/" "$here/mkt-fixture/values.yaml" > "$chart/values.yaml"
  helm package "$chart" -d "$work" >/dev/null
  helm push "$work/fixture-$v-0.1.0.tgz" "oci://$registry/charts" --plain-http 2>&1 \
    | sed -n "s/^Digest: /fixture-$v /p"
done
