## ADDED Requirements

### Requirement: Operator binary requires explicit role

The ark-controller binary SHALL accept a required `--role={apiserver,controller}` flag. In `apiserver` mode the process starts only the aggregated API server and the WAL consumer. In `controller` mode the process starts only the controller-runtime Manager (reconcilers + webhooks) and communicates with the aggregated API via a standard Kubernetes client. The binary SHALL fail fast with a clear error message if the flag is missing or has an unrecognised value.

#### Scenario: apiserver role skips reconcilers

- **WHEN** the binary is started with `--role=apiserver`
- **THEN** `setupEmbeddedApiserver()` runs and the API server binds its port
- **AND** the WAL consumer is started behind leader-election against `ark-apiserver-leader` Lease
- **AND** no reconcilers, webhooks, or controller-runtime caches are started
- **AND** non-leader replicas serve read traffic without opening a PG replication slot

#### Scenario: controller role skips apiserver

- **WHEN** the binary is started with `--role=controller`
- **THEN** controller-runtime Manager starts with reconcilers and webhooks
- **AND** `setupEmbeddedApiserver()` does NOT run
- **AND** the Manager's k8s client reaches the aggregated API via kube-apiserver → APIService proxy → `ark-apiserver` Service
- **AND** leader election uses the `ark-controller-leader` Lease

#### Scenario: missing role flag fails the process

- **WHEN** the binary is started without `--role`
- **THEN** the process exits with a non-zero status and a log message indicating the flag is required

### Requirement: Helm chart renders topology per backend

On `storage.backend=etcd`, the chart SHALL render a single `ark-controller` Deployment running `--role=controller` and no `ark-apiserver` Deployment, Service, or APIService. On `storage.backend=postgresql`, the chart SHALL additionally render an `ark-apiserver` Deployment, an `ark-apiserver` Service with selector `app.kubernetes.io/name=ark-apiserver`, and an `APIService` resource targeting that Service.

#### Scenario: etcd backend renders a single Deployment

- **WHEN** `helm install ark-controller ark/dist/chart --set storage.backend=etcd`
- **THEN** one `ark-controller` Deployment is rendered, running `--role=controller`
- **AND** no `ark-apiserver` Deployment, Service, or APIService is present
- **AND** existing etcd-backend functionality is unchanged

#### Scenario: postgresql backend renders two Deployments with ordered startup

- **WHEN** `helm install ark-controller ark/dist/chart --set storage.backend=postgresql`
- **THEN** an `ark-apiserver` Deployment is rendered running `--role=apiserver`
- **AND** an `ark-controller` Deployment is rendered running `--role=controller`
- **AND** the `ark-apiserver` Service has selector `app.kubernetes.io/name=ark-apiserver`
- **AND** the `ark-controller` Deployment includes an init container `wait-for-apiserver` that blocks on APIService `Available=True`
- **AND** a Helm pre-upgrade hook ensures the APIService is `Available` before the controller rollout proceeds

#### Scenario: upgrading from embedded topology to split preserves cluster state

- **WHEN** `helm upgrade` runs on a cluster currently running the embedded topology (single `ark-controller` Deployment with `storage.backend=postgresql`) with existing Agent/Model/Query resources
- **THEN** the upgrade succeeds without data loss
- **AND** existing resources remain queryable via the aggregated API throughout the upgrade (no window where the APIService is unavailable)
- **AND** reconciliation of existing resources resumes on the new `ark-controller` Deployment without manual intervention

### Requirement: Per-role readiness probes distinguish API serving from reconciler liveness

Each Deployment SHALL expose a `/readyz` endpoint specific to its role. `ark-apiserver` SHALL return 200 only when the PG connection is established and the aggregated API is serving. `ark-controller` SHALL return 200 only when informer caches are fully synced and at least one reconciliation has completed on each registered CRD.

#### Scenario: apiserver not ready while PG is reconnecting

- **WHEN** the `ark-apiserver` pod loses its PG connection
- **THEN** `/readyz` returns non-200 until reconnection completes
- **AND** the Deployment `Ready` condition flips to `False`
- **AND** clients see `APIService Available=False` until recovery

#### Scenario: controller not ready while informers are syncing

- **WHEN** the `ark-controller` pod starts and its informers are still synchronising
- **THEN** `/readyz` returns non-200 until cache sync completes and one reconcile cycle has been observed on each CRD
- **AND** the Deployment `Ready` condition remains `False` during this window

### Requirement: CLI readiness checks rely on per-Deployment waits on PostgreSQL

The `ark-cli` `readinessChecks.ts` module SHALL treat `ark-apiserver` as a core service when the PostgreSQL backend is detected (no `agents.ark.mckinsey.com` CRD present). Layer 0 (`waitForServicesReady`) SHALL cover both `ark-apiserver` and `ark-controller`. The probe Model code path (`waitForControllerReconciling`, `ark-readiness-probe` namespace, apply/delete logic) SHALL be removed.

#### Scenario: CLI against a PostgreSQL cluster waits on both Deployments

- **WHEN** `ark status --wait-for-ready=60s` runs against a cluster with `storage.backend=postgresql`
- **THEN** layer 0 waits for both `ark-apiserver` and `ark-controller` Deployment `Ready` conditions
- **AND** layers for APIServices available and API group registered still run as integration sanity
- **AND** no `ark-readiness-probe` namespace is created
- **AND** the command exits 0 as soon as both Deployments are Ready and the APIService is Available

#### Scenario: CLI against an etcd cluster waits on controller only

- **WHEN** `ark status --wait-for-ready=60s` runs against a cluster with `storage.backend=etcd`
- **THEN** layer 0 waits for `ark-controller` Deployment `Ready` condition
- **AND** no APIService / API-group / aggregated-API layers run
- **AND** the command exits 0 as soon as the controller Deployment is Ready

### Requirement: WAL consumer remains singleton across apiserver replicas

When the `ark-apiserver` Deployment has more than one replica, exactly one replica at a time SHALL run the WAL consumer. Leader election via the `ark-apiserver-leader` Lease determines the WAL-consumer replica. Non-leader replicas SHALL serve read traffic normally but SHALL NOT open a PG logical replication slot.

#### Scenario: apiserver replica loses leader election

- **WHEN** the replica currently running the WAL consumer loses the `ark-apiserver-leader` Lease (e.g., pod restart)
- **THEN** the WAL consumer is shut down cleanly and the replication slot is released
- **AND** another replica acquires the Lease and starts the WAL consumer on a fresh replication slot
- **AND** no change events are lost or delivered twice across the switchover
