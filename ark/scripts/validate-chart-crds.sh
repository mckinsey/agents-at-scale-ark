#!/bin/bash
#
# validate-chart-crds.sh
# Validates that CRDs in the Helm chart match the source CRDs in config/crd/bases/
#

set -euo pipefail

# Enable verbose mode in CI for debugging
if [ "${CI:-false}" = "true" ]; then
    set -x
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHART_DIR="$ARK_DIR/dist/chart"
SOURCE_CRD_DIR="$ARK_DIR/config/crd/bases"
TEMP_DIR=$(mktemp -d)

# Cleanup function
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Validating Helm chart CRDs match source CRDs..."

# Check if helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${RED}Error: helm is not installed${NC}"
    echo "Please install helm: https://helm.sh/docs/intro/install/"
    exit 1
fi

# Show helm version for debugging
echo "Using helm version: $(helm version --short 2>/dev/null || echo 'unknown')"

# Check if directories exist
if [ ! -d "$CHART_DIR" ]; then
    echo -e "${RED}Error: Chart directory not found: $CHART_DIR${NC}"
    exit 1
fi

if [ ! -d "$SOURCE_CRD_DIR" ]; then
    echo -e "${RED}Error: Source CRD directory not found: $SOURCE_CRD_DIR${NC}"
    exit 1
fi

# Get list of CRD files in the chart
CRD_FILES=$(find "$CHART_DIR/templates/crd" -name "*.yaml" -type f | sort)

if [ -z "$CRD_FILES" ]; then
    echo -e "${RED}Error: No CRD files found in $CHART_DIR/templates/crd${NC}"
    exit 1
fi

FAILED_FILES=()
VERIFIED_COUNT=0

for CHART_CRD_FILE in $CRD_FILES; do
    CRD_NAME=$(basename "$CHART_CRD_FILE")
    SOURCE_CRD_FILE="$SOURCE_CRD_DIR/$CRD_NAME"
    
    echo -n "Checking $CRD_NAME... "
    
    # Check if corresponding source file exists
    if [ ! -f "$SOURCE_CRD_FILE" ]; then
        echo -e "${YELLOW}SKIP (source not found)${NC}"
        continue
    fi
    
    # Render the Helm chart CRD with dummy values
    RENDERED_FILE="$TEMP_DIR/$CRD_NAME"
    # Use relative path from chart root for --show-only
    CRD_REL_PATH="${CHART_CRD_FILE#$CHART_DIR/}"
    HELM_ERROR=$(helm template test-release "$CHART_DIR" \
        --set crd.enable=true \
        --set crd.keep=false \
        --show-only "$CRD_REL_PATH" \
        2>&1 > "$RENDERED_FILE")
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}FAIL (helm template failed)${NC}"
        echo -e "${YELLOW}Helm error: $HELM_ERROR${NC}"
        FAILED_FILES+=("$CRD_NAME (template failed)")
        continue
    fi
    
    # Strip Helm-specific additions from the rendered CRD
    # The rendered file has Helm labels added, we need to remove them
    STRIPPED_RENDERED="$TEMP_DIR/${CRD_NAME}.stripped"
    
    # Use a combination of sed and awk to clean up the file
    # 1. Remove Helm source comment lines
    # 2. Remove the labels section (lines with "  labels:" and all following indented lines until next metadata property)
    # 3. Keep only the controller-gen annotation
    set +e  # Temporarily disable exit on error for this pipeline
    grep -v "^# Source:" "$RENDERED_FILE" | \
    awk '
    BEGIN { skip_labels = 0 }
    
    # Detect start of labels section
    /^  labels:$/ {
        skip_labels = 1
        next
    }
    
    # Stop skipping when we hit the next metadata property (annotations: or name:)
    skip_labels && (/^  annotations:$/ || /^  name:/) {
        skip_labels = 0
    }
    
    # Skip lines in the labels section
    skip_labels && /^    / {
        next
    }
    
    # We exited labels section at a non-indented line
    skip_labels {
        skip_labels = 0
    }
    
    # Print all non-skipped lines
    {
        print
    }
    ' | \
    sed '/"helm.sh\/resource-policy": keep/d' > "$STRIPPED_RENDERED"
    STRIP_EXIT_CODE=$?
    set -e  # Re-enable exit on error
    
    if [ $STRIP_EXIT_CODE -ne 0 ]; then
        echo -e "${RED}FAIL (stripping failed)${NC}"
        FAILED_FILES+=("$CRD_NAME (strip failed)")
        continue
    fi
    
    # Remove the --- separator from both files if present
    # Strip --- from rendered file
    sed '/^---$/d' "$STRIPPED_RENDERED" > "$STRIPPED_RENDERED.tmp" && mv "$STRIPPED_RENDERED.tmp" "$STRIPPED_RENDERED"
    
    # Normalize source file (remove leading --- separator and normalize whitespace)
    STRIPPED_SOURCE="$TEMP_DIR/${CRD_NAME}.source"
    sed '/^---$/d' "$SOURCE_CRD_FILE" > "$STRIPPED_SOURCE" 2>/dev/null
    
    # Compare the stripped files (ignore whitespace-only differences)
    if diff -q -b -B "$STRIPPED_SOURCE" "$STRIPPED_RENDERED" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        ((VERIFIED_COUNT++))
    else
        echo -e "${RED}FAIL (content differs)${NC}"
        FAILED_FILES+=("$CRD_NAME")
        
        # Show a summary of differences
        echo -e "  ${YELLOW}Differences:${NC}"
        diff -u -b -B "$STRIPPED_SOURCE" "$STRIPPED_RENDERED" | head -20 || true
    fi
done

# Report results
echo ""
echo "Summary:"
echo "  Verified: $VERIFIED_COUNT"

if [ ${#FAILED_FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}All CRDs are in sync!${NC}"
    exit 0
else
    echo -e "${RED}Failed CRDs:${NC}"
    for file in "${FAILED_FILES[@]}"; do
        echo -e "  ${RED}✗${NC} $file"
    done
    echo ""
    echo -e "${RED}Error: CRDs in Helm chart are out of sync with source CRDs${NC}"
    echo -e "${YELLOW}Update the files in dist/chart/templates/crd/ to match config/crd/bases/${NC}"
    exit 1
fi

