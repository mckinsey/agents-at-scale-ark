#!/bin/bash
#
# sync-chart-crds.sh
# Syncs CRDs from config/crd/bases/ to the Helm chart in dist/chart/templates/crd/
# Preserves Helm templating in the chart CRDs while updating the spec from source.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$ARK_DIR/config/crd/bases"
CHART_DIR="$ARK_DIR/dist/chart/templates/crd"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source CRD directory not found: $SOURCE_DIR" >&2
    exit 1
fi

if [ ! -d "$CHART_DIR" ]; then
    echo "Error: Chart CRD directory not found: $CHART_DIR" >&2
    exit 1
fi

for crd in "$SOURCE_DIR"/*.yaml; do
    name=$(basename "$crd")
    helm_crd="$CHART_DIR/$name"

    if [ -f "$helm_crd" ]; then
        # Extract Helm header (up to and including "name:" line in metadata)
        header_end=$(grep -n "^  name:" "$helm_crd" | head -1 | cut -d: -f1)
        # Extract source spec (from "spec:" line onwards)
        spec_start=$(grep -n "^spec:" "$crd" | head -1 | cut -d: -f1)

        # Combine: Helm header + source spec + Helm footer
        {
            head -n "$header_end" "$helm_crd"
            tail -n +"$spec_start" "$crd"
            echo "{{- end }}"
        } > "$helm_crd.tmp"

        mv "$helm_crd.tmp" "$helm_crd"
    fi
done

echo "CRDs synced to Helm chart"
