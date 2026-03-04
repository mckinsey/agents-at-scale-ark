#!/usr/bin/env bash
set -euo pipefail

MODE="auto"
KUBECONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"
NAMESPACE="ark-benchmark"
OBJECTS="100,1000"
CONCURRENCY="10"
SCENARIOS="all"
CHART_PATH=""
IMAGE_TAG=""
OUTPUT_DIR="results"
HELM_RELEASE="ark-controller"
HELM_NAMESPACE="ark-system"
STORAGE_RELEASE="ark-storage-dev"
STORAGE_CHART_PATH=""

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Run Ark API server benchmarks against a Kubernetes cluster.

Options:
  --mode MODE           Benchmark mode: auto|etcd|postgres|both (default: auto)
                        auto    = detect current storage backend and benchmark it
                        etcd    = deploy etcd mode and benchmark
                        postgres = deploy PostgreSQL mode and benchmark
                        both    = benchmark both modes and compare
  --kubeconfig PATH     Path to kubeconfig (default: \$KUBECONFIG or ~/.kube/config)
  --namespace NS        Benchmark namespace (default: ark-benchmark)
  --objects COUNTS      Comma-separated object counts (default: 100,1000)
  --concurrency N       Worker count (default: 10)
  --scenarios WHICH     Production scenarios: all|concurrent|watch-density|mixed|saturation|none (default: all)
  --chart-path PATH     Path to ark Helm chart (default: auto-detect)
  --image-tag TAG       Controller image tag (default: auto-detect from current release)
  --output-dir DIR      Results output directory (default: results)
  -h, --help            Show this help
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --mode) MODE="$2"; shift 2 ;;
        --kubeconfig) KUBECONFIG_PATH="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        --objects) OBJECTS="$2"; shift 2 ;;
        --concurrency) CONCURRENCY="$2"; shift 2 ;;
        --scenarios) SCENARIOS="$2"; shift 2 ;;
        --chart-path) CHART_PATH="$2"; shift 2 ;;
        --image-tag) IMAGE_TAG="$2"; shift 2 ;;
        --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export KUBECONFIG="$KUBECONFIG_PATH"

log() { echo "==> $*"; }
err() { echo "ERROR: $*" >&2; exit 1; }

check_prereqs() {
    command -v kubectl >/dev/null || err "kubectl not found"
    command -v helm >/dev/null || err "helm not found"
    command -v go >/dev/null || err "go not found"
    kubectl cluster-info >/dev/null 2>&1 || err "cannot connect to cluster"
}

detect_chart_path() {
    if [[ -n "$CHART_PATH" ]]; then return; fi
    for p in "../../ark/dist/chart" "../../../ark/dist/chart"; do
        if [[ -f "$p/Chart.yaml" ]]; then
            CHART_PATH="$p"
            return
        fi
    done
    err "cannot find Helm chart. Use --chart-path"
}

detect_image_tag() {
    if [[ -n "$IMAGE_TAG" ]]; then return; fi
    IMAGE_TAG=$(helm get values "$HELM_RELEASE" -n "$HELM_NAMESPACE" -o json 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['controllerManager']['container']['image']['tag'])" 2>/dev/null || true)
    [[ -n "$IMAGE_TAG" ]] || err "cannot detect image tag. Use --image-tag"
}

detect_storage_chart_path() {
    if [[ -n "$STORAGE_CHART_PATH" ]]; then return; fi
    for p in "../../charts/ark-storage-dev" "../../../charts/ark-storage-dev"; do
        if [[ -f "$p/Chart.yaml" ]]; then
            STORAGE_CHART_PATH="$p"
            return
        fi
    done
    err "cannot find ark-storage-dev chart"
}

detect_current_mode() {
    local backend
    backend=$(helm get values "$HELM_RELEASE" -n "$HELM_NAMESPACE" -o json 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('storage',{}).get('backend','etcd'))" 2>/dev/null || echo "etcd")
    echo "$backend"
}

ensure_cert_manager() {
    if kubectl get deployment cert-manager -n cert-manager >/dev/null 2>&1; then
        kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=60s >/dev/null 2>&1
        return
    fi
    log "Installing cert-manager..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.1/cert-manager.yaml >/dev/null 2>&1
    kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=120s
    kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=120s
    kubectl wait --for=condition=Available deployment/cert-manager-cainjector -n cert-manager --timeout=120s
    sleep 5
}

