#!/usr/bin/env bash

set -e -o pipefail

# Colors for output
green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
white='\033[1;37m'
nc='\033[0m'

# Check if we're in the project root
if [ ! -f "version.txt" ]; then
    echo -e "${red}error${nc}: must run from project root directory"
    exit 1
fi

# ARK containers to transfer
CONTAINERS=(
    "ark-controller"
    "ark-api"
    "ark-dashboard"
    "executor-langchain"
    "ark-evaluator"
    "postgres-memory"
)


# Get version from environment variable or default to 'latest'
VERSION=${VERSION:-latest}
echo -e "${green}transfer-ark-containers${nc} ${white}${VERSION}${nc}"

# Check required environment variables
TARGET_DOCKER_REGISTRY=${TARGET_DOCKER_REGISTRY:?is required}
TARGET_DOCKER_USERNAME=${TARGET_DOCKER_USERNAME:?is required}
TARGET_DOCKER_TOKEN=${TARGET_DOCKER_TOKEN:?is required}

# Auto-detect mode based on SOURCE registry variables
if [ -n "${SOURCE_DOCKER_REGISTRY}" ]; then
    echo "detected SOURCE_DOCKER_REGISTRY - using transfer mode"
    SOURCE_DOCKER_USERNAME=${SOURCE_DOCKER_USERNAME:?is required for transfer mode}
    SOURCE_DOCKER_TOKEN=${SOURCE_DOCKER_TOKEN:?is required for transfer mode}
    TRANSFER_MODE=true
else
    echo "no SOURCE_DOCKER_REGISTRY - using locally built containers"
    TRANSFER_MODE=false
fi

if [ "$TRANSFER_MODE" = true ]; then
    echo "logging into source registry..."
    echo "${SOURCE_DOCKER_TOKEN}" | docker login "${SOURCE_DOCKER_REGISTRY}" --username "${SOURCE_DOCKER_USERNAME}" --password-stdin
fi

echo "logging into target registry..."
echo "${TARGET_DOCKER_TOKEN}" | docker login "${TARGET_DOCKER_REGISTRY}" --username "${TARGET_DOCKER_USERNAME}" --password-stdin

for container in "${CONTAINERS[@]}"; do
    target_image="${TARGET_DOCKER_REGISTRY}/${container}:${VERSION}"
    
    # If source registry is specified, pull from there first
    if [ "$TRANSFER_MODE" = true ]; then
        source_image="${SOURCE_DOCKER_REGISTRY}/${container}:${VERSION}"
        echo "pulling ${container} from source registry..."
        docker pull "$source_image"
        docker tag "$source_image" "$target_image"
    else
        local_image="${container}:latest"
        echo "tagging local ${container}..."
        docker tag "$local_image" "$target_image"
    fi
    
    echo "pushing ${container}:${VERSION}..."
    docker push "$target_image"
done

for container in "${CONTAINERS[@]}"; do
    echo -e "${green}✔${nc} pushed: ${white}${TARGET_DOCKER_REGISTRY}/${container}:${VERSION}${nc}"
done
