#!/usr/bin/env bash
set -uo pipefail

NS="${NS:-default}"
IMAGE="${IMAGE:-ark-api:bench}"
DURATION="${DURATION:-10}"
CONCURRENCY="${CONCURRENCY:-1 10 50 100}"
AGENT="${AGENT:-chat-overflow-test}"
SSE_STREAMS="${SSE_STREAMS:-100}"
A2A_GETS="${A2A_GETS:-20}"
MODE="${MODE:-all}"
OUT="${OUT:-/tmp/ark-api-bench-$(date -u +%Y%m%dT%H%M%SZ)}"

BENCH=ark-api-bench
LOAD=ark-api-bench-load
PROBE=ark-api-bench-probe
URL="http://${BENCH}.${NS}.svc.cluster.local"
T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESULTS="${OUT}/results.tsv"

mkdir -p "$OUT"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "${OUT}/run.log"; }
kx() { kubectl -n "$NS" "$@"; }
load() { kx exec "$LOAD" -- "$@"; }

cleanup() {
  log "cleanup"
  kx delete deploy "$BENCH" --ignore-not-found --wait=false
  kx delete svc "$BENCH" --ignore-not-found
  kx delete pod "$LOAD" --ignore-not-found --wait=false
  kx delete query "$PROBE" --ignore-not-found
  local q
  for q in $(kx get queries -o json \
    | jq -r --arg t0 "$T0" '.items[] | select(.metadata.name | startswith("a2agw-query-")) | select(.metadata.creationTimestamp >= $t0) | .metadata.name'); do
    kx delete query "$q" --ignore-not-found
  done
  log "results in ${RESULTS}"
}
trap cleanup EXIT

bench_pods() { kx get pods -l app="$BENCH" --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}'; }

cpu_usec() {
  local total=0 pod v
  for pod in $(bench_pods); do
    v=$(kx exec "$pod" -- cat /sys/fs/cgroup/cpu.stat 2>/dev/null | awk '/^usage_usec/ {print $2}')
    total=$((total + ${v:-0}))
  done
  echo "$total"
}

mem_mib() {
  local pod v out=""
  for pod in $(bench_pods); do
    v=$(kx exec "$pod" -- cat /sys/fs/cgroup/memory.current 2>/dev/null || echo 0)
    out="${out}$((v / 1048576)) "
  done
  echo "${out% }"
}

deploy_bench() {
  log "deploying ${BENCH} (${IMAGE})"
  kx get deploy ark-api -o json | jq --arg img "$IMAGE" --arg name "$BENCH" '
    del(.status, .metadata.uid, .metadata.resourceVersion, .metadata.creationTimestamp,
        .metadata.generation, .metadata.managedFields, .metadata.annotations, .metadata.labels,
        .metadata.ownerReferences, .spec.template.metadata.annotations)
    | .metadata.name = $name
    | .metadata.labels = {app: $name}
    | .spec.replicas = 1
    | .spec.selector = {matchLabels: {app: $name}}
    | .spec.template.metadata.labels = {app: $name}
    | .spec.template.spec.securityContext = {runAsNonRoot: true, runAsUser: 1001, fsGroup: 1001, seccompProfile: {type: "RuntimeDefault"}}
    | .spec.template.spec.containers[0].securityContext = {allowPrivilegeEscalation: false, readOnlyRootFilesystem: false, capabilities: {drop: ["ALL"]}}
    | .spec.template.spec.containers[0].image = $img
    | .spec.template.spec.containers[0].imagePullPolicy = "Never"
    | .spec.template.spec.containers[0].resources = {requests: {cpu: "250m", memory: "256Mi"}, limits: {cpu: "500m", memory: "512Mi"}}
  ' | kx apply -f -
  kx create service clusterip "$BENCH" --tcp=80:8000 --dry-run=client -o json \
    | jq --arg name "$BENCH" '.spec.selector = {app: $name}' | kx apply -f -
}

