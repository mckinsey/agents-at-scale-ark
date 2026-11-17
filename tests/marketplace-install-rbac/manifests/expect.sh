denied() {
  policy=$1
  shift
  if out=$("$@" 2>&1); then
    echo "expected a denial from $policy: $*"
    echo "$out"
    exit 1
  fi
  if ! echo "$out" | grep -qE "ValidatingAdmissionPolicy '$policy(-bootstrap)?'"; then
    echo "denied, but not by $policy: $*"
    echo "$out"
    exit 1
  fi
}

wait_enforced() {
  ns=$1
  for _ in $(seq 1 30); do
    if ! kubectl -n "$ns" create --dry-run=server -f manifests/installer-workloads/pod.yaml >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "policy in $ns not enforced after 30s"
  exit 1
}
