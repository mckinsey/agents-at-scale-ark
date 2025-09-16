#!/bin/bash

# Deploy OTEL headers script
# Required environment variables: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_ENDPOINT

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check required environment variables
if [[ -z "${LANGFUSE_PUBLIC_KEY}" ]]; then
    echo -e "${RED}error:${NC} LANGFUSE_PUBLIC_KEY environment variable is required"
    exit 1
fi

if [[ -z "${LANGFUSE_SECRET_KEY}" ]]; then
    echo -e "${RED}error:${NC} LANGFUSE_SECRET_KEY environment variable is required"
    exit 1
fi

if [[ -z "${LANGFUSE_ENDPOINT}" ]]; then
    echo -e "${RED}error:${NC} LANGFUSE_ENDPOINT environment variable is required"
    exit 1
fi

if [[ -z "${LANGFUSE_DEPLOYMENT}" ]]; then
    echo -e "${RED}error:${NC} LANGFUSE_DEPLOYMENT environment variable is required"
    exit 1
fi

if [[ -z "${LANGFUSE_NAMESPACE}" ]]; then
    echo -e "${RED}error:${NC} LANGFUSE_NAMESPACE environment variable is required"
    exit 1
fi

# Format: Authorization=Basic <base64(public_key:secret_key)> (Langfuse OTEL format)
AUTH_HEADER="Authorization=Basic $(echo -n "${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}" | base64)"

# Mask credentials for display
PK_DISPLAY="${LANGFUSE_PUBLIC_KEY:0:8}***"
SK_DISPLAY="${LANGFUSE_SECRET_KEY:0:8}***"

echo -e "${BLUE}info:${NC} deploying OTEL headers with key ${YELLOW}${PK_DISPLAY}${NC} to endpoint ${YELLOW}${LANGFUSE_ENDPOINT}${NC}"
echo -e "${BLUE}info:${NC} headers: ${YELLOW}OTEL_EXPORTER_OTLP_HEADERS=${AUTH_HEADER:0:50}...${NC}"
echo -e "${BLUE}info:${NC} endpoint: ${YELLOW}OTEL_EXPORTER_OTLP_ENDPOINT=${LANGFUSE_ENDPOINT}/api/public/otel${NC}"
echo ""

# Wait for Langfuse to be ready
echo -e "${BLUE}info:${NC} waiting for ${YELLOW}${LANGFUSE_DEPLOYMENT}${NC} in ${YELLOW}${LANGFUSE_NAMESPACE}${NC} namespace to be ready..."
timeout=120
while [ $timeout -gt 0 ]; do
    if kubectl get deployment "${LANGFUSE_DEPLOYMENT}" -n "${LANGFUSE_NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q "1"; then
        echo -e "${GREEN}info:${NC} ${YELLOW}${LANGFUSE_DEPLOYMENT}${NC} is ready"
        break
    fi
    sleep 2
    timeout=$((timeout-2))
done

if [ $timeout -le 0 ]; then
    echo -e "${RED}error:${NC} timeout waiting for ${YELLOW}${LANGFUSE_DEPLOYMENT}${NC} to be ready"
    exit 1
fi

NAMESPACES=("ark-system" "default")

for namespace in "${NAMESPACES[@]}"; do
    echo -e "${GREEN}info:${NC} deploying OTEL config to ${YELLOW}${namespace}${NC} namespace"
    
    # Delete existing resources
    kubectl delete secret otel-environment-variables -n "${namespace}" --ignore-not-found=true >/dev/null 2>&1 || true
    kubectl delete configmap otel-environment-variables -n "${namespace}" --ignore-not-found=true >/dev/null 2>&1 || true
    
    # Create namespace if it doesn't exist
    kubectl create namespace "${namespace}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
    
    # Create OTEL secret with proper format
    kubectl create secret generic otel-environment-variables \
        -n "${namespace}" \
        --from-literal=OTEL_EXPORTER_OTLP_HEADERS="${AUTH_HEADER}" \
        --from-literal=OTEL_EXPORTER_OTLP_ENDPOINT="${LANGFUSE_ENDPOINT}/api/public/otel" \
        >/dev/null 2>&1
    
    # Find and restart deployments that use the OTEL configmap/secret
    deployments=$(kubectl get deployments -n "${namespace}" -o json | jq -r '
        .items[] | 
        select(.spec.template.spec.containers[]?.envFrom[]? | 
               (.configMapRef?.name == "otel-environment-variables") or 
               (.secretRef?.name == "otel-environment-variables")) | 
        .metadata.name' | sort -u
    )
    
    if [[ -n "${deployments}" ]]; then
        while IFS= read -r deployment; do
            if [[ -n "${deployment}" ]]; then
                echo -e "${BLUE}info:${NC} restarting deployment ${YELLOW}${deployment}${NC} in ${YELLOW}${namespace}${NC} namespace"
                kubectl rollout restart deployment/"${deployment}" -n "${namespace}" >/dev/null 2>&1
            fi
        done <<< "${deployments}"
    else
        echo -e "${YELLOW}info:${NC} no deployments found using OTEL config in ${YELLOW}${namespace}${NC} namespace"
    fi
done
