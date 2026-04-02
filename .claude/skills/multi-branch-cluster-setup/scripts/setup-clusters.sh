#!/usr/bin/env bash
# Set up minikube clusters — one per branch supplied as arguments.
# Usage: bash setup-clusters.sh <branch1> <branch2> [branchN...]
# Example: bash setup-clusters.sh main feat/team-studio feat/my-feature
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <branch1> [branch2] [branchN...]"
  exit 1
fi

BRANCHES=("$@")
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE_FILE="/tmp/ark-cluster-state.conf"

# ── CLEANUP ────────────────────────────────────────────────────────────────
echo "==> Stopping all devspace and port-forward processes..."
pkill -f "devspace dev"          2>/dev/null || true
pkill -f "devspace deploy"       2>/dev/null || true
pkill -f "kubectl port-forward"  2>/dev/null || true
sleep 2

echo "==> Deleting all existing minikube profiles..."
minikube delete --all 2>/dev/null || true

rm -f "$STATE_FILE"

# ── CREATE CLUSTERS ────────────────────────────────────────────────────────
for i in "${!BRANCHES[@]}"; do
  N=$((i + 1))
  BRANCH="${BRANCHES[$i]}"
  SLUG="${BRANCH//\//-}"
  CLUSTER="ark-cluster-${N}"
  MEMORY=$([[ $N -eq 1 ]] && echo 3072 || echo 2200)
  CPUS=$([[ $N -eq 1 ]] && echo 3 || echo 2)

  if [ $N -eq 1 ]; then
    WORKTREE="$REPO_ROOT"
  else
    WORKTREE="/tmp/ark-worktree-${SLUG}"
  fi

  DASHBOARD_PORT=$((3273 + N))
  API_PORT=$((8079 + N))
  GATEWAY_PORT=$((8089 + N))

  echo ""
  echo "==> Creating cluster $CLUSTER for branch '$BRANCH' (${MEMORY}MB, ${CPUS} CPUs)"
  minikube start \
    --profile            "$CLUSTER" \
    --driver             docker \
    --memory             "$MEMORY" \
    --cpus               "$CPUS" \
    --disk-size          20g \
    --kubernetes-version v1.32.0

  echo "$CLUSTER:$BRANCH:$SLUG:$WORKTREE:$DASHBOARD_PORT:$API_PORT:$GATEWAY_PORT" >> "$STATE_FILE"
  echo "    Created $CLUSTER"
done

# ── BIND DEVSPACE CONTEXTS ─────────────────────────────────────────────────
echo ""
echo "==> Binding devspace contexts..."
while IFS=: read -r CLUSTER BRANCH SLUG WORKTREE DPORT APORT GPORT; do
  if [ ! -d "$WORKTREE" ]; then
    echo "    WARNING: Worktree $WORKTREE not found — skipping devspace bind for $CLUSTER"
    continue
  fi
  (
    cd "$WORKTREE"
    devspace use context   "$CLUSTER" > /dev/null
    devspace use namespace default     > /dev/null
    echo "    $WORKTREE → $CLUSTER"
  )
done < "$STATE_FILE"

# ── SUMMARY ───────────────────────────────────────────────────────────────
echo ""
echo "==> Clusters ready:"
minikube profile list

echo ""
echo "==> Cluster state written to $STATE_FILE"
echo ""
echo "Next steps:"
echo "  1. Deploy cluster-1 first:  devspace deploy --kube-context ark-cluster-1 --namespace default --skip-push-local-kube"
echo "  2. Transfer images:         bash .claude/skills/multi-branch-cluster-setup/scripts/transfer-images.sh"
echo "  3. Deploy remaining:        bash .claude/skills/multi-branch-cluster-setup/scripts/deploy-helm.sh ark-cluster-2"
echo "  4. Port forward:            bash .claude/skills/multi-branch-cluster-setup/scripts/port-forward.sh start"
