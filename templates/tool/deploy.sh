#!/bin/bash
set -e

cd "$(dirname "$0")"

docker build -t tool:latest .
# Load image into cluster - adjust command based on your cluster type
# Load image into MicroK8s
docker save tool:latest | microk8s ctr images import -
kubectl apply -k deployment/