ensure_postgres() {
    detect_storage_chart_path
    if helm status "$STORAGE_RELEASE" -n "$HELM_NAMESPACE" >/dev/null 2>&1; then
        return
    fi
    log "Deploying PostgreSQL..."
    helm upgrade --install "$STORAGE_RELEASE" "$STORAGE_CHART_PATH" \
        --namespace "$HELM_NAMESPACE" --create-namespace --wait --timeout=120s >/dev/null 2>&1
}

helm_common_values() {
    echo "--set controllerManager.container.image.repository=ark-controller"
    echo "--set controllerManager.container.image.tag=$IMAGE_TAG"
    echo "--set controllerManager.container.resources.requests.cpu=200m"
    echo "--set controllerManager.container.resources.requests.memory=512Mi"
    echo "--set controllerManager.container.resources.limits.cpu=2000m"
    echo "--set controllerManager.container.resources.limits.memory=4096Mi"
    echo "--set controllerManager.securityContext.runAsNonRoot=false"
    echo "--set webhook.enable=true"
}

deploy_etcd() {
    log "Deploying etcd mode..."
    detect_chart_path
    detect_image_tag
    ensure_cert_manager

    kubectl delete apiservice v1alpha1.ark.mckinsey.com v1prealpha1.ark.mckinsey.com 2>/dev/null || true

    # shellcheck disable=SC2046
    helm upgrade --install "$HELM_RELEASE" "$CHART_PATH" \
        --namespace "$HELM_NAMESPACE" --create-namespace \
        --set storage.backend=etcd \
        $(helm_common_values) \
        --wait --timeout=180s 2>&1 | grep -v "^I0" || true

    kubectl wait --for=condition=Available deployment/ark-controller -n "$HELM_NAMESPACE" --timeout=120s
    log "etcd mode ready"
}

deploy_postgres() {
    log "Deploying PostgreSQL mode..."
    detect_chart_path
    detect_image_tag
    ensure_cert_manager
    ensure_postgres

    kubectl get crd -o name 2>/dev/null | grep ark.mckinsey.com | xargs kubectl delete 2>/dev/null || true
    kubectl delete apiservice v1alpha1.ark.mckinsey.com v1prealpha1.ark.mckinsey.com 2>/dev/null || true
    sleep 2

    # shellcheck disable=SC2046
    helm upgrade --install "$HELM_RELEASE" "$CHART_PATH" \
        --namespace "$HELM_NAMESPACE" --create-namespace \
        --set storage.backend=postgresql \
        --set storage.postgresql.host=ark-storage-dev \
        --set storage.postgresql.port=5432 \
        --set storage.postgresql.database=ark \
        --set storage.postgresql.user=postgres \
        --set storage.postgresql.passwordSecretName=ark-storage-dev-password \
        $(helm_common_values) \
        --wait --timeout=180s 2>&1 | grep -v "^I0" || true

    kubectl wait --for=condition=Available apiservice/v1alpha1.ark.mckinsey.com --timeout=120s
    log "PostgreSQL mode ready"
}

setup_namespace() {
    kubectl create ns "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
}

cleanup_namespace() {
    kubectl delete queries --all -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
    kubectl delete agents --all -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
}

build_binaries() {
    if [[ ! -f apiserver-bench ]] || [[ ! -f production-bench ]]; then
        log "Building benchmark binaries..."
        go build -o apiserver-bench .
        go build -o production-bench ./cmd/production/
    fi
}

run_basic_benchmark() {
    local mode="$1"
    local objects="$2"
    local ts="$3"
    local outfile="${OUTPUT_DIR}/${ts}/${mode}-${objects}.json"
    local txtfile="${OUTPUT_DIR}/${ts}/${mode}-${objects}.txt"

    log "[$mode] Basic benchmark: ${objects} objects, ${CONCURRENCY} concurrency"
    cleanup_namespace

    local raw
    raw=$(./apiserver-bench -kubeconfig "$KUBECONFIG" -objects "$objects" \
        -concurrency "$CONCURRENCY" -namespace "$NAMESPACE" 2>&1)

    echo "$raw" > "$txtfile"

    python3 -c "
import sys
lines = sys.stdin.read()
start = lines.find('{')
if start < 0:
    sys.exit(1)
depth = 0
for i, c in enumerate(lines[start:], start):
    if c == '{': depth += 1
    elif c == '}': depth -= 1
    if depth == 0:
        print(lines[start:i+1])
        break
" <<< "$raw" > "$outfile" 2>/dev/null

    if [[ ! -s "$outfile" ]]; then
        echo "{}" > "$outfile"
    fi

    grep -E "^(===|Count|Duration|Throughput|Latency|Errors|Running)" <<< "$raw" || true
    log "[$mode] Results saved to $outfile"
}

