#!/bin/bash
#
# validate-chart-webhooks.sh
# Validates that all webhooks in config/webhook/manifests.yaml exist in
# dist/chart/templates/webhook/webhooks.yaml with matchConditions present,
# that the two agree on the resources each webhook matches, and that every
# resource named is a real CRD plural.
#
# That last check exists because Kubernetes matches admission rules on the
# plural resource name and silently ignores a rule that matches nothing. A
# webhook registered against the singular name is not an error at apply
# time — it simply never fires, and failurePolicy does not save it, because
# nothing matched to fail. The only symptom is validation quietly not
# running.
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

# Plural names of every CRD, taken from the generated filenames
# (ark.mckinsey.com_mcpservers.yaml -> mcpservers). These are the only
# strings an admission rule can match on.
CRD_PLURALS=$(find "$ARK_DIR/config/crd/bases" -name '*.yaml' -exec basename {} .yaml \; | sed 's/.*_//' | sort -u)

# resources_for FILE WEBHOOK_NAME - the resources a webhook matches on,
# one per line. Reads from the named webhook up to the next one.
resources_for() {
    awk -v target="$2" '
        $0 ~ "name: " target "$" { inwh = 1; next }
        inwh && /name: .*\.kb\.io/ { exit }
        inwh && /^ *resources:/    { inres = 1; next }
        inres && /^ *- /           { sub(/^ *- /, ""); print; next }
        inres                      { inres = 0 }
    ' "$1"
}

FAILED=()
VERIFIED=0

for name in $SOURCE_NAMES; do
    echo -n "Checking $name... "

    if ! grep -q "name: $name" "$CHART_WEBHOOKS"; then
        echo -e "${RED}FAIL (not found in Helm chart)${NC}"
        FAILED+=("$name (missing from Helm chart)")
        continue
    fi

    if ! grep -A8 "name: $name" "$CHART_WEBHOOKS" | grep -q "matchConditions"; then
        echo -e "${RED}FAIL (matchConditions missing)${NC}"
        FAILED+=("$name (matchConditions missing in Helm chart)")
        continue
    fi

    source_resources=$(resources_for "$SOURCE_WEBHOOKS" "$name")
    chart_resources=$(resources_for "$CHART_WEBHOOKS" "$name")

    if [ -z "$source_resources" ]; then
        echo -e "${RED}FAIL (no resources found)${NC}"
        FAILED+=("$name (no resources in $SOURCE_WEBHOOKS)")
        continue
    fi

    if [ "$source_resources" != "$chart_resources" ]; then
        echo -e "${RED}FAIL (resources differ)${NC}"
        FAILED+=("$name (resources differ: source [$(echo "$source_resources" | tr '\n' ' ')], chart [$(echo "$chart_resources" | tr '\n' ' ')])")
        continue
    fi

    unknown=""
    for resource in $source_resources; do
        # Subresource rules (pods/status) match on the parent's plural.
        if ! grep -qx "${resource%%/*}" <<< "$CRD_PLURALS"; then
            unknown="$unknown $resource"
        fi
    done

    if [ -n "$unknown" ]; then
        echo -e "${RED}FAIL (not a CRD plural:$unknown)${NC}"
        FAILED+=("$name (resource(s)$unknown are not CRD plurals - the rule will never match)")
        continue
    fi

    echo -e "${GREEN}OK${NC}"
    VERIFIED=$((VERIFIED + 1))
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
