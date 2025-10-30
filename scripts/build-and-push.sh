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
    if kubectl config current-context | grep -q "kind"; then
        echo "kind"
    elif kubectl config current-context | grep -q "k3d-"; then
        echo "k3d"
    elif kubectl config current-context | grep -q "minikube"; then
        echo "minikube"
    elif kubectl config current-context | grep -q "k3s"; then
        echo "k3s"
    elif kubectl config current-context | grep -q "default" && kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}' 2>/dev/null | grep -q "k3s"; then
        echo "k3s"
    elif minikube status >/dev/null 2>&1; then
        echo "minikube"
    elif kind get clusters >/dev/null 2>&1 && [ "$(kind get clusters | wc -l)" -gt 0 ]; then
        echo "kind"
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

build_and_push_kind() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    echo -e "${blue}Building image for kind cluster...${nc}"
    
    # Build the image
    docker_build "$image_name" "$tag" "$dockerfile_path" "$build_context"
    
    # Load into kind cluster
    echo -e "${blue}Loading image into kind cluster...${nc}"
    
    # Get the first kind cluster name
    local cluster_name=$(kind get clusters | head -n1)
    if [ -n "$cluster_name" ]; then
        kind load docker-image "$image_name:$tag" --name "$cluster_name"
    else
        kind load docker-image "$image_name:$tag"
    fi
    
    echo -e "${green}✔${nc} Image $image_name:$tag loaded into kind cluster"
}

build_and_push_minikube() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    echo -e "${blue}Building image for minikube cluster...${nc}"
    
    # Use minikube docker environment
    eval $(minikube docker-env)
    
    # Build the image directly in minikube's docker daemon
    docker_build "$image_name" "$tag" "$dockerfile_path" "$build_context"
    
    echo -e "${green}✔${nc} Image $image_name:$tag built in minikube cluster"
}

build_and_push_k3s() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    echo -e "${blue}Building image for k3s cluster...${nc}"
    
    # Build the image locally
    docker_build "$image_name" "$tag" "$dockerfile_path" "$build_context"
    
    # Import image into k3s containerd
    echo -e "${blue}Importing image into k3s cluster...${nc}"
    
    # Save image as tar and import to k3s
    docker save "$image_name:$tag" | sudo k3s ctr images import -
    
    echo -e "${green}✔${nc} Image $image_name:$tag imported into k3s cluster"
}

build_and_push_k3d() {
    local image_name="$1"
    local tag="$2"
    local dockerfile_path="$3"
    local build_context="$4"
    
    echo -e "${blue}Building image for k3d cluster...${nc}"
    
    # Build the image locally
    docker_build "$image_name" "$tag" "$dockerfile_path" "$build_context"
    
    # Import image into k3d cluster
    echo -e "${blue}Importing image into k3d cluster...${nc}"
    
    # Get current context and extract cluster name
    local context=$(kubectl config current-context)
    local cluster_name=${context#k3d-}  # Remove k3d- prefix
    
    # Import image using k3d
    k3d image import "$image_name:$tag" -c "$cluster_name"
    
    echo -e "${green}✔${nc} Image $image_name:$tag imported into k3d cluster"
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
        kind)
            if ! command -v kind >/dev/null 2>&1; then
                echo -e "${red}error${nc}: kind not found"
                echo "install with: brew install kind"
                exit 1
            fi
            if [ "$(kind get clusters | wc -l)" -eq 0 ]; then
                echo -e "${red}error${nc}: no kind clusters found"
                echo "create one with: kind create cluster"
                exit 1
            fi
            build_and_push_kind "$IMAGE_NAME" "$TAG" "$DOCKERFILE_PATH" "$BUILD_CONTEXT" "$PLATFORM"
            ;;
        minikube)
            if ! command -v minikube >/dev/null 2>&1; then
                echo -e "${red}error${nc}: minikube not found"
                echo "install with: brew install minikube"
                exit 1
            fi
            if ! minikube status >/dev/null 2>&1; then
                echo -e "${red}error${nc}: minikube not running"
                echo "start with: minikube start"
                exit 1
            fi
            build_and_push_minikube "$IMAGE_NAME" "$TAG" "$DOCKERFILE_PATH" "$BUILD_CONTEXT"
            ;;
        k3d)
            if ! command -v k3d >/dev/null 2>&1; then
                echo -e "${red}error${nc}: k3d not found"
                echo "install with: brew install k3d"
                exit 1
            fi
            # Check if current context points to a k3d cluster
            if ! kubectl config current-context | grep -q "k3d-"; then
                echo -e "${red}error${nc}: current context is not a k3d cluster"
                exit 1
            fi
            build_and_push_k3d "$IMAGE_NAME" "$TAG" "$DOCKERFILE_PATH" "$BUILD_CONTEXT"
            ;;
        k3s)
            if ! command -v k3s >/dev/null 2>&1; then
                echo -e "${red}error${nc}: k3s not found"
                echo "install k3s from https://k3s.io/"
                exit 1
            fi
            if ! sudo k3s kubectl get nodes >/dev/null 2>&1; then
                echo -e "${red}error${nc}: k3s cluster not accessible"
                echo "make sure k3s is running and accessible"
                exit 1
            fi
            build_and_push_k3s "$IMAGE_NAME" "$TAG" "$DOCKERFILE_PATH" "$BUILD_CONTEXT"
            ;;
        *)
            echo -e "${red}error${nc}: unsupported cluster type: $TARGET_CLUSTER"
            echo "supported cluster types: kind, k3d, minikube, k3s"
            exit 1
            ;;
    esac

    echo -e "\n${green}Build and push complete!${nc}"
    echo -e "Image: ${white}$IMAGE_NAME:$TAG${nc}"
    echo -e "Cluster: ${white}$TARGET_CLUSTER${nc}"
}

main "$@"