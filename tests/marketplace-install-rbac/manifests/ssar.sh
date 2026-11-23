can() {
  as=$1 ns=$2 group=$3 resource=$4 verb=$5 name=${6:-}
  kubectl create --validate=false --as "$as" -o jsonpath='{.status.allowed}' -f - <<SSAR
apiVersion: authorization.k8s.io/v1
kind: SelfSubjectAccessReview
spec:
  resourceAttributes:
    namespace: "$ns"
    group: "$group"
    resource: "$resource"
    verb: "$verb"
    name: "$name"
SSAR
}

expect_can() {
  want=$1
  shift
  got=$(can "$@")
  [ "$got" = true ] || got=false
  if [ "$got" != "$want" ]; then
    echo "SSAR $* = $got, want $want"
    exit 1
  fi
}
