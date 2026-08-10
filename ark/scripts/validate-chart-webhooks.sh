#!/bin/bash
#
# validate-chart-webhooks.sh
# Validates that all webhooks in config/webhook/manifests.yaml exist in
# dist/chart/templates/webhook/webhooks.yaml with matchConditions present.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_WEBHOOKS="$ARK_DIR/config/webhook/manifests.yaml"
CHART_WEBHOOKS="$ARK_DIR/dist/chart/templates/webhook/webhooks.yaml"

echo "Validating Helm chart webhooks match source webhooks..."

if [ ! -f "$SOURCE_WEBHOOKS" ]; then
    echo -e "${RED}Error: Source webhooks file not found: $SOURCE_WEBHOOKS${NC}"
    exit 1
fi

if [ ! -f "$CHART_WEBHOOKS" ]; then
    echo -e "${RED}Error: Chart webhooks file not found: $CHART_WEBHOOKS${NC}"
    exit 1
fi

SOURCE_NAMES=$(grep -E 'name: .*\.kb\.io' "$SOURCE_WEBHOOKS" | awk '{print $2}')

if [ -z "$SOURCE_NAMES" ]; then
    echo -e "${RED}Error: No webhook names found in $SOURCE_WEBHOOKS${NC}"
    exit 1
fi

FAILED=()
VERIFIED=0

for name in $SOURCE_NAMES; do
    echo -n "Checking $name... "

    if ! grep -q "name: $name" "$CHART_WEBHOOKS"; then
        echo -e "${RED}FAIL (not found in Helm chart)${NC}"
        FAILED+=("$name (missing from Helm chart)")
        continue
    fi

    if grep -A8 "name: $name" "$CHART_WEBHOOKS" | grep -q "matchConditions"; then
        echo -e "${GREEN}OK${NC}"
        VERIFIED=$((VERIFIED + 1))
    else
        echo -e "${RED}FAIL (matchConditions missing)${NC}"
        FAILED+=("$name (matchConditions missing in Helm chart)")
    fi
done

echo ""
echo "Summary:"
echo "  Verified: $VERIFIED"

if [ ${#FAILED[@]} -eq 0 ]; then
    echo -e "${GREEN}All webhooks are in sync!${NC}"
    exit 0
else
    echo -e "${RED}Failed webhooks:${NC}"
    for f in "${FAILED[@]}"; do
        echo -e "  ${RED}✗${NC} $f"
    done
    echo ""
    echo -e "${RED}Error: Helm chart webhooks are out of sync with source webhooks${NC}"
    echo -e "${YELLOW}Update dist/chart/templates/webhook/webhooks.yaml to match config/webhook/manifests.yaml${NC}"
    exit 1
fi
