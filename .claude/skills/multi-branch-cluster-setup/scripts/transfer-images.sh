#!/usr/bin/env bash
# Export built images from cluster-1 and load them into all remaining clusters.
# Run this AFTER cluster-1 (the first branch) is fully deployed.
# Usage: bash transfer-images.sh
# Reads cluster list from /tmp/ark-cluster-state.conf (written by setup-clusters.sh)
set -euo pipefail

STATE_FILE="/tmp/ark-cluster-state.conf"
if [ ! -f "$STATE_FILE" ]; then
  echo "ERROR: $STATE_FILE not found. Run setup-clusters.sh first."
  exit 1
fi

WORK_DIR="/tmp/ark-image-transfer"
mkdir -p "$WORK_DIR"

# Read source (cluster-1) and targets (all others)
SOURCE_CLUSTER=""
TARGET_CLUSTERS=()
while IFS=: read -r CLUSTER BRANCH SLUG WORKTREE DPORT APORT GPORT; do
  if [ -z "$SOURCE_CLUSTER" ]; then
    SOURCE_CLUSTER="$CLUSTER"
  else
    TARGET_CLUSTERS+=("$CLUSTER")
  fi
done < "$STATE_FILE"

if [ -z "$SOURCE_CLUSTER" ]; then
  echo "ERROR: No clusters in state file."
  exit 1
fi

if [ ${#TARGET_CLUSTERS[@]} -eq 0 ]; then
  echo "Only one cluster configured — nothing to transfer."
  exit 0
fi

echo "==> Source cluster: $SOURCE_CLUSTER"
echo "==> Target clusters: ${TARGET_CLUSTERS[*]}"

# ── DISCOVER IMAGES FROM SOURCE CLUSTER ───────────────────────────────────
echo ""
echo "==> Reading images from $SOURCE_CLUSTER..."
eval "$(minikube docker-env -p "$SOURCE_CLUSTER")"

CONTROLLER_TAG=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ark-controller:" | head -1)
COMPLETIONS_TAG=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ark-completions:" | head -1)
BROKER_TAG=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^ark-broker:" | head -1)

if [ -z "$CONTROLLER_TAG" ] || [ -z "$COMPLETIONS_TAG" ]; then
  echo "ERROR: ark-controller or ark-completions not found in $SOURCE_CLUSTER."
  echo "Make sure $SOURCE_CLUSTER is fully deployed before running this script."
  eval "$(minikube docker-env -u)"
  exit 1
fi

echo "    ark-controller  : $CONTROLLER_TAG"
echo "    ark-completions : $COMPLETIONS_TAG"
echo "    ark-broker      : ${BROKER_TAG:-not found}"

# ── SAVE IMAGES TO TAR ─────────────────────────────────────────────────────
echo ""
echo "==> Saving images to $WORK_DIR/ ..."

docker save "$CONTROLLER_TAG" "$COMPLETIONS_TAG" -o "$WORK_DIR/ark-go-images.tar"
echo "    Saved Go images ($(du -sh "$WORK_DIR/ark-go-images.tar" | cut -f1))"

if [ -n "$BROKER_TAG" ]; then
  docker save "$BROKER_TAG" -o "$WORK_DIR/ark-broker.tar"
  echo "    Saved ark-broker ($(du -sh "$WORK_DIR/ark-broker.tar" | cut -f1))"
fi

eval "$(minikube docker-env -u)"

# Save host-built images
for IMG in "ark-dashboard:main-local" "ark-api:main-local" "ark-api:latest"; do
  if docker image inspect "$IMG" > /dev/null 2>&1; then
    SAFE="${IMG//:/-}"
    docker save "$IMG" -o "$WORK_DIR/${SAFE}.tar"
    echo "    Saved $IMG ($(du -sh "$WORK_DIR/${SAFE}.tar" | cut -f1))"
  fi
done

# ── LOAD INTO TARGET CLUSTERS ─────────────────────────────────────────────
echo ""
echo "==> Loading images into target clusters (in parallel)..."

PIDS=()
for CLUSTER in "${TARGET_CLUSTERS[@]}"; do
  (
    echo "    [$CLUSTER] Loading Go images..."
    minikube image load "$WORK_DIR/ark-go-images.tar" -p "$CLUSTER" 2>/dev/null

    [ -f "$WORK_DIR/ark-broker.tar" ] && \
      minikube image load "$WORK_DIR/ark-broker.tar" -p "$CLUSTER" 2>/dev/null

    for TAR in "$WORK_DIR"/ark-dashboard-*.tar "$WORK_DIR"/ark-api-*.tar; do
      [ -f "$TAR" ] && minikube image load "$TAR" -p "$CLUSTER" 2>/dev/null
    done

    echo "    [$CLUSTER] Done"
  ) &
  PIDS+=($!)
done

for PID in "${PIDS[@]}"; do wait "$PID"; done

echo ""
echo "==> Transfer complete. Verify with:"
for CLUSTER in "${TARGET_CLUSTERS[@]}"; do
  echo "    minikube image list -p $CLUSTER | grep ark-"
done
