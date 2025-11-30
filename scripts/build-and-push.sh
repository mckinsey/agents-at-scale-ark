#!/usr/bin/env bash

# Build and push Docker images to local Kubernetes clusters

set -e -o pipefail

# Colors for output
green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
white='\033[1;37m'
blue='\033[0;34m'
nc='\033[0m'

# Default values
IMAGE_NAME=""
DOCKERFILE_PATH=""
BUILD_CONTEXT="."
TARGET_CLUSTER=""
TAG="latest"
PLATFORM="linux/amd64"
BUILD_ARGS=""
CACHE_ARGS=""

usage() {
    cat << EOF
Build and push Docker images to local Kubernetes clusters

Usage: $0 [OPTIONS]

Options:
    -i, --image NAME        Image name (required)
    -f, --dockerfile PATH   Path to Dockerfile (default: ./Dockerfile)
    -c, --context PATH      Build context path (default: .)
    -t, --tag TAG          Image tag (default: latest)
    -b, --build-arg ARG    Docker build argument (can be used multiple times)
    -k, --cluster CLUSTER  Target cluster: auto-detect or specific type (default: auto)
    --cache-from TYPE      Cache source  (e.g., type=local,src=/path)
    --cache-to TYPE        Cache destination (e.g., type=local,dest=/path)
    -h, --help             Show this help

Examples:
    # Build ark image for specific cluster
    $0 -i ark -f ark/Dockerfile -c ark -k kind

    # Build ark image with coverage enabled
    $0 -i controller -f ark/Dockerfile -c ark -t coverage -b ENABLE_COVERAGE=true

    # Build MCP server with auto-detection
    $0 -i github -f mcp-servers/github/Dockerfile -c mcp-servers/github

    # Build MCP filesystem server
    $0 -i filesystem-mcp-server -f mcp-servers/filesystem-mcp/Dockerfile -c mcp-servers/filesystem-mcp

    # Build for k3d cluster
    $0 -i my-service -k k3d
    
    # Build for k3s cluster
    $0 -i my-service -k k3s

    # Auto-detect cluster and build with custom tag
    $0 -i my-service -t v1.0.0

EOF
}

detect_cluster() {
    if microk8s status >/dev/null 2>&1; then
        echo "microk8s"
    elif kubectl config current-context | grep -q "microk8s"; then
        echo "microk8s"
    else
        echo ""
    fi
}

docker_build() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    if [ -n "$CACHE_ARGS" ]; then
        docker buildx build \
            -t "$image_name:$tag" \
            -f "$dockerfile_path" \
            --load \
            $BUILD_ARGS \
            $CACHE_ARGS \
            "$build_context"
    else
        docker build \
            -t "$image_name:$tag" \
            -f "$dockerfile_path" \
            $BUILD_ARGS \
            "$build_context"
    fi
}

build_and_push_microk8s() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    echo -e "${blue}Building image for MicroK8s cluster...${nc}"
    
    # Build the image locally
    docker_build "$image_name" "$tag" "$dockerfile_path" "$build_context"
    
    # Detect registry
    local registry="localhost:32000"
    
    # Check if localhost is accessible
    if ! curl -s --connect-timeout 1 http://localhost:32000/v2/ &> /dev/null; then
        # Try to detect VM IP (common on macOS)
        if command -v microk8s &> /dev/null; then
            local vm_ip=$(microk8s config | grep server: | sed 's/.*server: https:\/\/\(.*\):.*/\1/')
            if [ -n "$vm_ip" ]; then
                if curl -s --connect-timeout 1 http://$vm_ip:32000/v2/ &> /dev/null; then
                    registry="$vm_ip:32000"
                    echo -e "${blue}Detected MicroK8s registry at $registry${nc}"
                fi
            fi
        fi
    fi

    local registry_image="$registry/$image_name:$tag"
    
    # Tag for MicroK8s registry
    docker tag "$image_name:$tag" "$registry_image"
    
    # Push to MicroK8s registry
    docker push localhost:32000/"$image_name:$tag"
    
    echo -e "${green}✔${nc} Image $image_name:$tag pushed to MicroK8s registry"
}

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--image)
                IMAGE_NAME="$2"
                shift 2
                ;;
            -f|--dockerfile)
                DOCKERFILE_PATH="$2"
                shift 2
                ;;
            -c|--context)
                BUILD_CONTEXT="$2"
                shift 2
                ;;
            -t|--tag)
                TAG="$2"
                shift 2
                ;;
            -b|--build-arg)
                BUILD_ARGS="$BUILD_ARGS --build-arg $2"
                shift 2
                ;;
            -k|--cluster)
                TARGET_CLUSTER="$2"
                shift 2
                ;;
            --cache-from)
                CACHE_ARGS="$CACHE_ARGS --cache-from $2"
                shift 2
                ;;
            --cache-to)
                CACHE_ARGS="$CACHE_ARGS --cache-to $2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo -e "${red}error${nc}: unknown option $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [ -z "$IMAGE_NAME" ]; then
        echo -e "${red}error${nc}: image name is required (-i/--image)"
        usage
        exit 1
    fi

    # Set default dockerfile path if not provided
    if [ -z "$DOCKERFILE_PATH" ]; then
        DOCKERFILE_PATH="$BUILD_CONTEXT/Dockerfile"
    fi

    # Check if dockerfile exists
    if [ ! -f "$DOCKERFILE_PATH" ]; then
        echo -e "${red}error${nc}: dockerfile not found at $DOCKERFILE_PATH"
        exit 1
    fi

    # Check if build context exists
    if [ ! -d "$BUILD_CONTEXT" ]; then
        echo -e "${red}error${nc}: build context directory not found at $BUILD_CONTEXT"
        exit 1
    fi

    # Detect cluster if not specified
    if [ -z "$TARGET_CLUSTER" ] || [ "$TARGET_CLUSTER" = "auto" ]; then
        TARGET_CLUSTER=$(detect_cluster)
        if [ -z "$TARGET_CLUSTER" ]; then
            echo -e "${red}error${nc}: no local kubernetes cluster detected"
            echo "make sure a cluster is running and kubectl context is set"
            exit 1
        fi
        echo -e "${blue}Auto-detected cluster: $TARGET_CLUSTER${nc}"
    fi

    # Check if docker is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${red}error${nc}: docker daemon not running"
        exit 1
    fi

    # Check cluster-specific requirements
    case "$TARGET_CLUSTER" in
        microk8s)
            if ! command -v microk8s >/dev/null 2>&1; then
                echo -e "${red}error${nc}: microk8s not found"
                echo "install with: sudo snap install microk8s --classic"
                exit 1
            fi
            if ! microk8s status >/dev/null 2>&1; then
                echo -e "${red}error${nc}: microk8s not running"
                echo "start with: microk8s start"
                exit 1
            fi
            build_and_push_microk8s "$IMAGE_NAME" "$TAG" "$DOCKERFILE_PATH" "$BUILD_CONTEXT"
            ;;
        *)
            echo -e "${red}error${nc}: unsupported cluster type: $TARGET_CLUSTER"
            echo "supported cluster types: microk8s"
            exit 1
            ;;
    esac

    echo -e "\n${green}Build and push complete!${nc}"
    echo -e "Image: ${white}$IMAGE_NAME:$TAG${nc}"
    echo -e "Cluster: ${white}$TARGET_CLUSTER${nc}"
}

main "$@"