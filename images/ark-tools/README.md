# ark-tools

Docker image containing ARK CLI tools and common Kubernetes utilities.

## Included Tools

- **ark** - ARK CLI for managing agents, queries, and workflows
- **fark** - Fast ARK CLI optimized for resource management
- **kubectl** - Kubernetes command-line tool
- **helm** - Kubernetes package manager
- **argo** - Argo Workflows CLI
- **devspace** - Development tool for Kubernetes

## Usage

### Interactive Shell

```bash
docker run -it --rm agents-at-scale/ark-tools:alpine
```

### Run Single Command

```bash
# Check ARK CLI version
docker run --rm agents-at-scale/ark-tools:alpine ark --version

# List Kubernetes resources
docker run --rm -v ~/.kube:/home/arktools/.kube:ro \
  agents-at-scale/ark-tools:alpine kubectl get pods

# Deploy with Helm
docker run --rm -v ~/.kube:/home/arktools/.kube:ro \
  agents-at-scale/ark-tools:alpine helm list
```

### With kubeconfig

Mount your kubeconfig to use kubectl/helm/argo. For kubeconfigs with embedded certificates (most cloud providers), simply mount the .kube directory:

```bash
docker run -it --rm \
  -v ~/.kube:/home/arktools/.kube:ro \
  agents-at-scale/ark-tools:alpine
```

## Building

```bash
# Build the image
make ark-tools-docker

# Build with custom tag
ARK_TOOLS_TAG=latest make ark-tools-docker
```

## Image Details

- **Base**: Alpine Linux 3.20
- **User**: Non-root user `arktools` (UID 1001)
- **Size**: ~300MB (optimized for size)
