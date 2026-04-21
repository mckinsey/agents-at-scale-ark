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

### Requirement: Two separate Helm charts own the two Deployments

The `ark/dist/chart` chart (`ark-controller`) SHALL render only the controller Deployment, CRDs, webhooks, and controller-side RBAC. The `ark/dist/chart-apiserver` chart (`ark-apiserver`) SHALL render the apiserver Deployment, the `ark-apiserver` Service, the `APIService` CR, and the apiserver-side RBAC. On etcd, only the `ark-controller` chart is installed. On PostgreSQL, both charts are installed, with `ark-apiserver` first.

#### Scenario: etcd backend is a single-chart install

- **WHEN** `helm install ark-controller ark/dist/chart --set storage.backend=etcd`
- **THEN** one `ark-controller` Deployment is rendered, running `--role=controller`
- **AND** no `ark-apiserver` Deployment, Service, APIService, or chart installation is present
- **AND** existing etcd-backend functionality is unchanged

#### Scenario: postgresql backend is a two-chart install with ordered startup

- **WHEN** `helm install ark-apiserver ark/dist/chart-apiserver --wait` completes
- **AND** `helm install ark-controller ark/dist/chart --set storage.backend=postgresql` runs
- **THEN** the `ark-apiserver` Deployment is running `--role=apiserver`
- **AND** the `ark-controller` Deployment is running `--role=controller`
- **AND** the `ark-apiserver` Service has selector `app.kubernetes.io/name=ark-apiserver`
- **AND** the `APIService` CR targeting `ark-system/ark-apiserver` is present and `Available=True`
- **AND** the `ark-controller` Deployment includes an init container `wait-for-apiserver` that blocks on APIService `Available=True` for any pod restart after install

#### Scenario: upgrading from embedded topology to split preserves cluster state

- **WHEN** `helm install ark-apiserver ark/dist/chart-apiserver --wait` runs on a cluster currently running the embedded topology (single `ark-controller` Deployment with `storage.backend=postgresql`), followed by `helm upgrade ark-controller ark/dist/chart` with the new chart version
- **THEN** the two-step upgrade succeeds without data loss
- **AND** the `APIService` endpoints flip from the old controller pods to the new apiserver pods during step 1, with no window where the APIService is unavailable
- **AND** existing Agent/Model/Query resources remain queryable via the aggregated API throughout the upgrade
- **AND** reconciliation of existing resources resumes on the new `ark-controller` Deployment after step 2 without manual intervention
- **AND** `helm rollback` on either chart reverses its side of the migration independently

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