set_shape() {
  local replicas=$1 cpu=$2
  log "shape: replicas=${replicas} cpu_limit=${cpu}"
  kx set resources deploy "$BENCH" --limits="cpu=${cpu},memory=512Mi" --requests="cpu=250m,memory=256Mi" >/dev/null
  kx scale deploy "$BENCH" --replicas="$replicas" >/dev/null
  kx rollout status deploy "$BENCH" --timeout=300s
  local n=0
  while [ "$(bench_pods | wc -w | tr -d ' ')" -ne "$replicas" ] && [ $n -lt 60 ]; do sleep 2; n=$((n + 1)); done
  load ab -q -n 200 -c 10 "${URL}/health" >/dev/null 2>&1
  load ab -q -n 100 -c 10 "${URL}/v1/agents" >/dev/null 2>&1
  sleep 3
}

run_ab() {
  local phase=$1 replicas=$2 cpu=$3 name=$4 conc=$5
  shift 5
  local before after out rps took complete failed non2xx p50 p95 p99 cores ms_per_req
  before=$(cpu_usec)
  out=$(load ab -r -s 60 -t "$DURATION" -n 500000 -c "$conc" "$@" 2>&1)
  after=$(cpu_usec)
  rps=$(echo "$out" | awk '/^Requests per second/ {print $4}')
  took=$(echo "$out" | awk '/^Time taken for tests/ {print $5}')
  complete=$(echo "$out" | awk '/^Complete requests/ {print $3}')
  failed=$(echo "$out" | awk '/^Failed requests/ {print $3}')
  non2xx=$(echo "$out" | awk '/^Non-2xx responses/ {print $3}')
  p50=$(echo "$out" | awk '$1=="50%" {print $2}')
  p95=$(echo "$out" | awk '$1=="95%" {print $2}')
  p99=$(echo "$out" | awk '$1=="99%" {print $2}')
  cores=$(awk -v d=$((after - before)) -v t="${took:-$DURATION}" 'BEGIN {if (t > 0) printf "%.2f", d / 1000000 / t; else print "-"}')
  ms_per_req=$(awk -v d=$((after - before)) -v n="${complete:-0}" 'BEGIN {if (n > 0) printf "%.2f", d / 1000 / n; else print "-"}')
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$phase" "$replicas" "$cpu" "$name" "$conc" "${rps:--}" "${complete:-0}" "${p50:--}" "${p95:--}" "${p99:--}" \
    "${failed:-0}" "${non2xx:-0}" "$cores" "$ms_per_req" | tee -a "$RESULTS"
  [ -n "$rps" ] || echo "$out" >> "${OUT}/ab-errors.log"
  if [ "${failed:-0}" != "0" ]; then
    printf "%s\t%s\t%s\t%s\t%s\n" "$phase" "$replicas" "$name" "$conc" \
      "$(echo "$out" | awk '/^Failed requests/ {getline; gsub(/^ +/, ""); print}')" >> "${OUT}/ab-failures.tsv"
  fi
}

run_matrix() {
  local phase=$1 replicas=$2 cpu=$3 c
  for c in $CONCURRENCY; do
    run_ab "$phase" "$replicas" "$cpu" "GET /health" "$c" "${URL}/health"
    run_ab "$phase" "$replicas" "$cpu" "GET /v1/agents" "$c" "${URL}/v1/agents"
    run_ab "$phase" "$replicas" "$cpu" "GET /v1/agents/${AGENT}" "$c" "${URL}/v1/agents/${AGENT}"
    run_ab "$phase" "$replicas" "$cpu" "POST /v1/queries (409)" "$c" -p /tmp/query.json -T application/json "${URL}/v1/queries"
  done
  log "phase ${phase} memory MiB per pod: $(mem_mib)"
}

a2a_call() {
  load wget -q -O - --header "Content-Type: application/json" --post-data "$1" "${URL}/a2a/agent/${AGENT}/" 2>&1
}

