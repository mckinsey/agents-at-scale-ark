#!/usr/bin/env bash
# Manage port forwards for all configured Ark clusters.
# Reads cluster list from /tmp/ark-cluster-state.conf (written by setup-clusters.sh)
# Usage: bash port-forward.sh [start|stop|restart|status]
set -euo pipefail

CMD="${1:-status}"
STATE_FILE="/tmp/ark-cluster-state.conf"
LOG_DIR="/tmp/ark-port-forwards"
mkdir -p "$LOG_DIR"

load_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "ERROR: $STATE_FILE not found. Run setup-clusters.sh first."
    exit 1
  fi
}

start_forwards() {
  load_state
  echo "==> Starting port forwards..."
  while IFS=: read -r CLUSTER BRANCH SLUG WORKTREE DPORT APORT GPORT; do
    for ENTRY in "default:ark-dashboard:${DPORT}:3000" "default:ark-api:${APORT}:80" "ark-system:localhost-gateway-nginx:${GPORT}:80"; do
      IFS=: read -r NS SVC LOCAL REMOTE <<< "$ENTRY"
      LOG="$LOG_DIR/${CLUSTER}-${SVC}-${LOCAL}.log"
      kubectl port-forward \
        --context="$CLUSTER" \
        "svc/$SVC" "${LOCAL}:${REMOTE}" \
        --namespace "$NS" \
        > "$LOG" 2>&1 &
      echo "    $CLUSTER  $SVC  localhost:$LOCAL"
    done
  done < "$STATE_FILE"

  sleep 2
  echo ""
  echo "==> Dashboards:"
  while IFS=: read -r CLUSTER BRANCH SLUG WORKTREE DPORT APORT GPORT; do
    echo "    http://localhost:${DPORT}  →  $CLUSTER ($BRANCH)"
  done < "$STATE_FILE"
}

stop_forwards() {
  echo "==> Stopping all port forwards..."
  pkill -f "kubectl port-forward" 2>/dev/null && echo "    Done" || echo "    None were running"
}

show_status() {
  echo "==> Active port forwards:"
  RUNNING=$(ps aux | grep "kubectl port-forward" | grep -v grep || true)
  if [ -z "$RUNNING" ]; then
    echo "    None running"
  else
    echo "$RUNNING" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}'
  fi

  if [ -f "$STATE_FILE" ]; then
    echo ""
    echo "==> Port availability:"
    while IFS=: read -r CLUSTER BRANCH SLUG WORKTREE DPORT APORT GPORT; do
      for PORT in "$DPORT" "$APORT" "$GPORT"; do
        nc -z localhost "$PORT" 2>/dev/null \
          && echo "    :$PORT  open  ($CLUSTER)" \
          || echo "    :$PORT  closed ($CLUSTER)"
      done
    done < "$STATE_FILE"
  fi
}

case "$CMD" in
  start)   start_forwards ;;
  stop)    stop_forwards ;;
  restart) stop_forwards; sleep 1; start_forwards ;;
  status)  show_status ;;
  *)
    echo "Usage: $0 [start|stop|restart|status]"
    exit 1
    ;;
esac
