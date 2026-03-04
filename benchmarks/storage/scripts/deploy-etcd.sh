#!/bin/bash
set -e

ETCD_VER=${ETCD_VER:-v3.5.17}
ETCD_DATA_DIR=${ETCD_DATA_DIR:-/tmp/etcd-data}
ETCD_PORT=${ETCD_PORT:-2379}

usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  docker      Run etcd in Docker with host networking (recommended)"
    echo "  binary      Download and run etcd binary directly"
    echo "  stop        Stop running etcd"
    echo "  clean       Stop etcd and remove data"
    echo ""
    echo "Environment variables:"
    echo "  ETCD_VER       etcd version (default: $ETCD_VER)"
    echo "  ETCD_DATA_DIR  Data directory (default: $ETCD_DATA_DIR)"
    echo "  ETCD_PORT      Client port (default: $ETCD_PORT)"
    exit 1
}

start_docker() {
    echo "Starting etcd ${ETCD_VER} with Docker (host networking)..."

    docker rm -f etcd-bench 2>/dev/null || true
    mkdir -p "$ETCD_DATA_DIR"

    docker run -d \
        --name etcd-bench \
        --net=host \
        -v "${ETCD_DATA_DIR}:/etcd-data" \
        "quay.io/coreos/etcd:${ETCD_VER}" etcd \
        --name etcd0 \
        --data-dir /etcd-data \
        --listen-client-urls "http://0.0.0.0:${ETCD_PORT}" \
        --advertise-client-urls "http://127.0.0.1:${ETCD_PORT}" \
        --listen-peer-urls http://0.0.0.0:2380 \
        --initial-advertise-peer-urls http://127.0.0.1:2380 \
        --initial-cluster etcd0=http://127.0.0.1:2380 \
        --initial-cluster-token benchmark-cluster \
        --initial-cluster-state new \
        --quota-backend-bytes=$((2*1024*1024*1024)) \
        --auto-compaction-mode=periodic \
        --auto-compaction-retention=1h \
        --unsafe-no-fsync=true

    echo "Waiting for etcd to be ready..."
    for i in $(seq 1 30); do
        if docker exec etcd-bench etcdctl endpoint health 2>/dev/null; then
            echo "etcd is ready on localhost:${ETCD_PORT}"
            return 0
        fi
        sleep 1
    done

    echo "ERROR: etcd failed to start"
    docker logs etcd-bench
    exit 1
}

start_binary() {
    echo "Downloading etcd ${ETCD_VER}..."

    DOWNLOAD_URL="https://github.com/etcd-io/etcd/releases/download/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz"
    ETCD_BIN="/tmp/etcd-${ETCD_VER}/etcd"

    if [[ ! -f "$ETCD_BIN" ]]; then
        mkdir -p "/tmp/etcd-${ETCD_VER}"
        curl -L "$DOWNLOAD_URL" | tar xz -C /tmp
        mv "/tmp/etcd-${ETCD_VER}-linux-amd64"/* "/tmp/etcd-${ETCD_VER}/"
        rmdir "/tmp/etcd-${ETCD_VER}-linux-amd64"
    fi

    echo "Starting etcd..."
    mkdir -p "$ETCD_DATA_DIR"

    "$ETCD_BIN" \
        --name etcd0 \
        --data-dir "$ETCD_DATA_DIR" \
        --listen-client-urls "http://0.0.0.0:${ETCD_PORT}" \
        --advertise-client-urls "http://127.0.0.1:${ETCD_PORT}" \
        --listen-peer-urls http://0.0.0.0:2380 \
        --initial-advertise-peer-urls http://127.0.0.1:2380 \
        --initial-cluster etcd0=http://127.0.0.1:2380 \
        --initial-cluster-token benchmark-cluster \
        --initial-cluster-state new \
        --quota-backend-bytes=$((2*1024*1024*1024)) \
        --auto-compaction-mode=periodic \
        --auto-compaction-retention=1h \
        --unsafe-no-fsync=true &

    ETCD_PID=$!
    echo "$ETCD_PID" > /tmp/etcd-bench.pid

    echo "Waiting for etcd to be ready..."
    for i in $(seq 1 30); do
        if "/tmp/etcd-${ETCD_VER}/etcdctl" endpoint health 2>/dev/null; then
            echo "etcd is ready on localhost:${ETCD_PORT} (PID: $ETCD_PID)"
            return 0
        fi
        sleep 1
    done

    echo "ERROR: etcd failed to start"
    exit 1
}

stop_etcd() {
    echo "Stopping etcd..."
    docker rm -f etcd-bench 2>/dev/null || true

    if [[ -f /tmp/etcd-bench.pid ]]; then
        PID=$(cat /tmp/etcd-bench.pid)
        kill "$PID" 2>/dev/null || true
        rm /tmp/etcd-bench.pid
    fi

    pkill -f "etcd.*benchmark-cluster" 2>/dev/null || true
    echo "etcd stopped"
}

clean_etcd() {
    stop_etcd
    echo "Removing data directory..."
    rm -rf "$ETCD_DATA_DIR"
    echo "Clean complete"
}

case "${1:-}" in
    docker)
        start_docker
        ;;
    binary)
        start_binary
        ;;
    stop)
        stop_etcd
        ;;
    clean)
        clean_etcd
        ;;
    *)
        usage
        ;;
esac
