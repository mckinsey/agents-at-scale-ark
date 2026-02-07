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
    crd_name=$(grep "^  name:" "$crd" | head -1 | awk '{print $2}')
    spec_start=$(grep -n "^spec:" "$crd" | head -1 | cut -d: -f1)

    if [ -f "$helm_crd" ] && head -1 "$helm_crd" | grep -q '{{-'; then
        header_end=$(grep -n "^  name:" "$helm_crd" | head -1 | cut -d: -f1)
        {
            head -n "$header_end" "$helm_crd"
            tail -n +"$spec_start" "$crd"
            echo '{{- end }}'
        } > "$helm_crd.tmp"
    else
        {
            echo '{{- if .Values.crd.enable }}'
            echo '---'
            echo 'apiVersion: apiextensions.k8s.io/v1'
            echo 'kind: CustomResourceDefinition'
            echo 'metadata:'
            echo '  labels:'
            echo '    {{- include "chart.labels" . | nindent 4 }}'
            echo '  annotations:'
            echo '    {{- if .Values.crd.keep }}'
            echo '    "helm.sh/resource-policy": keep'
            echo '    {{- end }}'
            echo "    controller-gen.kubebuilder.io/version: v0.18.0"
            echo "  name: ${crd_name}"
            tail -n +"$spec_start" "$crd"
            echo '{{- end }}'
        } > "$helm_crd.tmp"
    fi

    mv "$helm_crd.tmp" "$helm_crd"
done

echo "CRDs synced to Helm chart"
