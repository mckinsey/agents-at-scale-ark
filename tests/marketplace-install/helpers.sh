ARK_API="http://ark-api.$NAMESPACE.svc.cluster.local/v1"
ISSUER="http://dex.$NAMESPACE.svc.cluster.local:5556/dex"
REGISTRY="registry.$NAMESPACE.svc.cluster.local:5000"
TA="$NAMESPACE-ta"
TB="$NAMESPACE-tb"
POD=mkt-curl
DEX_CLIENT=ark-dashboard:ark-dashboard-dev-secret
ALICE=alice@ark.local
BOB=bob@ark.local

pod_curl() {
  kubectl exec "$POD" -n "$NAMESPACE" -- curl "$@"
}

token() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    T=$(pod_curl -s --user "$DEX_CLIENT" \
      -d grant_type=password --data-urlencode "username=$1" -d password=arkdev123 \
      --data-urlencode 'scope=openid email' "$ISSUER/token" | jq -r '.id_token // empty' 2>/dev/null || true)
    if [ -n "$T" ]; then
      echo "$T"
      return 0
    fi
    sleep 3
  done
  echo "FAIL: Dex gave no token for $1" >&2
  return 1
}

mkt() {
  bearer=$1 method=$2 ns=$3 path=$4 body=${5:-}
  set -- -s -w '\n%{http_code}' -X "$method" "$ARK_API/namespaces/$ns/marketplace-installs$path" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $bearer"
  if [ -n "$body" ]; then
    set -- "$@" -d "$body"
  fi
  pod_curl "$@"
}

status_of() {
  printf '%s\n' "$1" | tail -n 1
}

body_of() {
  printf '%s\n' "$1" | sed '$d'
}

expect_status() {
  echo "$1 -> $(status_of "$2")"
  [ "$(status_of "$2")" = "$3" ] || { echo "FAIL: $1 expected $3"; body_of "$2"; exit 1; }
}

expect_json() {
  got=$(body_of "$2" | jq -c "$3")
  echo "$1 -> $got"
  [ "$got" = "$4" ] || { echo "FAIL: $1 expected $4"; body_of "$2"; exit 1; }
}

catalog_json() {
  items=""
  for v in "$@"; do
    items="$items${items:+,}{\"name\":\"fixture-$v\",\"ark\":{\"chartPath\":\"oci://$REGISTRY/charts/fixture-$v\",\"helmReleaseName\":\"fixture-$v\",\"installable\":true}}"
  done
  printf '{"items":[%s]}' "$items"
}

wait_enforced() {
  for _ in $(seq 1 30); do
    if ! kubectl -n "$1" create --dry-run=server -f - >/dev/null 2>&1 <<POD
apiVersion: v1
kind: Pod
metadata: {name: probe}
spec:
  serviceAccountName: ark-marketplace-installer
  containers: [{name: c, image: busybox}]
POD
    then
      return 0
    fi
    sleep 1
  done
  echo "policy in $1 not enforced after 30s"
  exit 1
}

with_registry() {
  kubectl -n "$NAMESPACE" port-forward svc/registry 0:5000 >/tmp/mkt-pf-$$.log 2>&1 &
  pf=$!
  for _ in $(seq 1 30); do
    port=$(sed -n 's/^Forwarding from 127.0.0.1:\([0-9]*\).*/\1/p' /tmp/mkt-pf-$$.log | head -n 1)
    [ -n "$port" ] && break
    sleep 1
  done
  [ -n "$port" ] || { kill $pf; cat /tmp/mkt-pf-$$.log; rm -f /tmp/mkt-pf-$$.log; echo "FAIL: no port-forward to the registry"; exit 1; }
  rc=0
  cmd=$1
  shift
  "$cmd" "localhost:$port" "$@" || rc=$?
  kill $pf
  rm -f /tmp/mkt-pf-$$.log
  return $rc
}
