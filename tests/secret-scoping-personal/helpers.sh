API="http://ark-api.$NAMESPACE.svc.cluster.local/v1/secrets"
ISSUER="http://dex.$NAMESPACE.svc.cluster.local:5556/dex"
POD=personal-curl
DEX_CLIENT=ark-dashboard:ark-dashboard-dev-secret

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

owner_hash() {
  H=$(kubectl exec "$POD" -n "$NAMESPACE" -- sh -c "printf '%s' '$1' | sha256sum" | cut -c1-16)
  case "$H" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) echo "$H" ;;
    *) echo "FAIL: could not hash $1" >&2; return 1 ;;
  esac
}

call() {
  bearer=$1 method=$2 path=$3 body=${4:-}
  case "$path" in
    *\?*) url="$API$path&namespace=$NAMESPACE" ;;
    *) url="$API$path?namespace=$NAMESPACE" ;;
  esac
  set -- -s -w '\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json'
  if [ -n "$bearer" ]; then
    set -- "$@" -H "Authorization: Bearer $bearer"
  fi
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

names() {
  body_of "$1" | jq -c '[.items[].name] | sort'
}