a2a_test() {
  local phase=$1 replicas=$2 task found=0 notfound=0 other=0 resp i cancel
  local send='{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"bench-'"$phase-$RANDOM"'","parts":[{"kind":"text","text":"benchmark ping"}]},"configuration":{"blocking":false}}}'
  resp=$(a2a_call "$send")
  task=$(echo "$resp" | grep -o '"id" *: *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  if [ -z "$task" ]; then
    log "A2A ${phase}: message/send returned no task id: ${resp}"
    return
  fi
  for i in $(seq "$A2A_GETS"); do
    resp=$(a2a_call '{"jsonrpc":"2.0","id":2,"method":"tasks/get","params":{"id":"'"$task"'"}}')
    if echo "$resp" | grep -q '"result"'; then found=$((found + 1))
    elif echo "$resp" | grep -q -e '-32001' -e 'Task not found'; then notfound=$((notfound + 1))
    else other=$((other + 1)); echo "$resp" >> "${OUT}/a2a-other.log"
    fi
  done
  resp=$(a2a_call '{"jsonrpc":"2.0","id":3,"method":"tasks/cancel","params":{"id":"'"$task"'"}}')
  printf "%s\t%s\t%s\n" "$phase" "$replicas" "$resp" >> "${OUT}/a2a-cancel.log"
  cancel=$(echo "$resp" | grep -o '"message" *: *"[^"]*"' | head -1 | sed 's/.*: *"\([^"]*\)"$/\1/')
  log "A2A ${phase} (${replicas} pods): tasks/get found=${found} not_found=${notfound} other=${other}; tasks/cancel error=${cancel:-none}"
  printf "%s\t%s\ta2a tasks/get\t%s\tfound=%s\tnot_found=%s\tother=%s\tcancel=%s\n" \
    "$phase" "$replicas" "$A2A_GETS" "$found" "$notfound" "$other" "${cancel:-none}" >> "${OUT}/a2a.tsv"
}

sse_test() {
  local phase=$1 replicas=$2 cpu=$3
  log "SSE ${phase}: opening ${SSE_STREAMS} broker event streams"
  local hold=$((DURATION + 30))
  load sh -c "for i in \$(seq ${SSE_STREAMS}); do timeout ${hold} wget -q -O /dev/null '${URL}/v1/broker/events?watch=true' & done; wait" >/dev/null 2>&1 &
  local sse_pid=$!
  sleep 10
  log "SSE ${phase}: memory MiB per pod with streams open: $(mem_mib)"
  run_ab "$phase" "$replicas" "$cpu" "GET /v1/agents + ${SSE_STREAMS} SSE" 10 "${URL}/v1/agents"
  wait "$sse_pid" 2>/dev/null
}

log "output: ${OUT}"
printf "phase\tpods\tcpu_limit\tendpoint\tconcurrency\trps\tcomplete\tp50_ms\tp95_ms\tp99_ms\tfailed\tnon2xx\tcpu_cores_avg\tcpu_ms_per_req\n" > "$RESULTS"
printf "phase\tpods\ttest\tcalls\tfound\tnot_found\tother\tcancel\n" > "${OUT}/a2a.tsv"

deploy_bench
log "starting load pod"
kx run "$LOAD" --image=httpd:2.4-alpine --restart=Never --command -- sleep 7200 >/dev/null
kx wait pod "$LOAD" --for=condition=Ready --timeout=180s
load sh -c "printf '%s' '{\"name\":\"${PROBE}\",\"input\":\"benchmark probe\",\"target\":{\"type\":\"agent\",\"name\":\"${AGENT}\"}}' > /tmp/query.json"

if [ "$MODE" = "a2a" ]; then
  set_shape 1 500m
  a2a_test A1 1
  set_shape 2 500m
  a2a_test A2 2
  set_shape 3 500m
  a2a_test A3 3
  log "done"
  exit 0
fi

set_shape 1 500m
load wget -q -O /dev/null --header "Content-Type: application/json" --post-file /tmp/query.json "${URL}/v1/queries" \
  || log "probe query create failed; POST rows will not be a pure 409 path"
run_matrix P1 1 500m
sse_test P1 1 500m
a2a_test P1 1

set_shape 1 1
run_matrix P2 1 1

set_shape 2 500m
run_matrix P3 2 500m
a2a_test P3 2

set_shape 3 500m
run_matrix P4 3 500m
a2a_test P4 3

log "done"
