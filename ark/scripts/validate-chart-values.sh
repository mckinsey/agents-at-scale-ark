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

# expect_no_arg <name> <unexpected-substr> <set-args...>
expect_no_arg() {
    local name="$1"
    local unexpected="$2"
    shift 2
    local output
    if ! output=$(render "$@" 2>&1); then
        echo -e "${RED}FAIL${NC} $name"
        echo -e "${YELLOW}  helm template failed:${NC}"
        echo "$output" | sed 's/^/    /'
        FAILED=$((FAILED + 1))
        return 0
    fi
    if echo "$output" | grep -qF -- "$unexpected"; then
        echo -e "${RED}FAIL${NC} $name"
        echo -e "${YELLOW}  did not expect to find:${NC} $unexpected"
        FAILED=$((FAILED + 1))
    else
        echo -e "${GREEN}OK${NC}   $name (absent: $unexpected)"
    fi
    return 0
}

# The Prometheus Operator CRDs gate the ServiceMonitor; render with them present
# so the capability check passes, otherwise the ServiceMonitor never renders.
PROM_CAP="monitoring.coreos.com/v1"

# render_chart <set-args...> -> whole chart with the Prometheus capability present
render_chart() {
    helm template test-release "$CHART_DIR" --api-versions "$PROM_CAP" "$@"
}

# service_monitor <set-args...> -> just the ServiceMonitor document (empty if none)
service_monitor() {
    render_chart "$@" | awk '/kind: ServiceMonitor/,/matchLabels:/'
}

# check_contains <name> <substr> <output>
# Uses a here-string, not a pipe: under `set -o pipefail`, `printf ... | grep -q`
# reports failure on large inputs because grep short-circuits and SIGPIPEs printf.
check_contains() {
    if grep -qF -- "$2" <<<"$3"; then
        echo -e "${GREEN}OK${NC}   $1 (found: $2)"
    else
        echo -e "${RED}FAIL${NC} $1"
        echo -e "${YELLOW}  expected to find:${NC} $2"
        FAILED=$((FAILED + 1))
    fi
}

# check_absent <name> <substr> <output>
check_absent() {
    if grep -qF -- "$2" <<<"$3"; then
        echo -e "${RED}FAIL${NC} $1"
        echo -e "${YELLOW}  did not expect to find:${NC} $2"
        FAILED=$((FAILED + 1))
    else
        echo -e "${GREEN}OK${NC}   $1 (absent: $2)"
    fi
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

# Metrics serving cert: wired only when metrics + cert-manager are both enabled,
# so the ServiceMonitor can verify the endpoint's TLS instead of hitting a
# self-signed localhost cert (see issue #2597). Must be absent without
# cert-manager, or the manager crashes on a missing cert path.
expect_arg "default metrics-cert-path" \
    '"--metrics-cert-path=/tmp/k8s-metrics-server/metrics-certs"'
expect_no_arg "no metrics-cert-path when certmanager disabled" \
    '--metrics-cert-path' \
    --set certmanager.enable=false

# ServiceMonitor gating: the monitor is gated only on prometheus.enable + the
# Prometheus CRDs, but its body assumes metrics.enable (for the Service it
# scrapes) and certmanager.enable (for the TLS material it verifies against).
# Guard both, so a default-on prometheus cannot emit a broken scrape target.

# Default: verifies TLS against the cert-manager-issued metrics cert.
sm_default="$(service_monitor)"
check_contains "servicemonitor renders by default"       'kind: ServiceMonitor'       "$sm_default"
check_contains "servicemonitor verifies TLS by default"  'insecureSkipVerify: false'  "$sm_default"
check_contains "servicemonitor references metrics cert"  'metrics-server-cert'        "$sm_default"

# cert-manager disabled: no metrics cert exists, so verification must be skipped
# rather than left on with no CA (which fails every scrape with x509).
sm_nocm="$(service_monitor --set certmanager.enable=false)"
check_contains "servicemonitor skips verify without certmanager" 'insecureSkipVerify: true' "$sm_nocm"
check_absent   "servicemonitor drops cert refs without certmanager" 'metrics-server-cert' "$sm_nocm"

# metrics disabled: nothing serves /metrics, so no ServiceMonitor may render.
all_nometrics="$(render_chart --set metrics.enable=false)"
check_absent "no servicemonitor when metrics disabled" 'kind: ServiceMonitor' "$all_nometrics"

echo ""
if [[ "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}All chart value checks passed${NC}"
    exit 0
fi
echo -e "${RED}$FAILED chart value check(s) failed${NC}"
exit 1
