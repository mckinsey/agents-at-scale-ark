## ADDED Requirements

### Requirement: Workspace CRD represents a namespace's byte-store

A new namespaced CRD `workspaces.ark.mckinsey.com` SHALL be defined. The CR's spec SHALL reference a service implementing the Workspace HTTP contract via a `ValueSource` `serviceRef`, and MAY include `spec.maxFileBytes` and `spec.denyList` (MIME-type security deny-list).

#### Scenario: Valid Workspace CR accepted

- **WHEN** a `Workspace` is created with a valid `spec.address.valueFrom.serviceRef` pointing at a Service in the same namespace
- **THEN** the webhook SHALL accept the resource
- **AND** the controller SHALL set `status.conditions[Ready]=True` once the referenced Service is reachable

#### Scenario: Workspace without serviceRef rejected

- **WHEN** a `Workspace` is created without a resolvable address
- **THEN** the webhook SHALL reject the resource with an error naming the missing field

### Requirement: At most one Workspace per namespace

A validating webhook SHALL reject creation of a second `Workspace` resource in a namespace that already contains one. The error message SHALL name the existing Workspace.

#### Scenario: Second Workspace creation rejected

- **WHEN** a namespace already contains a `Workspace` named "primary"
- **AND** a user attempts to create a second `Workspace` named "secondary"
- **THEN** the webhook SHALL reject the request with an error referencing "primary"

#### Scenario: Workspace replaceable after deletion

- **WHEN** the existing "primary" `Workspace` is deleted
- **AND** a new `Workspace` "secondary" is created in the same namespace
- **THEN** the webhook SHALL accept the creation

### Requirement: Workspace HTTP contract

A service referenced by a `Workspace` CR SHALL expose the following endpoints with the documented semantics. ark-api SHALL be the sole authoritative caller in v1.

- `GET /files?prefix=<p>&continuation=<t>` — list files matching prefix, paginated
- `POST /files` — multipart upload (fields: `file`, `prefix`), returns `{ key, etag, size, last_modified }`
- `GET /files/<key>` — metadata for a single file
- `GET /files/<key>/content` — stream bytes (workspace MAY name this differently as long as the contract is documented)
- `DELETE /files/<key>` — delete a single file

#### Scenario: Workspace list returns files and directories

- **WHEN** ark-api calls `GET /files?prefix=documents/` against a workspace containing `documents/report.pdf`
- **THEN** the workspace SHALL return a response containing the file's key, size, etag, and last-modified timestamp

#### Scenario: Workspace upload returns etag

- **WHEN** ark-api forwards a multipart upload to the workspace
- **THEN** the response SHALL include the stored key and an etag stable for the uploaded bytes

#### Scenario: Workspace delete idempotent

- **WHEN** ark-api calls `DELETE /files/missing.pdf` against a workspace where the file is absent
- **THEN** the workspace SHALL return a success status (no error for already-absent files)

### Requirement: URI scheme identifies workspace files

Files in a workspace SHALL be addressable using the URI form `ark://workspace/<path>`, where `<path>` is the workspace key including any subfolders separated by `/`. The URI SHALL be resolved against the caller's (or Query's) namespace.

#### Scenario: Upload returns canonical URI

- **WHEN** ark-api accepts an upload of `prefix=documents/` and filename `report.pdf`
- **THEN** the response SHALL include `uri: "ark://workspace/documents/report.pdf"`

#### Scenario: Cross-namespace URI not supported in v1

- **WHEN** a Query in namespace "X" references `ark://workspace/...`
- **THEN** the controller SHALL resolve the URI against namespace "X" only
- **AND** the controller SHALL NOT attempt to resolve URIs against other namespaces

### Requirement: Built-in default workspace when no CR exists

When no `Workspace` CR exists in a namespace, ark-api SHALL serve `/v1/files` requests using a built-in default workspace. The built-in SHALL be discoverable to callers via the same routes; SHALL surface a "default workspace; install file-gateway for persistent storage" banner field in list responses; AND SHALL be transparently replaced when a `Workspace` CR is later created.

The built-in workspace's durability characteristics (in-memory, emptyDir, or PVC) are an implementation detail; the contract guarantees only that uploads, listings, and downloads work for the lifetime of a single ark-api instance, with a small total capacity cap.

#### Scenario: Files endpoint works in a namespace without Workspace CR

- **WHEN** a namespace has no `Workspace` CR
- **AND** a caller POSTs to `/v1/files`
- **THEN** ark-api SHALL accept the upload using the built-in default workspace
- **AND** the response SHALL include a banner indicating the default workspace is in use

#### Scenario: Installing a Workspace CR transparently replaces the default

- **WHEN** a `Workspace` CR is created in a namespace that previously had no CR
- **AND** ark-api receives a subsequent `/v1/files` request in that namespace
- **THEN** ark-api SHALL route the request to the new Workspace's service
- **AND** SHALL NOT route to the built-in default workspace

#### Scenario: Built-in size cap enforced

- **WHEN** the built-in default workspace has reached its configured total capacity
- **AND** a caller attempts a further upload
- **THEN** ark-api SHALL return HTTP 507 (Insufficient Storage) with a message recommending file-gateway installation

### Requirement: ark-api enforces path and size validation

ark-api SHALL sanitize and validate file paths and sizes before forwarding to any workspace (built-in or external). The following rules SHALL apply:

- Reject leading `/`
- Reject `..` and `.` as path segments
- Reject null and control characters
- Reject `\` (backslash)
- Normalize to UTF-8 NFC
- Collapse repeated `/` to a single `/`
- Trim leading/trailing whitespace from each segment
- Reject empty path after sanitization
- Reject paths exceeding 1024 characters
- Reject paths with more than 16 segments
- Reject files exceeding the Workspace's `spec.maxFileBytes` (default 25 MiB)

#### Scenario: Path with traversal segment rejected

- **WHEN** a caller uploads with `prefix="../"`
- **THEN** ark-api SHALL return HTTP 422 with a message naming the traversal rule

#### Scenario: Path with control character rejected

- **WHEN** a filename contains a null byte
- **THEN** ark-api SHALL return HTTP 422 before forwarding to the workspace

#### Scenario: File above size cap rejected

- **WHEN** a workspace has `spec.maxFileBytes: 1048576` (1 MiB)
- **AND** a caller uploads a 2 MiB file
- **THEN** ark-api SHALL return HTTP 413 (Payload Too Large)

### Requirement: Workspace status reports readiness

The controller SHALL maintain `status.conditions` on each Workspace CR including a `Ready` condition. Ready SHALL be `True` when the referenced service is reachable on its health endpoint and `False` otherwise, with a reason and message describing the underlying cause.

#### Scenario: Unreachable workspace service marks NotReady

- **WHEN** the service referenced by a `Workspace` CR returns connection errors
- **THEN** within the reconciler's poll interval, `status.conditions[Ready]` SHALL be `False`
- **AND** the reason SHALL identify a connectivity failure
