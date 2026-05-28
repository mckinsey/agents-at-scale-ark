## ADDED Requirements

### Requirement: Workspace CRD represents a namespace's byte-store

A new namespaced CRD `workspaces.ark.mckinsey.com` SHALL be defined. The CR's `spec.address` SHALL be a `ValueSource` (the same shape used by `MCPServer.spec.address` and other Ark resources — accepting `value`, `valueFrom.configMapKeyRef`, `valueFrom.secretKeyRef`, or `valueFrom.serviceRef`). The spec MAY include `spec.maxFileBytes` and `spec.denyList` (MIME-type security deny-list).

#### Scenario: Valid Workspace CR accepted

- **WHEN** a `Workspace` is created with a valid `spec.address` (e.g., `valueFrom.serviceRef` pointing at a Service in the same namespace, or a literal `value` URL)
- **THEN** the webhook SHALL accept the resource
- **AND** the controller SHALL set `status.conditions[Ready]=True` once the referenced address is reachable

#### Scenario: Workspace without resolvable address rejected

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

#### Scenario: Webhook race for duplicate Workspaces resolved defensively

- **WHEN** two `Workspace` CRs somehow exist concurrently in the same namespace (e.g., webhook unavailable during creation, manual apply bypassing the gate)
- **THEN** the controller SHALL select the Workspace with the oldest `creationTimestamp` as the active one
- **AND** SHALL emit a Kubernetes Event on the loser referencing the winner and recommending deletion of the duplicate

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

### Requirement: File feature requires a Workspace CR

ark-api SHALL NOT provide a built-in default workspace. When no `Workspace` CR exists in a namespace, `/v1/files` endpoints SHALL return HTTP 404 with an explanatory body directing the caller to install a workspace implementation from the marketplace (e.g., file-gateway).

#### Scenario: Files endpoint returns 404 without Workspace CR

- **WHEN** a namespace has no `Workspace` CR
- **AND** a caller requests any `/v1/files` route (LIST, POST, GET, DELETE, prewarm)
- **THEN** ark-api SHALL return HTTP 404
- **AND** the response body SHALL include guidance pointing at marketplace install instructions

#### Scenario: Installing a Workspace CR enables the file feature

- **WHEN** a `Workspace` CR is created in a namespace that previously had no CR
- **AND** the Workspace's referenced service becomes reachable (`status.conditions[Ready]=True`)
- **AND** ark-api receives a subsequent `/v1/files` request in that namespace
- **THEN** ark-api SHALL route the request to the Workspace's service

### Requirement: ark-api enforces path and size validation

ark-api SHALL sanitize and validate file paths and sizes before forwarding to any workspace. The following rules SHALL apply:

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
