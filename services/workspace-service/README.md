# Workspace Service

Provisions and manages isolated workspaces for Ark agent execution. Handles environment extraction from Docker images and content provisioning from Git, S3, archives, or empty directories.

## Quickstart

```bash
make help

make workspace-service-build
make workspace-service-install
make workspace-service-dev
```

## How It Works

The workspace-service is a stateful REST service that manages the lifecycle of workspaces used by agents during query execution. It runs alongside the Ark operator and is called by the Query controller.

### Architecture

```
Query Controller ──> Workspace Service ──> Filesystem (PVC)
                          │
                          ├── Environment Provisioner (Docker images)
                          └── Content Provisioners
                              ├── Git (clone repos)
                              ├── Object Storage (S3/GCS/Azure sync)
                              ├── Archive (download + extract tar.gz/zip)
                              └── Empty (blank directory)
```

### Workspace Model

Each workspace has two independent layers:

- **Environment** (read-only): Tools and runtime extracted from a Docker image. The image provisioner pulls the image, creates a temporary container, and copies the filesystem into an `env/` subdirectory.
- **Content** (read-write or read-only): Code and data the agent works on. Provisioned from one of several sources (Git, S3, archive, or empty).

### Lifecycle

A workspace goes through these states:

```
Provision ──> Ready ──> Acquired ──> Released ──> Cleanup
                 │                      │
                 │                      └── (auto-commit/push if configured)
                 │
                 └── (can be re-acquired for persistent workspaces)
```

1. **Provision** (`POST /workspaces/provision`): The Query controller sends a provision request with environment and content specs. The service creates a directory at `{basePath}/ephemeral/{queryUID}/{workspaceID}/`, extracts the environment image (if specified), and clones/syncs the content. Returns the workspace ID and filesystem path.

2. **Acquire** (`POST /workspaces/{id}/acquire`): Locks the workspace to a specific query. If the workspace is already owned by a different query, returns `409 Conflict`. For persistent workspaces, a `sessionId` can resume a previous session.

3. **Release** (`POST /workspaces/{id}/release`): Unlocks the workspace. If `autoCommit` is configured and the content is git-backed, commits and pushes changes before releasing.

4. **Cleanup** (`DELETE /workspaces/{id}`): Removes the workspace directory and deletes the internal state. The Query controller calls this after execution when `ttl: 0`.

### Concurrency

The manager uses a `sync.RWMutex` to protect workspace state. Acquire uses an exclusive lock and enforces single-owner semantics:

- If no owner, the requesting query takes the lock
- If the same query re-acquires, it succeeds (idempotent)
- If a different query tries to acquire, it gets a `WorkspaceInUseError` (HTTP 409)

### Orphan Cleanup

A background goroutine scans `{basePath}/ephemeral/` every 10 minutes. Any workspace directory whose modification time exceeds the grace period (default 1 hour) is removed. This catches workspaces left behind by crashed queries that didn't reach finalization.

### Storage

Workspaces are stored on a PVC mounted at the configured `--base-path` (default `/workspaces`). The Helm chart creates a `ReadWriteOnce` PVC sized by `storage.size` (default `10Gi`).

### Integration with the Operator

The Ark operator's Query controller calls this service via the `genai.WorkspaceClient`:

1. Before execution: provisions the workspace, stores the workspace ID in a query annotation
2. Passes workspace path to the execution engine via `WorkspaceConfig` in the request
3. After execution: releases and cleans up the workspace
4. On query deletion: the finalizer calls cleanup as a safety net

The execution engines (Claude SDK, OpenAI SDK) receive the workspace path in `request.workspace.path` and use it as the agent's working directory. When the workspace field is present, the legacy label-based git configuration is skipped.

## API

| Endpoint                   | Method | Description                         |
| -------------------------- | ------ | ----------------------------------- |
| `/healthz`                 | GET    | Health check                        |
| `/workspaces/provision`    | POST   | Provision a new workspace           |
| `/workspaces/{id}/acquire` | POST   | Acquire workspace for a query       |
| `/workspaces/{id}/release` | POST   | Release workspace, finalize changes |
| `/workspaces/{id}`         | DELETE | Cleanup ephemeral workspace         |
| `/workspaces/{id}/status`  | GET    | Get workspace status                |

## Environment Patterns

The environment layer provides tools and runtime for agent execution. It's extracted from a Docker image into an `env/` subdirectory.

### Image Environment

Extracts the filesystem from a container image:

```json
{
  "environment": {
    "image": {
      "ref": "python:3.11-slim",
      "sourcePath": "/usr/local"
    }
  }
}
```

| Field           | Required | Default | Description                                  |
| --------------- | -------- | ------- | -------------------------------------------- |
| `ref`           | Yes      | -       | Docker image reference (e.g., `python:3.11`) |
| `sourcePath`    | No       | `/`     | Path within the image to extract             |
| `pullSecretRef` | No       | -       | Secret containing registry credentials       |

The provisioner:

1. Pulls the image
2. Creates a temporary container
3. Copies the filesystem (or `sourcePath` subtree) to `{workspace}/env/`
4. Removes the temporary container

### Workspace Reference

Inherits environment from an existing Workspace resource:

```json
{
  "environment": {
    "workspaceRef": {
      "name": "python-dev",
      "namespace": "default"
    }
  }
}
```

## Content Patterns

The content layer provides code and data for the agent to work on. Exactly one content type must be specified.

### Git

Clones a Git repository:

```json
{
  "content": {
    "git": {
      "url": "https://github.com/org/repo.git",
      "branch": "main",
      "depth": 1
    }
  }
}
```