run_production_benchmark() {
    local mode="$1"
    local ts="$2"

    if [[ "$SCENARIOS" == "none" ]]; then return; fi

    log "[$mode] Production benchmark: scenarios=$SCENARIOS"
    cleanup_namespace

    local outfile="${OUTPUT_DIR}/${ts}/${mode}-production.txt"
    ./production-bench -kubeconfig "$KUBECONFIG" -scenario "$SCENARIOS" \
        -namespace "$NAMESPACE" 2>&1 | tee "$outfile"
    log "[$mode] Production results saved to $outfile"
}

run_benchmarks_for_mode() {
    local mode="$1"
    local ts="$2"

    setup_namespace

    IFS=',' read -ra counts <<< "$OBJECTS"
    for count in "${counts[@]}"; do
        run_basic_benchmark "$mode" "$count" "$ts"
    done

    run_production_benchmark "$mode" "$ts"
    cleanup_namespace
}

print_comparison() {
    local ts="$1"
    local dir="${OUTPUT_DIR}/${ts}"

    log "Comparison Summary"
    echo ""
    echo "================================================"
    echo "  Ark API Server Benchmark Comparison"
    echo "  $(date -Iseconds)"
    echo "================================================"
    echo ""

    python3 - "$dir" <<'PYEOF'
import json, sys, os, glob

d = sys.argv[1]
modes = {}
for f in sorted(glob.glob(os.path.join(d, "*.json"))):
    name = os.path.basename(f).replace(".json", "")
    parts = name.split("-")
    mode = parts[0]
    objects = parts[1]
    with open(f) as fh:
        data = json.load(fh)
    modes.setdefault(mode, {})[objects] = data

if len(modes) < 2:
    print("Only one mode found, skipping comparison.")
    sys.exit(0)

all_objects = sorted(set(k for m in modes.values() for k in m.keys()), key=int)
ops = ["create", "get", "list", "delete"]

header = f"{'Operation':<12} {'Objects':>8}"
for mode in sorted(modes.keys()):
    header += f"  {'Throughput':>12} {'P50':>10} {'P99':>10}"
print(header)
divider = f"{'─'*12} {'─'*8}"
for _ in sorted(modes.keys()):
    divider += f"  {'─'*12} {'─'*10} {'─'*10}"
print(divider)

for obj in all_objects:
    for op in ops:
        row = f"{op:<12} {obj:>8}"
        for mode in sorted(modes.keys()):
            data = modes.get(mode, {}).get(obj)
            if not data:
                row += f"  {'N/A':>12} {'N/A':>10} {'N/A':>10}"
                continue
            results = data.get("results", [])
            match = [r for r in results if r["operation"] == op]
            if not match:
                row += f"  {'N/A':>12} {'N/A':>10} {'N/A':>10}"
                continue
            r = match[0]
            tp = r["throughput_per_sec"]
            p50 = r["latency_p50_ns"] / 1e6
            p99 = r["latency_p99_ns"] / 1e6
            row += f"  {tp:>9.1f}/s {p50:>7.1f}ms {p99:>7.1f}ms"
        print(row)
    print()

mode_names = sorted(modes.keys())
print(f"\nColumns: {', '.join(f'{m} (Throughput | P50 | P99)' for m in mode_names)}")
PYEOF

    echo ""
    echo "Full results: $dir/"
}

main() {
    check_prereqs
    build_binaries

    local ts
    ts=$(date +%Y%m%d-%H%M%S)
    mkdir -p "${OUTPUT_DIR}/${ts}"

    case "$MODE" in
        auto)
            local current
            current=$(detect_current_mode)
            log "Detected storage backend: $current"
            run_benchmarks_for_mode "$current" "$ts"
            ;;
        etcd)
            deploy_etcd
            run_benchmarks_for_mode "etcd" "$ts"
            ;;
        postgres)
            deploy_postgres
            run_benchmarks_for_mode "postgres" "$ts"
            ;;
        both)
            deploy_etcd
            run_benchmarks_for_mode "etcd" "$ts"
            deploy_postgres
            run_benchmarks_for_mode "postgres" "$ts"
            print_comparison "$ts"
            ;;
        *)
            err "Unknown mode: $MODE"
            ;;
    esac

    log "Done. Results in ${OUTPUT_DIR}/${ts}/"
}

main
