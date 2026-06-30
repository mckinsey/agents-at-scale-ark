#!/bin/bash
#
# validate-chart-values.sh
# Validates that key values in dist/chart/values.yaml render into the
# manager Deployment as expected. 
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHART_DIR="$ARK_DIR/dist/chart"
MANAGER_TEMPLATE="templates/manager/manager.yaml"

FAILED=0

# render <set-args...> -> stdout (just the manager Deployment)
render() {
    helm template test-release "$CHART_DIR" \
        --show-only "$MANAGER_TEMPLATE" \
        "$@"
    return $?
}

# expect_arg <name> <expected-arg> <set-args...>
expect_arg() {
    local name="$1"
    local expected="$2"
    shift 2
    local output
    if ! output=$(render "$@" 2>&1); then
        echo -e "${RED}FAIL${NC} $name"
        echo -e "${YELLOW}  helm template failed:${NC}"
        echo "$output" | sed 's/^/    /'
        FAILED=$((FAILED + 1))
        return 0
    fi
    if echo "$output" | grep -qF -- "$expected"; then
        echo -e "${GREEN}OK${NC}   $name (found: $expected)"
    else
        echo -e "${RED}FAIL${NC} $name"
        echo -e "${YELLOW}  expected to find:${NC} $expected"
        echo -e "${YELLOW}  rendered args:${NC}"
        echo "$output" | grep -E -- '--max-concurrent-(queries|reconciles)=' | sed 's/^/    /' || true
        FAILED=$((FAILED + 1))
    fi
    return 0
}

echo "Validating chart value rendering for $MANAGER_TEMPLATE..."

# Defaults from values.yaml.
expect_arg "default maxConcurrentQueries"     '"--max-concurrent-queries=32"'
expect_arg "default maxConcurrentReconciles"  '"--max-concurrent-reconciles=4"'

# Explicit non-zero overrides.
expect_arg "override maxConcurrentQueries=64" \
    '"--max-concurrent-queries=64"' \
    --set controllerManager.maxConcurrentQueries=64
expect_arg "override maxConcurrentReconciles=8" \
    '"--max-concurrent-reconciles=8"' \
    --set controllerManager.maxConcurrentReconciles=8

# Zero must flow through (regression guard against Sprig `default` swallowing 0).
expect_arg "override maxConcurrentQueries=0" \
    '"--max-concurrent-queries=0"' \
    --set controllerManager.maxConcurrentQueries=0
expect_arg "override maxConcurrentReconciles=0" \
    '"--max-concurrent-reconciles=0"' \
    --set controllerManager.maxConcurrentReconciles=0

echo ""
if [[ "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}All chart value checks passed${NC}"
    exit 0
fi
echo -e "${RED}$FAILED chart value check(s) failed${NC}"
exit 1