| Field           | Required | Default | Description                                    |
| --------------- | -------- | ------- | ---------------------------------------------- |
| `url`           | Yes      | -       | Repository URL (HTTPS or SSH)                  |
| `branch`        | No       | `main`  | Branch to clone                                |
| `path`          | No       | -       | Subdirectory within the repo to use            |
| `sparsePaths`   | No       | -       | Paths for sparse checkout (reduces clone size) |
| `depth`         | No       | `1`     | Clone depth (1 = shallow, 0 = full history)    |
| `authSecretRef` | No       | -       | Secret containing `token` for HTTPS auth       |

**Authentication**: The `token` credential is injected into the URL based on host:

- GitHub: `https://x-access-token:{token}@github.com/...`
- GitLab: `https://oauth2:{token}@gitlab.com/...`
- Others: `https://{token}@host/...`

### Object Storage

Syncs content from cloud storage:

```json
{
  "content": {
    "objectStorage": {
      "provider": "s3",
      "bucket": "my-bucket",
      "prefix": "datasets/v1"
    }
  }
}
```

| Field           | Required | Default | Description                            |
| --------------- | -------- | ------- | -------------------------------------- |
| `provider`      | Yes      | -       | One of: `s3`, `gcs`, `azure`           |
| `bucket`        | Yes      | -       | Bucket or container name               |
| `prefix`        | No       | -       | Path prefix within the bucket          |
| `authSecretRef` | No       | -       | Secret containing provider credentials |

**Credentials by provider**:

| Provider | Secret Keys                                    |
| -------- | ---------------------------------------------- |
| `s3`     | `accessKeyId`, `secretAccessKey`, `region`     |
| `gcs`    | Uses workload identity or service account JSON |
| `azure`  | `storageAccount`, `storageKey`                 |

### Archive

Downloads and extracts an archive:

```json
{
  "content": {
    "archive": {
      "url": "https://example.com/project.tar.gz",
      "format": "tar.gz"
    }
  }
}
```

| Field           | Required | Default  | Description                               |
| --------------- | -------- | -------- | ----------------------------------------- |
| `url`           | Yes      | -        | URL to download the archive               |
| `format`        | No       | `tar.gz` | One of: `tar.gz`, `zip`                   |
| `authSecretRef` | No       | -        | Secret containing `token` for Bearer auth |

### Empty

Creates a blank workspace directory:

```json
{
  "content": {
    "empty": {}
  }
}
```

No configuration options. The workspace starts with an empty content directory.

## Auto-Commit

For Git-backed workspaces, changes can be automatically committed and pushed on release:

```json
{
  "autoCommit": {
    "enabled": true,
    "message": "Changes by Ark agent",
    "pushBranch": "agent-changes",
    "userName": "Ark Agent",
    "userEmail": "ark-agent@noreply.github.com"
  }
}
```

| Field        | Required | Default                        | Description                        |
| ------------ | -------- | ------------------------------ | ---------------------------------- |
| `enabled`    | No       | `false`                        | Enable auto-commit on release      |
| `message`    | No       | `Changes by Ark agent`         | Commit message                     |
| `pushBranch` | No       | -                              | Branch to push (if empty, no push) |
| `userName`   | No       | `Ark Agent`                    | Git committer name                 |
| `userEmail`  | No       | `ark-agent@noreply.github.com` | Git committer email                |

## Query Workspace Options

When configuring a workspace in a Query, additional options control behavior:

| Field | Default | Description |
| ------------- | ------------ | ------------------------------------------------- |
| `mountPath` | `/workspace` | Path where content is mounted for the agent |
| `persistent` | `true` | Keep workspace across query completions |
| `sessionId` | - | Resume a previous session (for persistent workspaces) |
| `ttl` | - | Time before workspace is cleaned up |

**Inline vs Reference**: Queries can define workspaces inline or reference a Workspace CR:

```yaml
# Inline workspace
spec:
  workspace:
    content:
      git:
        url: https://github.com/org/repo.git

# Reference with overrides
spec:
  workspace:
    ref:
      name: shared-workspace
    overrides:
      content:
        git:
          branch: feature-branch
```

## Storage Configuration

Configure the underlying PVC for workspace data:

```json
{
  "storage": {
    "size": "10Gi",
    "storageClass": "fast-ssd",
    "accessMode": "ReadWriteOnce"
  }
}
```

| Field          | Required | Default         | Description                                     |
| -------------- | -------- | --------------- | ----------------------------------------------- |
| `size`         | No       | `5Gi`           | PVC storage size                                |
| `storageClass` | No       | -               | Kubernetes storage class (uses cluster default) |
| `accessMode`   | No       | `ReadWriteOnce` | One of: `ReadWriteOnce`, `ReadWriteMany`        |

### Provision Request

```json
{
  "queryUid": "abc-123",
  "environment": {
    "image": { "ref": "python:3.11-slim" }
  },
  "content": {
    "git": {
      "url": "git@github.com:org/repo.git",
      "branch": "main"
    }
  },
  "persistent": true,
  "credentials": { "token": "ghp_xxx" }
}
```

### Provision Response

```json
{
  "id": "ws-uuid",
  "path": "/workspaces/ephemeral/abc-123/ws-uuid",
  "contentType": "git"
}
```

## Configuration

| Flag                    | Default       | Description                                 |
| ----------------------- | ------------- | ------------------------------------------- |
| `--addr`                | `:8090`       | HTTP listen address                         |
| `--base-path`           | `/workspaces` | Root directory for workspace storage        |
| `--orphan-grace-period` | `1h`          | Time before orphaned workspaces are removed |
