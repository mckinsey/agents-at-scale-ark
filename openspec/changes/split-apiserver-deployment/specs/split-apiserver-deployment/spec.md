## ADDED Requirements

### Requirement: Operator binary supports per-role startup

The ark-controller binary SHALL accept a `--role={combined,apiserver,controller}` flag. In `combined` mode the process behaves exactly as the current implementation (embedded aggregated API server + reconcilers + webhooks). In `apiserver` mode the process starts only the aggregated API server and the WAL consumer. In `controller` mode the process starts only the controller-runtime Manager (reconcilers + webhooks) and communicates with the aggregated API via a standard Kubernetes client.

#### Scenario: combined mode preserves current behaviour

- **WHEN** the binary is started with `--role=combined` or no role flag
- **THEN** both the aggregated API server and the reconcilers run in the same process, using the same leader-election Lease as today
- **AND** no behaviour visible to Helm charts, CLI, or clients changes

#### Scenario: apiserver role skips reconcilers

- **WHEN** the binary is started with `--role=apiserver`
- **THEN** `setupEmbeddedApiserver()` runs and the API server binds its port
- **AND** the WAL consumer is started behind leader-election against `ark-apiserver-leader` Lease
- **AND** no reconcilers, webhooks, or controller-runtime caches are started
- **AND** non-leader replicas serve read traffic without running the WAL consumer

#### Scenario: controller role skips apiserver

- **WHEN** the binary is started with `--role=controller`
- **THEN** controller-runtime Manager starts with reconcilers and webhooks
- **AND** `setupEmbeddedApiserver()` does NOT run
- **AND** the Manager's k8s client reaches the aggregated API via kube-apiserver → APIService proxy → `ark-apiserver` Service
- **AND** leader election uses the `ark-controller-leader` Lease

### Requirement: Helm chart renders two Deployments when split is enabled

The `ark/dist/chart` chart SHALL accept a `deployment.split` boolean value (default `false`). When `deployment.split=true` and `storage.backend=postgresql`, the chart renders two Deployments: `ark-apiserver` and `ark-controller`. When `deployment.split=false` (or `storage.backend=etcd`), the chart renders a single `ark-controller` Deployment as today.

#### Scenario: combined mode renders one Deployment

- **WHEN** `helm install ark-controller ark/dist/chart --set deployment.split=false`
- **THEN** a single `ark-controller` Deployment is rendered, running `--role=combined`
- **AND** the `ark-apiserver` Service selector points to pods labelled `app.kubernetes.io/name=ark-controller`

#### Scenario: split mode renders two Deployments with ordered startup

- **WHEN** `helm install ark-controller ark/dist/chart --set deployment.split=true --set storage.backend=postgresql`
- **THEN** an `ark-apiserver` Deployment is rendered running `--role=apiserver`
- **AND** an `ark-controller` Deployment is rendered running `--role=controller`
- **AND** the `ark-controller` Deployment includes an init container `wait-for-apiserver` that blocks on APIService `Available=True`
- **AND** the `ark-apiserver` Service selector points to pods labelled `app.kubernetes.io/name=ark-apiserver`
- **AND** a Helm post-install hook blocks chart completion until the APIService reports `Available=True`

#### Scenario: upgrading from combined to split preserves cluster state

- **WHEN** `helm upgrade` is run on a cluster currently running `deployment.split=false` with existing Agent/Model/Query resources, with `--set deployment.split=true`
- **THEN** the upgrade succeeds without data loss
- **AND** existing resources remain queryable via the aggregated API both during and after the upgrade
- **AND** reconciliation of existing resources resumes without manual intervention

### Requirement: Per-role readiness probes distinguish API serving from reconciler liveness

Each Deployment SHALL expose a `/readyz` endpoint that reports readiness specific to its role. `ark-apiserver` SHALL return 200 only when the PG connection is established and the aggregated API is serving. `ark-controller` SHALL return 200 only when informer caches are fully synced and at least one reconciliation has completed on each registered CRD.

#### Scenario: apiserver not ready while PG is reconnecting

- **WHEN** the `ark-apiserver` pod loses its PG connection
- **THEN** `/readyz` returns non-200 until reconnection completes
- **AND** the Deployment `Ready` condition flips to `False`
- **AND** clients see `APIService Available=False` until recovery

#### Scenario: controller not ready while informers are syncing

- **WHEN** the `ark-controller` pod starts and its informers are still synchronising
- **THEN** `/readyz` returns non-200 until cache sync completes and one reconcile cycle has been observed on each CRD
- **AND** the Deployment `Ready` condition remains `False` during this window

### Requirement: CLI readiness checks collapse to per-Deployment waits when split is enabled

The `ark-cli` `readinessChecks.ts` module SHALL detect whether the cluster is running in split mode (by checking for a Deployment named `ark-apiserver` in the `ark-system` namespace) and SHALL skip the probe Model check (`waitForControllerReconciling`) in that case. The existing deployment readiness layer (layer 0) SHALL include `ark-apiserver` as a core service when split is detected.

#### Scenario: CLI against a split-mode cluster skips the probe Model

- **WHEN** `ark status --wait-for-ready=60s` runs against a cluster with both `ark-apiserver` and `ark-controller` Deployments present
- **THEN** layers 0-4 run as today (deployments, APIServices, API group, aggregated API stable)
- **AND** layer 5 (probe Model) is skipped
- **AND** no `ark-readiness-probe` namespace is created
- **AND** the `ark status` output reports readiness as soon as both Deployments' `Ready` conditions are `True` and layers 1-4 pass

#### Scenario: CLI against a combined-mode cluster retains today's behaviour

- **WHEN** `ark status --wait-for-ready=60s` runs against a cluster with only the `ark-controller` Deployment (no `ark-apiserver` Deployment)
- **THEN** layer 5 (probe Model) runs as it does today
- **AND** the `ark-readiness-probe` namespace is created and deleted as part of the check

### Requirement: WAL consumer remains singleton across apiserver replicas

When the `ark-apiserver` Deployment has more than one replica, exactly one replica at a time SHALL run the WAL consumer. Leader election via the `ark-apiserver-leader` Lease determines the WAL-consumer replica. Non-leader replicas SHALL serve read traffic normally but SHALL NOT open a PG logical replication slot.

#### Scenario: apiserver replica loses leader election

- **WHEN** the replica currently running the WAL consumer loses the `ark-apiserver-leader` Lease (e.g., pod restart)
- **THEN** the WAL consumer is shut down cleanly and the replication slot is released
- **AND** another replica acquires the Lease and starts the WAL consumer on a fresh replication slot
- **AND** no change events are lost or delivered twice across the switchover
