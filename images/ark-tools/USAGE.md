# ark-tools Usage Examples

## Quick Reference

### Check Tool Versions

```bash
docker run --rm agents-at-scale/ark-tools:alpine ark --version
docker run --rm agents-at-scale/ark-tools:alpine fark --version
docker run --rm agents-at-scale/ark-tools:alpine kubectl version --client
docker run --rm agents-at-scale/ark-tools:alpine helm version
docker run --rm agents-at-scale/ark-tools:alpine argo version
docker run --rm agents-at-scale/ark-tools:alpine devspace version
```

### Interactive Development

```bash
# Start interactive shell with kubeconfig mounted
docker run -it --rm \
  -v ~/.kube:/home/arktools/.kube:ro \
  -v $(pwd):/workspace \
  -w /workspace \
  agents-at-scale/ark-tools:alpine

# Inside the container:
$ ark query list
$ fark get agents
$ kubectl get pods -n ark-system
$ helm list -A
```

### Batch Operations

```bash
# Apply all manifests in a directory
docker run --rm \
  -v ~/.kube:/home/arktools/.kube:ro \
  -v $(pwd)/manifests:/manifests:ro \
  agents-at-scale/ark-tools:alpine \
  ark apply -f /manifests/
```

### DevSpace Development

```bash
docker run -it --rm \
  -v ~/.kube:/home/arktools/.kube:ro \
  -v $(pwd):/workspace \
  -w /workspace \
  agents-at-scale/ark-tools:alpine \
  devspace dev --no-warn
```

## Common Patterns

### Read-only kubeconfig

Always mount kubeconfig as read-only (`:ro`) for security:

```bash
-v ~/.kube:/home/arktools/.kube:ro
```

### Working Directory

Mount your project directory and set working directory:

```bash
-v $(pwd):/workspace -w /workspace
```

### Network Access

If you need to access services on the host:

```bash
--network host
```